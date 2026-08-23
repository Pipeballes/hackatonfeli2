import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { CheckoutPreview, CheckoutReceipt, CheckoutWalletGateway, WalletPair, WalletProfile } from "../application/checkout-wallet.js";

export interface WdkCliCheckoutConfig {
  clientWallet: string;
  businessWallet: string;
  arsPerUsdt: number;
  previewTtlMs?: number;
  executable?: string;
  tokenTicker?: string;
}

export interface CliRunResult { stdout: string; stderr: string; }
export type CliRunner = (args: string[]) => Promise<CliRunResult>;
type StoredPreview = CheckoutPreview & { totalInCents: number; used: boolean };
const walletNamePattern = /^[A-Za-z0-9_-]{1,48}$/;

export class WdkCliCheckoutGateway implements CheckoutWalletGateway {
  private readonly previews = new Map<string, StoredPreview>();
  private readonly previewTtlMs: number;
  private readonly runner: CliRunner;
  private readonly tokenTicker: string;

  constructor(private readonly config: WdkCliCheckoutConfig, runner?: CliRunner) {
    if (!walletNamePattern.test(config.clientWallet) || !walletNamePattern.test(config.businessWallet)) throw new Error("Los nombres de wallet WDK no son válidos.");
    if (!Number.isFinite(config.arsPerUsdt) || config.arsPerUsdt <= 0) throw new Error("DEMO_ARS_PER_USDT debe ser positivo.");
    this.previewTtlMs = config.previewTtlMs ?? 120_000;
    this.tokenTicker = (config.tokenTicker ?? process.env.WDK_CLI_TOKEN ?? "usdt").toLowerCase();
    if (!/^[a-z0-9_-]{1,24}$/.test(this.tokenTicker)) throw new Error("El ticker WDK CLI no es válido.");
    this.runner = runner ?? createWdkCliRunner(config.executable ?? process.env.WDK_CLI_BIN ?? "wdk");
  }

  async getWallets(): Promise<WalletPair> {
    const walletList = await this.runJson(["wallet", "list", "--json"]);
    const [client, business] = await Promise.all([
      this.snapshot("CLIENT", this.config.clientWallet, walletList),
      this.snapshot("BUSINESS", this.config.businessWallet, walletList),
    ]);
    return { client, business };
  }

  async preview(totalInCents: number): Promise<CheckoutPreview> {
    this.validateAmount(totalInCents);
    const wallets = await this.getWallets();
    if (wallets.client.unlocked === false) throw new Error(`La wallet ${wallets.client.walletName} está bloqueada. Desbloqueala antes de pagar.`);
    if (wallets.business.unlocked === false) throw new Error(`La wallet ${wallets.business.walletName} está bloqueada. Desbloqueala antes de la demo.`);
    if (!wallets.client.address || !wallets.business.address) throw new Error("WDK CLI no devolvió las direcciones de las wallets de demo.");

    const amount = this.toUsdt(totalInCents);
    const cliResult = await this.runJson([
      "send", "--network", "sepolia", "--to", wallets.business.address,
      "--amount", amount, "--token", this.tokenTicker, "--wallet", wallets.client.walletName,
      "--dry-run", "--json",
    ]);

    const preview: StoredPreview = {
      previewId: randomUUID(), expiresAt: new Date(Date.now() + this.previewTtlMs).toISOString(),
      network: "sepolia", asset: "USDT",
      fromWallet: wallets.client.walletName, fromAddress: wallets.client.address,
      toWallet: wallets.business.walletName, toAddress: wallets.business.address,
      amount, balanceBefore: { client: wallets.client.balance, business: wallets.business.balance },
      dryRun: true, cliResult, totalInCents, used: false,
    };
    this.previews.set(preview.previewId, preview);
    return this.publicPreview(preview);
  }

  async execute(previewId: string, totalInCents: number): Promise<CheckoutReceipt> {
    this.validateAmount(totalInCents);
    const preview = this.previews.get(previewId);
    if (!preview) throw new Error("El preview WDK no existe o el servidor se reinició. Generá uno nuevo.");
    if (preview.used) throw new Error("Este preview WDK ya fue utilizado.");
    if (Date.parse(preview.expiresAt) < Date.now()) { this.previews.delete(previewId); throw new Error("El preview WDK venció. Generá uno nuevo antes de confirmar."); }
    if (preview.totalInCents !== totalInCents) throw new Error("El monto cambió después del preview. Generá uno nuevo.");

    // Mark before broadcast so a double click/retry cannot produce two sends.
    preview.used = true;
    const cliResult = await this.runJson([
      "send", "--network", "sepolia", "--to", preview.toAddress,
      "--amount", preview.amount, "--token", this.tokenTicker, "--wallet", preview.fromWallet, "--json",
    ]);
    const walletsAfter = await this.getWallets();
    return {
      previewId, network: "sepolia", asset: "USDT",
      fromWallet: preview.fromWallet, fromAddress: preview.fromAddress,
      toWallet: preview.toWallet, toAddress: preview.toAddress, amount: preview.amount,
      transactionHash: findByKeys(cliResult, ["transactionHash", "txHash", "hash", "id"]),
      balanceBefore: preview.balanceBefore,
      balanceAfter: { client: walletsAfter.client.balance, business: walletsAfter.business.balance },
      broadcast: true, cliResult,
    };
  }

