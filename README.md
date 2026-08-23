# Mesa Abierta

> Aleph Hackathon 2026 · WDK Track 1

Mesa Abierta es una experiencia de restaurante por QR: cada comensal entra desde su mesa, se identifica en ese teléfono, personaliza platos, envía pedidos, corrige un producto antes de que cocina empiece a prepararlo, sigue el estado y paga lo suyo o toda la mesa.

El checkout del hackathon usa **WDK CLI** como backend de wallet para un flujo de testnet **cliente → negocio**.

## Estado

### IMPLEMENTADO

- QR lógico por URL `/mesa/:numero`.
- Identificación del comensal por dispositivo/sesión.
- Menú, carrito y aclaraciones por producto.
- Pedidos iniciales y adicionales.
- Vista `Mi pedido` con estados en tiempo real.
- Corrección: quitar un producto mientras la comanda siga `RECEIVED`.
- Cocina: `RECEIVED → PREPARING → READY → DELIVERED`.
- Cuenta individual o de mesa y propina.
- Políticas WDK SDK `ALLOW/DENY`.
- WDK CLI Track 1: wallets dedicadas de cliente y negocio.
- Pago WDK CLI: `dry-run → confirmación humana → send` en Sepolia.
- Preview de un solo uso y rechazo si cambia el monto.
- Registro de balance antes/después y hash de transacción si el CLI lo devuelve.
- Resumen de gastos del cliente, ingresos del negocio y propinas.
- Asistente del menú con QVAC local opcional y fallback determinista: `Plato del día`, `Sugerencias`, `Más recomendado`.

### VERIFICADO previamente

Antes de esta rama se verificaron compilación del backend y 8 tests del motor, incluyendo políticas WDK `ALLOW` y `DENY` sin transmisión.

### PENDIENTE DE VERIFICAR en esta rama

- instalación limpia con `@tetherto/wdk-cli@1.0.0-beta.2`;
- `npm run typecheck`;
- `npm test` con los tests nuevos;
- `npm run build`;
- broadcast real de **testnet** con wallets dedicadas financiadas en Sepolia;
- QVAC local real, si se usa en la demo.

No se debe presentar el pago on-chain como verificado hasta completar esa prueba.

### PROPUESTO / FUTURO

- persistencia en base de datos;
- generación física/descargable de QR;
- autenticación del personal;
- costos de ingredientes/personal para calcular ganancia neta;
- facturación e integraciones POS.

## Requisitos

- Node.js **22.18.0 o superior**.
- WDK CLI **`@tetherto/wdk-cli@1.0.0-beta.2`**.
- Para la prueba on-chain: dos wallets dedicadas de Sepolia y fondos exclusivamente de testnet.

## Instalación

Con npm 11, `package.json` contiene una aprobación fijada en `allowScripts` para `@tetherto/wdk-cli@1.0.0-beta.2`. Por eso, dentro del proyecto se usa `npm install` normal; no se pasa `--allow-scripts` en la línea de comandos.

```bash
npm install
npm run typecheck
npm test
npm run build
npm run dev
```

Web:

- Comensal: `http://localhost:5173/mesa/12`
- Mi pedido: `http://localhost:5173/mesa/12/pedido`
- Cocina / caja: `http://localhost:5173/cocina`
- API: `http://localhost:3000`
- Health: `GET /health`

Los pedidos se guardan en memoria y se reinician al detener el servidor.

## WDK CLI — setup seguro

Si querés disponer del comando `wdk` globalmente, npm sí permite `--allow-scripts` en una instalación global:

```bash
npm install -g --allow-scripts=@tetherto/wdk-cli @tetherto/wdk-cli@1.0.0-beta.2
wdk --version
```

Crear las wallets interactivamente:

```bash
npm run wallets:setup
```

O manualmente:

```bash
wdk wallet create --name mesa-cliente-demo --words 12
wdk wallet create --name mesa-negocio-demo --words 12
```

**No pegues las seed phrases ni passphrases en GitHub, `.env`, logs, ChatGPT, Telegram, screenshots o el video de la demo.** Guardalas offline.

Antes de una prueba, desbloquealas con TTL corto:

