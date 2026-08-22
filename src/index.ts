import { createServer } from "node:http";
import { RestaurantService } from "./application/restaurant-service.js";
import { createApiHandler } from "./api/handler.js";
import { demoMenu } from "./config/demo-menu.js";
import { InMemoryMenuCatalog, InMemorySessionRepository, systemClock, uuidGenerator } from "./infrastructure/in-memory.js";

const service = new RestaurantService(
  new InMemorySessionRepository(),
  new InMemoryMenuCatalog(demoMenu),
  systemClock,
  uuidGenerator,
);

const port = Number(process.env.PORT ?? 3000);
const server = createServer(createApiHandler(service));

server.listen(port, () => {
  console.log(`Mesa Abierta API disponible en http://localhost:${port}`);
  console.log("Datos simulados en memoria: se reinician al detener el servidor.");
});
