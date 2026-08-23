import assert from "node:assert/strict";
import test from "node:test";
import { HackathonExtensionsService } from "../src/application/hackathon-extensions-service.js";
import { RestaurantService } from "../src/application/restaurant-service.js";
import type { CheckoutPreview, CheckoutReceipt, CheckoutWalletGateway, WalletPair } from "../src/application/checkout-wallet.js";
import type { Clock, IdGenerator } from "../src/application/ports.js";
import type { PaymentGateway } from "../src/application/payment-gateway.js";
import { demoMenu } from "../src/config/demo-menu.js";
import { DomainError } from "../src/domain/errors.js";
import { InMemoryMenuCatalog, InMemorySessionRepository } from "../src/infrastructure/in-memory.js";

class FixedClock implements Clock {
  private tick = 0;
  now() { return new Date(Date.UTC(2026, 7, 22, 21, 0, this.tick++)); }
}
class SequentialIds implements IdGenerator {
  private value = 0;
  next(prefix: string) { return `${prefix}_${++this.value}`; }
}

const policy: PaymentGateway = {
  async evaluate(intent) {
    return { provider: "WDK", decision: intent.totalInCents > 0 ? "ALLOW" : "DENY", reason: "test", policyId: "test-policy", matchedRule: "test-rule", network: "ethereum-sepolia", asset: "USDt-testnet", amountInBaseUnits: String(intent.totalInCents), broadcast: false };
  },
};

class FakeCheckout implements CheckoutWalletGateway {
  wallets: WalletPair = {
    client: { role: "CLIENT", walletName: "mesa-cliente-demo", network: "sepolia", asset: "USDT", address: "0x1111111111111111111111111111111111111111", balance: "100", unlocked: true },
    business: { role: "BUSINESS", walletName: "mesa-negocio-demo", network: "sepolia", asset: "USDT", address: "0x2222222222222222222222222222222222222222", balance: "10", unlocked: true },
  };
  async getWallets() { return this.wallets; }
  async preview(totalInCents: number): Promise<CheckoutPreview> {
    return { previewId: `preview-${totalInCents}`, expiresAt: new Date(Date.now() + 60_000).toISOString(), network: "sepolia", asset: "USDT", fromWallet: this.wallets.client.walletName, fromAddress: this.wallets.client.address, toWallet: this.wallets.business.walletName, toAddress: this.wallets.business.address, amount: String(totalInCents / 100_000), balanceBefore: { client: "100", business: "10" }, dryRun: true, cliResult: { dryRun: true } };
  }
  async execute(previewId: string, totalInCents: number): Promise<CheckoutReceipt> {
    return { previewId, network: "sepolia", asset: "USDT", fromWallet: this.wallets.client.walletName, fromAddress: this.wallets.client.address, toWallet: this.wallets.business.walletName, toAddress: this.wallets.business.address, amount: String(totalInCents / 100_000), transactionHash: "0xpaid", balanceBefore: { client: "100", business: "10" }, balanceAfter: { client: "80", business: "30" }, broadcast: true, cliResult: { transactionHash: "0xpaid" } };
  }
}

function setup() {
  const sessions = new InMemorySessionRepository();
  const menu = new InMemoryMenuCatalog(demoMenu);
  const clock = new FixedClock();
  const ids = new SequentialIds();
  const checkout = new FakeCheckout();
  const restaurant = new RestaurantService(sessions, menu, clock, ids, policy);
  const extensions = new HackathonExtensionsService(sessions, menu, clock, ids, policy, checkout);
  return { restaurant, extensions };
}

async function deliver(service: RestaurantService, orderId: string) {
  await service.updateOrderStatus(orderId, "PREPARING");
  await service.updateOrderStatus(orderId, "READY");
  await service.updateOrderStatus(orderId, "DELIVERED");
}

test("el comensal puede quitar un producto sólo antes de que cocina empiece", async () => {
  const { restaurant, extensions } = setup();
  const session = await restaurant.openTable(12);
  const diner = await restaurant.joinTable(session.id, "Felipe");
  const order = await restaurant.placeOrder(session.id, { dinerId: diner.id, items: [{ menuItemId: "burger", quantity: 1 }, { menuItemId: "limonada", quantity: 1 }] });

  await extensions.removeOrderItem(session.id, order.id, diner.id, "limonada");
  const updated = await restaurant.getTable(session.id);
  assert.deepEqual(updated.orders[0]?.items.map((item) => item.menuItemId), ["burger"]);

  await restaurant.updateOrderStatus(order.id, "PREPARING");
  await assert.rejects(() => extensions.removeOrderItem(session.id, order.id, diner.id, "burger"), (error: unknown) => error instanceof DomainError && error.code === "INVALID_STATE");
});

test("checkout WDK registra flujo cliente-negocio y resumen financiero sin inventar ganancia", async () => {
  const { restaurant, extensions } = setup();
  const session = await restaurant.openTable(7);
  const diner = await restaurant.joinTable(session.id, "Mora");
  const order = await restaurant.placeOrder(session.id, { dinerId: diner.id, items: [{ menuItemId: "burger", quantity: 1 }] });
  await deliver(restaurant, order.id);
  await restaurant.requestBill(session.id, true);

  const preview = await extensions.previewPayment(session.id, { mode: "INDIVIDUAL", dinerId: diner.id, tipPercent: 10 });
  assert.equal(preview.policyEvaluation.decision, "ALLOW");
  assert.equal(preview.preview.toWallet, "mesa-negocio-demo");

  const payment = await extensions.executePayment(session.id, { mode: "INDIVIDUAL", dinerId: diner.id, tipPercent: 10, previewId: preview.preview.previewId });
  assert.equal(payment.status, "WDK_CLI_BROADCAST");
  assert.equal(payment.fromWallet, "mesa-cliente-demo");
  assert.equal(payment.toWallet, "mesa-negocio-demo");
  assert.equal(payment.transactionHash, "0xpaid");

  const financials = await extensions.getFinancialSummary();
  assert.equal(financials.payments, 1);
  assert.equal(financials.businessRevenueInCents, 1_790_000);
  assert.equal(financials.tipsInCents, 179_000);
  assert.equal(financials.businessProfitInCents, null);
});

test("asistente local expone plato del día y usa pedidos para lo más recomendado", async () => {
  const { restaurant, extensions } = setup();
  const session = await restaurant.openTable(4);
  const diner = await restaurant.joinTable(session.id, "Ana");
  await restaurant.placeOrder(session.id, { dinerId: diner.id, items: [{ menuItemId: "limonada", quantity: 5 }] });

  const day = await extensions.askMenuAssistant("plato del día");
  assert.equal(day.title, "Plato del día");
  assert.equal(day.items.length, 1);

  const popular = await extensions.askMenuAssistant("¿qué es lo más recomendado?");
  assert.equal(popular.title, "Lo más recomendado");
  assert.equal(popular.items[0]?.id, "limonada");
  assert.equal(popular.engine, "LOCAL_RECOMMENDATION_RULES");
});
