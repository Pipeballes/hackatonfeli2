export type OrderStatus = "RECEIVED" | "PREPARING" | "READY" | "DELIVERED";
export type PaymentMode = "INDIVIDUAL" | "TABLE";

export interface MenuItem { id: string; name: string; description: string; category: string; priceInCents: number; available: boolean; }
export interface Diner { id: string; name: string; joinedAt: string; }
export interface OrderItem { menuItemId: string; name: string; unitPriceInCents: number; quantity: number; note?: string; }
export interface Order { id: string; sessionId: string; dinerId: string; type: "INITIAL" | "ADDITIONAL"; status: OrderStatus; items: OrderItem[]; note?: string; createdAt: string; updatedAt: string; }
export interface TableSession { id: string; tableNumber: number; status: "OPEN" | "BILL_REQUESTED" | "CLOSED"; diners: Diner[]; orders: Order[]; payments: SimulatedPayment[]; openedAt: string; updatedAt: string; }
export interface KitchenOrder extends Order { tableNumber: number; dinerName: string; }
export interface BillSummary { sessionId: string; tableNumber: number; sessionStatus: TableSession["status"]; subtotalInCents: number; tipPercent: number; tipInCents: number; totalInCents: number; diners: Array<{ dinerId: string; dinerName: string; subtotalInCents: number; paid: boolean }>; }
export interface PaymentEvaluation { provider: "WDK" | "SIMULATED_FALLBACK"; decision: "ALLOW" | "DENY"; reason: string; policyId: string; matchedRule: string; network: "ethereum-sepolia"; asset: "USDt-testnet"; amountInBaseUnits: string; broadcast: false; }
export interface SimulatedPayment { id: string; mode: PaymentMode; dinerId?: string; totalInCents: number; tipPercent: number; status: "SIMULATED_APPROVED"; policyEvaluation: PaymentEvaluation & { decision: "ALLOW" }; }