  private async snapshot(role: WalletProfile["role"], walletName: string, walletList: unknown): Promise<WalletProfile> {
    const unlocked = findWalletUnlocked(walletList, walletName);
    try {
      const [addressResult, balanceResult] = await Promise.all([
        this.runJson(["get", "address", "--network", "sepolia", "--wallet", walletName, "--json"]),
        this.runJson(["get", "balance", "--network", "sepolia", "--token", this.tokenTicker, "--wallet", walletName, "--json"]),
      ]);
      return {
        role, walletName, network: "sepolia", asset: "USDT",
        address: findByKeys(addressResult, ["address"]) ?? "",
        balance: findByKeys(balanceResult, ["amount", "balance", "tokenBalance"]) ?? null,
        unlocked,
      };
    } catch (error) {
      if (unlocked === false) return { role, walletName, network: "sepolia", asset: "USDT", address: "", balance: null, unlocked };
      throw error;
    }
  }

  private async runJson(args: string[]) {
    const result = await this.runner(args);
    const text = result.stdout.trim();
    if (!text) throw new Error(`WDK CLI no devolvió JSON. ${result.stderr.trim()}`.trim());
    try {
      const parsed = JSON.parse(text) as unknown;
      const errorCode = findByKeys(parsed, ["code"]);
      if (errorCode && /error|invalid|locked|insufficient/i.test(errorCode)) throw new Error(findByKeys(parsed, ["message"]) ?? `WDK CLI: ${errorCode}`);
      return parsed;
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error(`No se pudo interpretar la respuesta JSON de WDK CLI: ${text.slice(0, 240)}`);
      throw error;
    }
  }

  private validateAmount(totalInCents: number) {
    if (!Number.isInteger(totalInCents) || totalInCents <= 0) throw new Error("El total a pagar debe ser un entero positivo en centavos.");
  }

  private toUsdt(totalInCents: number) {
    const amount = (totalInCents / 100) / this.config.arsPerUsdt;
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("No se pudo convertir el total a USDt de prueba.");
    return amount.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  }

  private publicPreview(preview: StoredPreview): CheckoutPreview {
    const { totalInCents: _totalInCents, used: _used, ...safe } = preview;
    return safe;
  }
}

export function createWdkCliRunner(executable: string): CliRunner {
  return (args) => new Promise((resolve, reject) => {
    for (const arg of args) if (/\r|\n/.test(arg)) return reject(new Error("Argumento WDK CLI inválido."));
    const child = spawn(executable, args, { windowsHide: true, shell: process.platform === "win32" });
    let stdout = ""; let stderr = ""; const max = 1_000_000;
    let settled = false;
    const finishReject = (error: Error) => { if (settled) return; settled = true; clearTimeout(timer); reject(error); };
    const timer = setTimeout(() => { child.kill(); finishReject(new Error("WDK CLI excedió el tiempo máximo de respuesta.")); }, 30_000);
    child.stdout.on("data", (chunk) => { stdout += String(chunk); if (stdout.length > max) child.kill(); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); if (stderr.length > max) child.kill(); });
    child.on("error", (error) => finishReject(new Error(`No se pudo ejecutar WDK CLI: ${error.message}`)));
    child.on("close", (code) => {
      if (settled) return; settled = true; clearTimeout(timer);
      if (stdout.length > max || stderr.length > max) return reject(new Error("La salida de WDK CLI superó el límite permitido."));
      if (code !== 0) return reject(new Error(extractCliError(stdout, stderr) ?? `WDK CLI terminó con código ${code}.`));
      resolve({ stdout, stderr });
    });
  });
}

function extractCliError(stdout: string, stderr: string) {
  for (const text of [stdout, stderr]) {
    const trimmed = text.trim(); if (!trimmed) continue;
    try { const parsed = JSON.parse(trimmed) as unknown; return findByKeys(parsed, ["message", "error", "code"]); } catch { /* readable CLI error */ }
  }
  return stderr.trim() || stdout.trim() || null;
}

function findByKeys(value: unknown, keys: string[]): string | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) { const found = findByKeys(item, keys); if (found) return found; }
    return null;
  }
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const direct = record[key];
    if (typeof direct === "string" || typeof direct === "number" || typeof direct === "bigint") return String(direct);
  }
  for (const nested of Object.values(record)) { const found = findByKeys(nested, keys); if (found) return found; }
  return null;
}

function findWalletUnlocked(value: unknown, walletName: string): boolean | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) { const found = findWalletUnlocked(item, walletName); if (found !== null) return found; }
    return null;
  }
  const record = value as Record<string, unknown>;
  if (record.name === walletName || record.walletName === walletName) {
    if (typeof record.unlocked === "boolean") return record.unlocked;
    if (typeof record.locked === "boolean") return !record.locked;
  }
  for (const nested of Object.values(record)) { const found = findWalletUnlocked(nested, walletName); if (found !== null) return found; }
  return null;
}
