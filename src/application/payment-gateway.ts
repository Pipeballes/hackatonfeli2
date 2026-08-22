export interface PaymentIntent {
  sessionId: string;
  tableNumber: number;
  paymentMode: "INDIVIDUAL" | "TABLE";
  dinerId?: string;
  subtotalInCents: number;
  tipInCents: number;
  totalInCents: number;
}

export interface PaymentEvaluation {
  provider: "WDK" | "SIMULATED_FALLBACK";
  decision: "ALLOW" | "DENY";
  reason: string;
  policyId: string;
  matchedRule: string;
  network: "ethereum-sepolia";
  asset: "USDt-testnet";
  amountInBaseUnits: string;
  broadcast: false;
}

export interface PaymentGateway {
  evaluate(intent: PaymentIntent): Promise<PaymentEvaluation>;
}
