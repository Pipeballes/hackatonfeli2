import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { HackathonExtensionsService } from "./application/hackathon-extensions-service.js";
import { RestaurantService } from "./application/restaurant-service.js";
import { createApiHandler } from "./api/handler.js";
import { demoMenu } from "./config/demo-menu.js";
import { InMemoryMenuCatalog, InMemorySessionRepository, systemClock, uuidGenerator } from "./infrastructure/in-memory.js";
import { WdkCliCheckoutGateway } from "./infrastructure/wdk-cli-checkout-gateway.js";
import { ResilientPaymentGateway, SimulatedFallbackGateway, WdkPolicySimulationGateway } from "./infrastructure/wdk-policy-gateway.js";

const arsPerUsdt = Number(process.env.DEMO_ARS_PER_USDT ?? 1_000);
const paymentGateway = new ResilientPaymentGateway(
  new WdkPolicySimulationGateway({
    merchantAddress: process.env.WDK_DEMO_MERCHANT_ADDRESS ?? "0x1111111111111111111111111111111111111111",
    tokenAddress: "0xd077a400968890eacc75cdc901f0356c943e4fdb",
    arsPerUsdt,
    maxUsdtInBaseUnits: BigInt(process.env.WDK_DEMO_MAX_USDT_BASE_UNITS ?? 25_000_000),
  }),
  new SimulatedFallbackGateway(),
);

const sessions = new InMemorySessionRepository();
const menu = new InMemoryMenuCatalog(demoMenu);
const service = new RestaurantService(sessions, menu, systemClock, uuidGenerator, paymentGateway);
const checkoutWallet = new WdkCliCheckoutGateway({
  clientWallet: process.env.WDK_CLIENT_WALLET ?? "mesa-cliente-demo",
  businessWallet: process.env.WDK_BUSINESS_WALLET ?? "mesa-negocio-demo",
  arsPerUsdt,
  ...(process.env.WDK_CLI_BIN ? { executable: process.env.WDK_CLI_BIN } : {}),
  ...(process.env.WDK_CLI_TOKEN ? { tokenTicker: process.env.WDK_CLI_TOKEN } : {}),
});
const extensions = new HackathonExtensionsService(sessions, menu, systemClock, uuidGenerator, paymentGateway, checkoutWallet);

const port = Number(process.env.PORT ?? 3000);
const apiHandler = createApiHandler(service, extensions);
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
  console.log("Datos de pedidos en memoria: se reinician al detener el servidor.");
  console.log(`WDK CLI: cliente=${process.env.WDK_CLIENT_WALLET ?? "mesa-cliente-demo"} negocio=${process.env.WDK_BUSINESS_WALLET ?? "mesa-negocio-demo"} red=Sepolia`);
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
