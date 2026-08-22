import assert from "node:assert/strict";
import test from "node:test";
import { RestaurantService } from "../src/application/restaurant-service.js";
import type { Clock, IdGenerator } from "../src/application/ports.js";
import { demoMenu } from "../src/config/demo-menu.js";
import { DomainError } from "../src/domain/errors.js";
import { InMemoryMenuCatalog, InMemorySessionRepository } from "../src/infrastructure/in-memory.js";
import { SimulatedFallbackGateway } from "../src/infrastructure/wdk-policy-gateway.js";

class FixedClock implements Clock {
  private tick = 0;
  now() { return new Date(Date.UTC(2026, 7, 22, 20, 0, this.tick++)); }
}

class SequentialIds implements IdGenerator {
  private value = 0;
  next(prefix: string) { return `${prefix}_${++this.value}`; }
}

function setup() {
  return new RestaurantService(new InMemorySessionRepository(), new InMemoryMenuCatalog(demoMenu), new FixedClock(), new SequentialIds(), new SimulatedFallbackGateway());
}

async function deliver(service: RestaurantService, orderId: string) {
  await service.updateOrderStatus(orderId, "PREPARING");
  await service.updateOrderStatus(orderId, "READY");
  await service.updateOrderStatus(orderId, "DELIVERED");
}

test("registra pedidos iniciales y adicionales por comensal", async () => {
  const service = setup();
  const session = await service.openTable(12);
  const felipe = await service.joinTable(session.id, "Felipe");
  const mora = await service.joinTable(session.id, "Mora");

  const first = await service.placeOrder(session.id, { dinerId: felipe.id, items: [{ menuItemId: "burger", quantity: 1 }] });
  const secondDiner = await service.placeOrder(session.id, { dinerId: mora.id, items: [{ menuItemId: "risotto", quantity: 1 }] });
  const extra = await service.placeOrder(session.id, { dinerId: felipe.id, items: [{ menuItemId: "gin-citrico", quantity: 2 }] });

  assert.equal(first.type, "INITIAL");
  assert.equal(secondDiner.type, "INITIAL");
  assert.equal(extra.type, "ADDITIONAL");
  assert.equal((await service.listKitchenOrders()).length, 3);
});

test("la cocina solo permite avanzar una comanda en orden", async () => {
  const service = setup();
  const session = await service.openTable(5);
  const diner = await service.joinTable(session.id, "Nico");
  const order = await service.placeOrder(session.id, { dinerId: diner.id, items: [{ menuItemId: "pesca", quantity: 1 }] });

  await assert.rejects(() => service.updateOrderStatus(order.id, "READY"), (error: unknown) => error instanceof DomainError && error.code === "INVALID_STATE");
  await deliver(service, order.id);
  assert.equal((await service.listKitchenOrders("DELIVERED"))[0]?.status, "DELIVERED");
});

test("bloquea nuevos pedidos al solicitar la cuenta y permite reabrir antes de pagar", async () => {
  const service = setup();
  const session = await service.openTable(8);
  const diner = await service.joinTable(session.id, "Felipe");
  const order = await service.placeOrder(session.id, { dinerId: diner.id, items: [{ menuItemId: "volcan", quantity: 1 }] });
  await deliver(service, order.id);

  await service.requestBill(session.id, true);
  await assert.rejects(() => service.placeOrder(session.id, { dinerId: diner.id, items: [{ menuItemId: "limonada", quantity: 1 }] }), (error: unknown) => error instanceof DomainError && error.code === "INVALID_STATE");
  assert.equal((await service.reopenTable(session.id)).status, "OPEN");
});

test("calcula consumos individuales y cierra cuando todos pagan con propina simulada", async () => {
  const service = setup();
  const session = await service.openTable(3);
  const felipe = await service.joinTable(session.id, "Felipe");
  const mora = await service.joinTable(session.id, "Mora");
  const first = await service.placeOrder(session.id, { dinerId: felipe.id, items: [{ menuItemId: "burger", quantity: 1 }] });
  const second = await service.placeOrder(session.id, { dinerId: mora.id, items: [{ menuItemId: "limonada", quantity: 2 }] });
  await deliver(service, first.id);
  await deliver(service, second.id);
  await service.requestBill(session.id, true);

  const bill = await service.getBill(session.id, 10);
  assert.equal(bill.subtotalInCents, 2_830_000);
  assert.equal(bill.tipInCents, 283_000);

  const felipePayment = await service.paySimulated(session.id, { mode: "INDIVIDUAL", dinerId: felipe.id, tipPercent: 10 });
  assert.equal(felipePayment.totalInCents, 1_969_000);
  assert.equal((await service.getTable(session.id)).status, "BILL_REQUESTED");

  await service.paySimulated(session.id, { mode: "INDIVIDUAL", dinerId: mora.id, tipPercent: 5 });
  assert.equal((await service.getTable(session.id)).status, "CLOSED");
});

test("rechaza duplicados, cantidades inválidas y pedidos sin entregar al pedir la cuenta", async () => {
  const service = setup();
  const session = await service.openTable(10);
  const diner = await service.joinTable(session.id, "Felipe");
  await assert.rejects(() => service.joinTable(session.id, "felipe"), (error: unknown) => error instanceof DomainError && error.code === "CONFLICT");
  await assert.rejects(() => service.placeOrder(session.id, { dinerId: diner.id, items: [{ menuItemId: "burger", quantity: 0 }] }), (error: unknown) => error instanceof DomainError && error.code === "VALIDATION_ERROR");
  await service.placeOrder(session.id, { dinerId: diner.id, items: [{ menuItemId: "burger", quantity: 1 }] });
  await assert.rejects(() => service.requestBill(session.id, true), (error: unknown) => error instanceof DomainError && error.code === "INVALID_STATE");
});
