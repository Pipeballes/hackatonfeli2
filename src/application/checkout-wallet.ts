export interface WalletProfile {
  role: "CLIENT" | "BUSINESS";
  walletName: string;
  network: "sepolia";
  asset: "USDT";
  address: string;
  balance: string | null;
  unlocked: boolean | null;
}

export interface WalletPair {
  client: WalletProfile;
  business: WalletProfile;
}

export interface CheckoutPreview {
  previewId: string;
  expiresAt: string;
  network: "sepolia";
  asset: "USDT";
  fromWallet: string;
  fromAddress: string;
  toWallet: string;
  toAddress: string;
  amount: string;
  balanceBefore: {
    client: string | null;
    business: string | null;
  };
  dryRun: true;
  cliResult: unknown;
}

export interface CheckoutReceipt {
  previewId: string;
  network: "sepolia";
  asset: "USDT";
  fromWallet: string;
  fromAddress: string;
  toWallet: string;
  toAddress: string;
  amount: string;
  transactionHash: string | null;
  balanceBefore: {
    client: string | null;
    business: string | null;
  };
  balanceAfter: {
    client: string | null;
    business: string | null;
  };
  broadcast: true;
  cliResult: unknown;
}

export interface CheckoutWalletGateway {
  getWallets(): Promise<WalletPair>;
  preview(totalInCents: number): Promise<CheckoutPreview>;
  execute(previewId: string, totalInCents: number): Promise<CheckoutReceipt>;
}
