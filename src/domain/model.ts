export type SessionStatus = "OPEN" | "BILL_REQUESTED" | "CLOSED";
export type OrderStatus = "RECEIVED" | "PREPARING" | "READY" | "DELIVERED";
export type OrderType = "INITIAL" | "ADDITIONAL";
export type PaymentMode = "INDIVIDUAL" | "TABLE";

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  category: string;
  priceInCents: number;
  available: boolean;
}

export interface Diner {
  id: string;
  name: string;
  joinedAt: string;
}

export interface OrderItem {
  menuItemId: string;
  name: string;
  unitPriceInCents: number;
  quantity: number;
  note?: string;
}

export interface Order {
  id: string;
  sessionId: string;
  dinerId: string;
  type: OrderType;
  status: OrderStatus;
  items: OrderItem[];
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SimulatedPayment {
  id: string;
  mode: PaymentMode;
  dinerId?: string;
  subtotalInCents: number;
  tipPercent: number;
  tipInCents: number;
  totalInCents: number;
  status: "SIMULATED_APPROVED";
  policyEvaluation: {
    provider: "WDK" | "SIMULATED_FALLBACK";
    decision: "ALLOW";
    reason: string;
    policyId: string;
    matchedRule: string;
    network: "ethereum-sepolia";
    asset: "USDt-testnet";
    amountInBaseUnits: string;
    broadcast: false;
  };
  createdAt: string;
}

export interface WdkCliPayment {
  id: string;
  mode: PaymentMode;
  dinerId?: string;
  subtotalInCents: number;
  tipPercent: number;
  tipInCents: number;
  totalInCents: number;
  status: "WDK_CLI_BROADCAST";
  network: "sepolia";
  asset: "USDT";
  fromWallet: string;
  fromAddress: string;
  toWallet: string;
  toAddress: string;
  amount: string;
  transactionHash: string | null;
  balanceBefore: { client: string | null; business: string | null };
  balanceAfter: { client: string | null; business: string | null };
  createdAt: string;
}

export type PaymentRecord = SimulatedPayment | WdkCliPayment;

export interface TableSession {
  id: string;
  tableNumber: number;
  status: SessionStatus;
  diners: Diner[];
  orders: Order[];
  payments: PaymentRecord[];
  paymentMode?: PaymentMode;
  openedAt: string;
  updatedAt: string;
}

export interface DinerBill {
  dinerId: string;
  dinerName: string;
  subtotalInCents: number;
  paid: boolean;
}

export interface BillSummary {
  sessionId: string;
  tableNumber: number;
  sessionStatus: SessionStatus;
  subtotalInCents: number;
  tipPercent: number;
  tipInCents: number;
  totalInCents: number;
  diners: DinerBill[];
}

export interface KitchenOrderView extends Order {
  tableNumber: number;
  dinerName: string;
}
