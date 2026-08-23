import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { tryQvacMenuAssistant } from "../src/infrastructure/qvac-menu-assistant.js";
import { demoMenu } from "../src/config/demo-menu.js";

test("QVAC local sólo puede devolver IDs permitidos del menú", async () => {
  const server = createServer((request, response) => {
    if (request.url === "/v1/models") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ data: [{ id: "test-local-model" }] }));
      return;
    }
    if (request.url === "/v1/chat/completions") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ itemIds: ["burger"] }) } }] }));
      return;
    }
    response.writeHead(404); response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const previous = process.env.QVAC_BASE_URL;
  process.env.QVAC_BASE_URL = `http://127.0.0.1:${address.port}/v1/`;
  try {
    const burger = demoMenu.find((item) => item.id === "burger")!;
    const limonada = demoMenu.find((item) => item.id === "limonada")!;
    const result = await tryQvacMenuAssistant("¿qué me recomendás?", { title: "Sugerencias", message: "respaldo", items: [burger, limonada] });
    assert.equal(result?.engine, "QVAC_LOCAL");
    assert.deepEqual(result?.items.map((item) => item.id), ["burger"]);
    assert.match(result?.message ?? "", /burger/i);
  } finally {
    if (previous === undefined) delete process.env.QVAC_BASE_URL; else process.env.QVAC_BASE_URL = previous;
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("QVAC rechaza una selección fuera de la lista permitida", async () => {
  const server = createServer((request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    if (request.url === "/v1/models") response.end(JSON.stringify({ data: [{ id: "test-local-model" }] }));
    else response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ itemIds: ["plato-inventado"] }) } }] }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const previous = process.env.QVAC_BASE_URL;
  process.env.QVAC_BASE_URL = `http://127.0.0.1:${address.port}/v1/`;
  try {
    const burger = demoMenu.find((item) => item.id === "burger")!;
    assert.equal(await tryQvacMenuAssistant("inventame algo", { title: "Sugerencias", message: "respaldo", items: [burger] }), null);
  } finally {
    if (previous === undefined) delete process.env.QVAC_BASE_URL; else process.env.QVAC_BASE_URL = previous;
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
