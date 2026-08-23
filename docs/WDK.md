# Integración WDK — Mesa Abierta

## Track elegido

**WDK Track 1 — Build with the WDK CLI.**

WDK no está agregado como una capa paralela: el checkout de testnet depende del CLI para previsualizar y transmitir el pago del comensal hacia la wallet del negocio.

## Estado

- **IMPLEMENTADO:** políticas WDK SDK `ALLOW/DENY`.
- **IMPLEMENTADO:** gateway de WDK CLI con dos wallets dedicadas (`mesa-cliente-demo` y `mesa-negocio-demo`).
- **IMPLEMENTADO:** `wdk send --dry-run` obligatorio antes del envío.
- **IMPLEMENTADO:** confirmación humana separada antes del `wdk send` transmisible.
- **IMPLEMENTADO:** protección contra doble ejecución y contra cambios de monto después del preview.
- **IMPLEMENTADO:** registro de balances antes/después, hash si WDK CLI lo devuelve, gastos del cliente, ingresos del negocio y propinas.
- **VERIFICADO previamente:** políticas WDK SDK `ALLOW` y `DENY` mediante tests.
- **PENDIENTE DE VERIFICAR en una wallet financiada:** broadcast real en Sepolia y confirmación on-chain.

## Paquetes WDK

- `@tetherto/wdk` — política de transacción.
- `@tetherto/wdk-wallet-evm` — wallet EVM usada por la simulación de política.
- `@tetherto/wdk-cli@1.0.0-beta.2` — backend de wallet y transferencia para el Track 1.

## Flujo de pago

1. Cocina entrega todas las comandas.
2. El comensal solicita la cuenta.
3. Mesa Abierta calcula pago individual o de mesa + propina.
4. Se lee la dirección pública de `mesa-negocio-demo` mediante WDK CLI.
5. WDK SDK evalúa la intención para ese destinatario y monto.
6. Si WDK no devuelve `ALLOW`, no se continúa.
7. La app llama a `wdk send ... --dry-run --json` desde `mesa-cliente-demo` hacia la dirección del negocio.
8. Se muestra al usuario el monto, origen, destino y el preview.
9. El usuario confirma explícitamente.
10. Se ejecuta `wdk send ... --json` sin `--dry-run`.
11. Se registran recibo y balances antes/después.
12. El panel interno agrega el pago a ingresos y propinas.

El preview vence y sólo puede utilizarse una vez. Si cambia el total después del preview, se rechaza el envío y hay que generar uno nuevo.

## Crear las wallets de prueba

La aplicación **no crea wallets automáticamente en el servidor**, porque eso implicaría manejar material secreto sin supervisión humana.

Primero instalá dependencias y WDK CLI:

```bash
npm install --allow-scripts=@tetherto/wdk-cli
npm install -g --allow-scripts=@tetherto/wdk-cli @tetherto/wdk-cli@1.0.0-beta.2
```

Después podés usar el setup interactivo:

```bash
npm run wallets:setup
```

O hacerlo manualmente:

```bash
wdk wallet create --name mesa-cliente-demo --words 12
wdk wallet create --name mesa-negocio-demo --words 12
```

Guardá las seed phrases **offline**. No deben aparecer en `.env`, GitHub, logs, capturas, chats ni videos.

Antes de la demo, desbloqueá ambas con TTL corto:

```bash
wdk wallet unlock --name mesa-cliente-demo --ttl 5
wdk wallet unlock --name mesa-negocio-demo --ttl 5
```

Verificá direcciones y saldo del cliente:

```bash
wdk get address --network sepolia --wallet mesa-cliente-demo
wdk get address --network sepolia --wallet mesa-negocio-demo
wdk get balance --network sepolia --token usdt --wallet mesa-cliente-demo
```

La wallet cliente necesita USDt de prueba en Sepolia y gas de testnet suficiente para la transferencia. No uses fondos ni wallets personales.

## Red y token

- Red: Ethereum Sepolia (`sepolia`, chain ID 11155111).
- Activo: USDt de prueba / ticker WDK CLI `usdt`.
- Contrato de USDt de prueba documentado por WDK: `0xd077a400968890eacc75cdc901f0356c943e4fdb`.
- Decimales: 6.
- Conversión de la demo: `DEMO_ARS_PER_USDT`, por defecto 1 USDt = 1.000 ARS ficticios. No es cotización de mercado.

## Seguridad

- El checkout transmisible sólo usa Sepolia.
- No se usa una wallet personal.
- La app nunca recibe seed phrase ni passphrase.
- El CLI guarda las wallets cifradas localmente y el daemon mantiene claves sólo mientras están desbloqueadas.
- No se usa `WDK_PASSPHRASE` desde la aplicación.
- Si la política WDK falla en el camino transmisible, el gateway **falla cerrado** (`DENY`).
- Un fallback simulado nunca puede autorizar un broadcast WDK CLI.
- Toda transmisión requiere primero un dry-run y después una confirmación humana separada.
- La app no presenta ingresos como ganancia neta: el MVP todavía no registra costos de ingredientes, personal ni comisiones.

## Archivos principales

- `src/infrastructure/wdk-cli-checkout-gateway.ts` — comandos WDK CLI y controles anti-replay.
- `src/infrastructure/wdk-policy-gateway.ts` — políticas ALLOW/DENY y fail-closed.
- `src/application/hackathon-extensions-service.ts` — orquestación de checkout, recibos y resumen financiero.
- `src/application/checkout-wallet.ts` — contratos del gateway.
- `web/src/App.tsx` — preview, confirmación y visualización de wallets.
- `scripts/setup-wdk-wallets.mjs` — creación interactiva de wallets de testnet.
- `tests/wdk-cli-checkout-gateway.test.ts` — dry-run, broadcast único y monto inmutable.
- `tests/hackathon-extensions-service.test.ts` — flujo cliente-negocio y contabilidad del MVP.

## Fuentes oficiales

- https://docs.wdk.tether.io/cli/
- https://docs.wdk.tether.io/cli/guides/get-started/
- https://docs.wdk.tether.io/cli/api-reference/
- https://docs.wdk.tether.io/cli/reference/security-model/
- https://docs.wdk.tether.io/sdk/core-module/guides/transaction-policies/
- https://docs.wdk.tether.io/sdk/wallet-modules/wallet-evm-erc-4337/configuration/
