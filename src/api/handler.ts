import type { IncomingMessage, ServerResponse } from "node:http";
import type { HackathonExtensionsService } from "../application/hackathon-extensions-service.js";
import type { RestaurantService } from "../application/restaurant-service.js";
import { DomainError } from "../domain/errors.js";
import type { OrderStatus } from "../domain/model.js";
import { tryQvacMenuAssistant } from "../infrastructure/qvac-menu-assistant.js";

const orderStatuses = new Set<OrderStatus>(["RECEIVED", "PREPARING", "READY", "DELIVERED"]);

export function createApiHandler(service: RestaurantService, extensions?: HackathonExtensionsService) {
  return async (request: IncomingMessage, response: ServerResponse) => {
    try {
      const method = request.method ?? "GET";
      const url = new URL(request.url ?? "/", "http://localhost");
      const parts = url.pathname.split("/").filter(Boolean);

      if (method === "GET" && url.pathname === "/health") return json(response, 200, { status: "ok" });
      if (method === "GET" && url.pathname === "/api/menu") return json(response, 200, { items: await service.listMenu() });
      if (method === "POST" && url.pathname === "/api/menu/assistant") {
        requireExtensions(extensions);
        const body = await readJson<{ question: string }>(request);
        const grounded = await extensions.askMenuAssistant(body.question);
        const qvac = await tryQvacMenuAssistant(body.question, grounded);
        return json(response, 200, qvac ?? grounded);
      }
      if (method === "GET" && url.pathname === "/api/wdk/wallets") {
        requireExtensions(extensions);
        return json(response, 200, await extensions.getWallets());
      }
      if (method === "GET" && url.pathname === "/api/wdk/financials") {
        requireExtensions(extensions);
        return json(response, 200, await extensions.getFinancialSummary());
      }
      if (method === "POST" && url.pathname === "/api/tables") {
        const body = await readJson<{ tableNumber: number }>(request);
        return json(response, 201, await service.openTable(body.tableNumber));
      }
      if (parts[0] === "api" && parts[1] === "tables" && parts[2]) {
        if (method === "GET" && parts[2] === "by-number" && parts[3]) return json(response, 200, await service.getActiveTableByNumber(Number(parts[3])));
        const sessionId = parts[2];
        if (method === "GET" && parts.length === 3) return json(response, 200, await service.getTable(sessionId));
        if (method === "POST" && parts[3] === "diners") {
          const body = await readJson<{ name: string }>(request);
          return json(response, 201, await service.joinTable(sessionId, body.name));
        }
        if (method === "POST" && parts[3] === "orders" && parts.length === 4) {
          const body = await readJson<Parameters<RestaurantService["placeOrder"]>[1]>(request);
          return json(response, 201, await service.placeOrder(sessionId, body));
        }
        if (method === "POST" && parts[3] === "orders" && parts[4] && parts[5] === "items" && parts[6] && parts[7] === "remove") {
          requireExtensions(extensions);
          const body = await readJson<{ dinerId: string }>(request);
          return json(response, 200, await extensions.removeOrderItem(sessionId, parts[4], body.dinerId, parts[6]));
        }
        if (method === "POST" && parts[3] === "bill" && parts[4] === "request") {
          const body = await readJson<{ confirmed: boolean }>(request);
          return json(response, 200, await service.requestBill(sessionId, body.confirmed));
        }
        if (method === "POST" && parts[3] === "bill" && parts[4] === "reopen") return json(response, 200, await service.reopenTable(sessionId));
        if (method === "GET" && parts[3] === "bill") {
          const tipPercent = Number(url.searchParams.get("tipPercent") ?? 0);
          return json(response, 200, await service.getBill(sessionId, tipPercent));
        }
        if (method === "POST" && parts[3] === "payments" && parts[4] === "simulated") {
          const body = await readJson<Parameters<RestaurantService["paySimulated"]>[1]>(request);
          return json(response, 201, await service.paySimulated(sessionId, body));
        }
        if (method === "POST" && parts[3] === "payments" && parts[4] === "evaluate") {
          const body = await readJson<Parameters<RestaurantService["evaluatePayment"]>[1]>(request);
          return json(response, 200, await service.evaluatePayment(sessionId, body));
        }
        if (method === "POST" && parts[3] === "payments" && parts[4] === "wdk" && parts[5] === "preview") {
          requireExtensions(extensions);
          const body = await readJson<Parameters<HackathonExtensionsService["previewPayment"]>[1]>(request);
          return json(response, 200, await extensions.previewPayment(sessionId, body));
        }
        if (method === "POST" && parts[3] === "payments" && parts[4] === "wdk" && parts[5] === "execute") {
          requireExtensions(extensions);
          const body = await readJson<Parameters<HackathonExtensionsService["executePayment"]>[1]>(request);
          return json(response, 201, await extensions.executePayment(sessionId, body));
        }
      }
      if (method === "GET" && url.pathname === "/api/kitchen/orders") {
        const rawStatus = url.searchParams.get("status");
        const status = rawStatus && orderStatuses.has(rawStatus as OrderStatus) ? rawStatus as OrderStatus : undefined;
        if (rawStatus && !status) throw new DomainError("VALIDATION_ERROR", "El estado de comanda no es válido.");
        return json(response, 200, { orders: await service.listKitchenOrders(status) });
      }
      if (method === "PATCH" && parts[0] === "api" && parts[1] === "kitchen" && parts[2] === "orders" && parts[3] && parts[4] === "status") {
        const body = await readJson<{ status: OrderStatus }>(request);
        if (!orderStatuses.has(body.status)) throw new DomainError("VALIDATION_ERROR", "El estado de comanda no es válido.");
        return json(response, 200, await service.updateOrderStatus(parts[3], body.status));
      }
      return json(response, 404, { error: { code: "NOT_FOUND", message: "Ruta inexistente." } });
    } catch (error) {
      if (error instanceof DomainError) return json(response, errorStatus(error), { error: { code: error.code, message: error.message } });
      if (error instanceof SyntaxError) return json(response, 400, { error: { code: "VALIDATION_ERROR", message: "El cuerpo JSON no es válido." } });
      console.error(error);
      return json(response, 500, { error: { code: "INTERNAL_ERROR", message: error instanceof Error ? error.message : "Ocurrió un error inesperado." } });
    }
  };
}

function requireExtensions(extensions: HackathonExtensionsService | undefined): asserts extensions is HackathonExtensionsService {
  if (!extensions) throw new DomainError("INVALID_STATE", "Las extensiones del hackathon no están configuradas.");
}

async function readJson<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 1_000_000) throw new DomainError("VALIDATION_ERROR", "El cuerpo de la solicitud es demasiado grande.");
    chunks.push(buffer);
  }
  if (!chunks.length) throw new DomainError("VALIDATION_ERROR", "La solicitud requiere un cuerpo JSON.");
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function errorStatus(error: DomainError) {
  if (error.code === "NOT_FOUND") return 404;
  if (error.code === "CONFLICT" || error.code === "INVALID_STATE") return 409;
  return 400;
}
