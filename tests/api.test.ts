import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { RestaurantService } from "../src/application/restaurant-service.js";
import { createApiHandler } from "../src/api/handler.js";
import { demoMenu } from "../src/config/demo-menu.js";
import { InMemoryMenuCatalog, InMemorySessionRepository, systemClock, uuidGenerator } from "../src/infrastructure/in-memory.js";

test("la API expone salud, menú y creación de una comanda", async () => {
  const service = new RestaurantService(new InMemorySessionRepository(), new InMemoryMenuCatalog(demoMenu), systemClock, uuidGenerator);
  const server = createServer(createApiHandler(service));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok" });

    const menu = await fetch(`${baseUrl}/api/menu`);
    const menuBody = await menu.json() as { items: unknown[] };
    assert.equal(menuBody.items.length, 8);

    const tableResponse = await post(`${baseUrl}/api/tables`, { tableNumber: 12 });
    const table = await tableResponse.json() as { id: string };
    const dinerResponse = await post(`${baseUrl}/api/tables/${table.id}/diners`, { name: "Felipe" });
    const diner = await dinerResponse.json() as { id: string };
    const orderResponse = await post(`${baseUrl}/api/tables/${table.id}/orders`, {
      dinerId: diner.id,
      items: [{ menuItemId: "burger", quantity: 1 }],
    });
    const order = await orderResponse.json() as { status: string; type: string };
    assert.equal(orderResponse.status, 201);
    assert.equal(order.status, "RECEIVED");
    assert.equal(order.type, "INITIAL");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

function post(url: string, body: unknown) {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
