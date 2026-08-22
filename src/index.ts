import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { RestaurantService } from "./application/restaurant-service.js";
import { createApiHandler } from "./api/handler.js";
import { demoMenu } from "./config/demo-menu.js";
import { InMemoryMenuCatalog, InMemorySessionRepository, systemClock, uuidGenerator } from "./infrastructure/in-memory.js";
import { ResilientPaymentGateway, SimulatedFallbackGateway, WdkPolicySimulationGateway } from "./infrastructure/wdk-policy-gateway.js";

const paymentGateway = new ResilientPaymentGateway(
  new WdkPolicySimulationGateway({
    merchantAddress: process.env.WDK_DEMO_MERCHANT_ADDRESS ?? "0x1111111111111111111111111111111111111111",
    tokenAddress: "0xd077a400968890eacc75cdc901f0356c943e4fdb",
    arsPerUsdt: Number(process.env.DEMO_ARS_PER_USDT ?? 1_000),
    maxUsdtInBaseUnits: BigInt(process.env.WDK_DEMO_MAX_USDT_BASE_UNITS ?? 25_000_000),
  }),
  new SimulatedFallbackGateway(),
);

const service = new RestaurantService(
  new InMemorySessionRepository(),
  new InMemoryMenuCatalog(demoMenu),
  systemClock,
  uuidGenerator,
  paymentGateway,
);

const port = Number(process.env.PORT ?? 3000);
const apiHandler = createApiHandler(service);
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  if (pathname === "/health" || pathname.startsWith("/api/")) return apiHandler(request, response);
  const requested = pathname === "/" ? "index.html" : pathname.slice(1);
  const filePath = resolve(process.cwd(), "dist/web", requested);
  const webRoot = resolve(process.cwd(), "dist/web");
  try {
    if (filePath !== webRoot && !filePath.startsWith(`${webRoot}/`)) throw new Error("Ruta inválida");
    const file = await readFile(filePath);
    response.writeHead(200, { "content-type": contentType(extname(filePath)) });
    response.end(file);
  } catch {
    try {
      const index = await readFile(resolve(webRoot, "index.html"));
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(index);
    } catch {
      response.writeHead(503, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: { code: "WEB_NOT_BUILT", message: "Ejecutá npm run build:web." } }));
    }
  }
});

server.listen(port, () => {
  console.log(`Mesa Abierta API disponible en http://localhost:${port}`);
  console.log("Datos simulados en memoria: se reinician al detener el servidor.");
});

function contentType(extension: string) {
  const types: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
  };
  return types[extension] ?? "application/octet-stream";
}
