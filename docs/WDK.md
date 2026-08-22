# Integración WDK

## Estado

- **IMPLEMENTADO:** adaptador real de políticas de WDK.
- **VERIFICADO:** resultados `ALLOW` y `DENY` mediante pruebas automáticas.
- **NO IMPLEMENTADO:** firma, cotización de comisión, transmisión o confirmación on-chain.

## Qué hace

`WdkPolicySimulationGateway` convierte el total en pesos a una cantidad ficticia de USDt de testnet mediante una cotización fija de demostración. Después:

1. Genera una seed descartable exclusivamente en memoria.
2. Registra el wallet EVM de WDK para Ethereum Sepolia.
3. Registra una política local con reglas ALLOW/DENY.
4. Obtiene una cuenta gobernada.
5. Ejecuta `account.simulate.transfer(...)`.
6. Devuelve decisión, regla y motivo.
7. Ejecuta `wdk.dispose()` para limpiar el material derivado.

No se configura proveedor RPC porque la simulación de política no llama al método de transferencia subyacente.

## Reglas

- El token debe coincidir con el contrato USDt de prueba de Sepolia documentado por WDK.
- El destinatario debe coincidir con la dirección pública configurada para el restaurante.
- El monto debe ser positivo.
- El monto no puede superar el límite de la demo.
- WDK niega por defecto una operación gobernada que no tenga una regla aplicable.

## Datos de demostración

- Red: Ethereum Sepolia (`chainId: 11155111`).
- Activo: USDt de prueba.
- Contrato: `0xd077a400968890eacc75cdc901f0356c943e4fdb`.
- Cotización predeterminada: 1 USDt de prueba = 1.000 ARS ficticios.
- Límite predeterminado: 25 USDt de prueba.

La cotización es deliberadamente ficticia y no debe mostrarse como precio de mercado.

## Seguridad

- No se usa mainnet.
- No se usa una wallet personal.
- No se guarda ni registra ninguna seed phrase.
- No se solicita una clave privada al usuario.
- La respuesta siempre contiene `broadcast: false`.
- El pago final del motor continúa marcado como `SIMULATED_APPROVED`.
- Si WDK falla, se usa una política determinista de respaldo y se informa `SIMULATED_FALLBACK`.

## Pruebas

`tests/wdk-policy-gateway.test.ts` verifica:

- Un pago por debajo del límite devuelve `WDK / ALLOW`.
- Un pago superior al límite devuelve `WDK / DENY`.
- Ningún caso transmite una operación.

## Fuentes oficiales

- https://docs.wdk.tether.io/sdk/core-module/guides/transaction-policies/
- https://docs.wdk.tether.io/sdk/wallet-modules/wallet-evm/
- https://docs.wdk.tether.io/sdk/wallet-modules/wallet-evm-erc-4337/configuration/