```bash
wdk wallet unlock --name mesa-cliente-demo --ttl 5
wdk wallet unlock --name mesa-negocio-demo --ttl 5
```

Verificación:

```bash
wdk get address --network sepolia --wallet mesa-cliente-demo
wdk get address --network sepolia --wallet mesa-negocio-demo
wdk get balance --network sepolia --token usdt --wallet mesa-cliente-demo
```

La wallet del cliente debe tener USDt de prueba y gas de Sepolia suficiente. No uses mainnet ni wallets personales.

## Flujo principal de la demo

1. El comensal escanea el QR de Mesa 12.
2. Ingresa su nombre.
3. Elige un plato y puede agregar aclaraciones.
4. Confirma el pedido.
5. Si se equivocó, puede quitar un producto mientras el pedido esté `Recibido`.
6. Cocina ve la comanda y avanza sus estados.
7. Cuando todo está `Entregado`, el comensal solicita la cuenta.
8. Elige `Pago lo mío` o `Pago toda la mesa` y propina.
9. Mesa Abierta lee la wallet local del cliente y la wallet local del negocio.
10. WDK SDK evalúa destinatario y monto.
11. WDK CLI ejecuta `wdk send --dry-run --json`.
12. La interfaz muestra origen, destino, monto y preview.
13. El usuario confirma explícitamente.
14. WDK CLI ejecuta `wdk send ... --json` en Sepolia.
15. Se registra el recibo, balances antes/después y el cobro en el panel interno.

Si WDK falla, la wallet está bloqueada, falta saldo, el preview venció o cambió el monto, **no se marca el pago como cobrado**.

## Control financiero del MVP

El panel interno muestra gastos pagados por clientes, ingresos cobrados por el negocio, propinas, USDt de testnet recibido y saldo reportado por WDK CLI para la wallet del negocio.

**No muestra “ganancia neta”**, porque todavía no registramos costo de mercadería, personal ni comisiones.

## Asistente del menú

El asistente responde a `Plato del día`, `Sugerencias`, `Más recomendado` y consultas simples sobre bebida o postre.

Puede usar **QVAC local** mediante su endpoint OpenAI-compatible en loopback. La respuesta queda anclada a productos reales del menú. Si QVAC no está disponible o devuelve una respuesta inválida, se usa un recomendador determinista local de respaldo. No se envían datos del comensal a una IA cloud.

## Seguridad WDK

- Sepolia/testnet únicamente para el checkout transmisible.
- Wallets dedicadas, nunca personales.
- Seed/passphrase nunca llegan al frontend ni al backend.
- El backend sólo usa nombres de wallets y direcciones públicas mediante WDK CLI.
- El camino transmisible falla cerrado si WDK no autoriza.
- Un fallback simulado nunca autoriza broadcast.
- Dry-run obligatorio antes de send.
- Confirmación humana separada antes de transmitir.
- Preview expirable, de un solo uso y ligado al monto.

Detalles técnicos: [`docs/WDK.md`](docs/WDK.md).

## Integración WDK — archivos para el jurado

- [`src/infrastructure/wdk-cli-checkout-gateway.ts`](src/infrastructure/wdk-cli-checkout-gateway.ts)
- [`src/infrastructure/wdk-policy-gateway.ts`](src/infrastructure/wdk-policy-gateway.ts)
- [`src/application/hackathon-extensions-service.ts`](src/application/hackathon-extensions-service.ts)
- [`src/application/checkout-wallet.ts`](src/application/checkout-wallet.ts)
- [`scripts/setup-wdk-wallets.mjs`](scripts/setup-wdk-wallets.mjs)
- [`tests/wdk-cli-checkout-gateway.test.ts`](tests/wdk-cli-checkout-gateway.test.ts)

## Arquitectura

- `src/domain`: modelo y reglas centrales.
- `src/application`: casos de uso y orquestación.
- `src/infrastructure`: memoria, políticas WDK, WDK CLI y QVAC local.
- `src/api`: HTTP.
- `web`: React/Vite para comensal y cocina/caja.
- `tests`: flujos del motor y controles de seguridad.

Ver [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md).
