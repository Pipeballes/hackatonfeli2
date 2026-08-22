import WDK, { type SimulationResult } from "@tetherto/wdk";
import WalletManagerEvm, { type EvmTransferOptions } from "@tetherto/wdk-wallet-evm";
import type { PaymentEvaluation, PaymentGateway, PaymentIntent } from "../application/payment-gateway.js";

interface WdkSimulationAccount {
  simulate: {
    transfer(options: EvmTransferOptions): Promise<SimulationResult>;
  };
}

export interface WdkPolicyConfig {
  merchantAddress: string;
  tokenAddress: string;
  arsPerUsdt: number;
  maxUsdtInBaseUnits: bigint;
}

const ruleReasons: Record<string, string> = {
  "allow-restaurant-payment": "La intención cumple las reglas del restaurante.",
  "deny-wrong-target": "El token o destinatario no pertenece al restaurante.",
  "deny-invalid-amount": "El monto debe ser mayor a cero.",
  "deny-over-limit": "El monto supera el límite permitido para la demostración.",
};

export class WdkPolicySimulationGateway implements PaymentGateway {
  constructor(private readonly config: WdkPolicyConfig) {
    if (!Number.isFinite(config.arsPerUsdt) || config.arsPerUsdt <= 0) throw new Error("La cotización simulada debe ser positiva.");
  }

  async evaluate(intent: PaymentIntent): Promise<PaymentEvaluation> {
    const amount = this.toTestUsdtBaseUnits(intent.totalInCents);
    const wdk = new WDK(WDK.getRandomSeedPhrase(12), { maxConditionTimeoutMs: 2_000 })
      .registerWallet("ethereum", WalletManagerEvm, { chainId: 11155111 })
      .registerPolicy({
        id: "mesa-abierta-testnet-payment",
        name: "Pagos de prueba de Mesa Abierta",
        scope: "project",
        wallet: "ethereum",
        rules: [
          {
            name: "allow-restaurant-payment",
            operation: "transfer",
            action: "ALLOW",
            reason: "Pago de restaurante permitido",
            conditions: [({ args }) => {
              const transfer = args[0] as EvmTransferOptions | undefined;
              return transfer?.token.toLowerCase() === this.config.tokenAddress.toLowerCase()
                && transfer.recipient.toLowerCase() === this.config.merchantAddress.toLowerCase()
                && typeof transfer.amount === "bigint"
                && transfer.amount > 0n
                && transfer.amount <= this.config.maxUsdtInBaseUnits;
            }],
          },
          {
            name: "deny-wrong-target",
            operation: "transfer",
            action: "DENY",
            reason: "Destinatario o token no autorizado",
            conditions: [({ args }) => {
              const transfer = args[0] as EvmTransferOptions | undefined;
              return !transfer
                || transfer.token.toLowerCase() !== this.config.tokenAddress.toLowerCase()
                || transfer.recipient.toLowerCase() !== this.config.merchantAddress.toLowerCase();
            }],
          },
          {
            name: "deny-invalid-amount",
            operation: "transfer",
            action: "DENY",
            reason: "Monto inválido",
            conditions: [({ args }) => {
              const amount = (args[0] as EvmTransferOptions | undefined)?.amount;
              return typeof amount !== "bigint" || amount <= 0n;
            }],
          },
          {
            name: "deny-over-limit",
            operation: "transfer",
            action: "DENY",
            reason: "Monto superior al límite de la demo",
            conditions: [({ args }) => {
              const amount = (args[0] as EvmTransferOptions | undefined)?.amount;
              return typeof amount === "bigint" && amount > this.config.maxUsdtInBaseUnits;
            }],
          },
        ],
      });

    try {
      const account = await wdk.getAccount("ethereum", 0) as unknown as WdkSimulationAccount;
      const result = await account.simulate.transfer({
        token: this.config.tokenAddress,
        recipient: this.config.merchantAddress,
        amount,
      });
      const matchedRule = result.matched_rule ?? "no-applicable-rule";
      return {
        provider: "WDK",
        decision: result.decision,
        reason: ruleReasons[matchedRule] ?? result.reason ?? "WDK no informó el motivo de la decisión.",
        policyId: result.policy_id ?? "mesa-abierta-testnet-payment",
        matchedRule,
        network: "ethereum-sepolia",
        asset: "USDt-testnet",
        amountInBaseUnits: amount.toString(),
        broadcast: false,
      };
    } finally {
      wdk.dispose();
    }
  }

  private toTestUsdtBaseUnits(amountInCents: number) {
    const ars = amountInCents / 100;
    return BigInt(Math.max(0, Math.round((ars / this.config.arsPerUsdt) * 1_000_000)));
  }
}

export class ResilientPaymentGateway implements PaymentGateway {
  constructor(private readonly primary: PaymentGateway, private readonly fallback: PaymentGateway) {}

  async evaluate(intent: PaymentIntent): Promise<PaymentEvaluation> {
    try {
      return await this.primary.evaluate(intent);
    } catch {
      return this.fallback.evaluate(intent);
    }
  }
}

export class SimulatedFallbackGateway implements PaymentGateway {
  async evaluate(intent: PaymentIntent): Promise<PaymentEvaluation> {
    return {
      provider: "SIMULATED_FALLBACK",
      decision: intent.totalInCents > 0 ? "ALLOW" : "DENY",
      reason: "WDK no estuvo disponible; se aplicó la política determinista de respaldo.",
      policyId: "mesa-abierta-fallback",
      matchedRule: intent.totalInCents > 0 ? "allow-positive-total" : "deny-invalid-amount",
      network: "ethereum-sepolia",
      asset: "USDt-testnet",
      amountInBaseUnits: "0",
      broadcast: false,
    };
  }
}
