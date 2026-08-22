# Evaluación de tecnologías Tether

Fecha: 22 de agosto de 2026.

## Estado

Todo lo descrito en este documento está **PROPUESTO**. Ningún SDK de WDK, QVAC o Pear está instalado ni integrado todavía.

## Recomendación

1. **WDK para el MVP:** simulación de una intención de pago y evaluación de políticas, sin transmitir transacciones.
2. **QVAC como experimento opcional:** procesamiento local de aclaraciones de cocina.
3. **Pear después del hackathon:** comunicación y replicación P2P entre dispositivos del restaurante.

## WDK: integración recomendada

### Valor para Mesa Abierta

WDK se relaciona directamente con la parte más diferencial del producto: dividir y pagar la cuenta. Su sistema de políticas permite evaluar una operación con reglas ALLOW/DENY y ofrece un espejo `simulate` que no ejecuta, firma ni transmite la transacción.

### Flujo propuesto

1. El sistema calcula cuánto debe pagar cada comensal.
2. El comensal elige propina y solicita pagar.
3. Mesa Abierta crea una intención de transferencia en una red de prueba.
4. Una política WDK controla red, token, destinatario, monto máximo y comisión máxima.
5. Se ejecuta solamente la simulación de la política.
6. El resultado ALLOW o DENY se muestra y se registra como parte de la demo.
7. El motor actual completa el pago simulado; no se transmite una transacción.

### Adaptación del código

Agregar una interfaz de aplicación independiente del SDK:

```ts
interface PaymentGateway {
  evaluate(intent: PaymentIntent): Promise<PaymentEvaluation>;
}
```

Implementaciones previstas:

- `SimulatedPaymentGateway`: comportamiento actual y determinista.
- `WdkPolicySimulationGateway`: adaptador real de WDK que llama a `account.simulate.transfer(...)`.

Esto evita acoplar las reglas de restaurante a una blockchain y permite continuar con la demo si WDK, la red o el proveedor fallan.

### Demo de seguridad

- Cuenta normal y destinatario permitido: **ALLOW**.
- Monto superior al límite o destinatario incorrecto: **DENY**.
- La demo no llama a `transfer()` ni a `sendTransaction()`.
- Si después se prueba una transferencia, será únicamente en testnet y con confirmación humana explícita.

### Reglas de seguridad

- Nunca usar mainnet en el MVP.
- Nunca usar una wallet personal.
- Nunca guardar seed phrases, claves o passphrases en GitHub.
- Usar una wallet descartable de testnet y almacenamiento cifrado.
- No imprimir secretos en logs, capturas o la demo.
- Registrar solamente datos públicos: red, token, monto, decisión y motivo.
- Fallar de manera segura cuando una regla no puede evaluarse.
- Mantener el pago simulado como camino alternativo estable.

## QVAC: integración opcional

### Caso de uso útil

Ejecutar IA localmente en el dispositivo del restaurante para transformar aclaraciones libres en un resumen para cocina.

Ejemplo:

- Entrada: “sin cebolla, soy alérgico al maní y la hamburguesa bien cocida”.
- Salida auxiliar: “QUITAR CEBOLLA · ALERTA MANÍ · BIEN COCIDA”.

### Restricciones

- El texto original siempre debe conservarse y mostrarse.
- La salida de IA es una ayuda, nunca una decisión de seguridad alimentaria.
- Un fallo de QVAC no debe impedir que la comanda llegue a cocina.
- El modelo debe descargarse y cargarse localmente, lo que agrega peso y requisitos de hardware.

### Conclusión

QVAC puede mejorar la presentación del hackathon, pero no resuelve el problema principal. Solo debería incorporarse después de completar el flujo WDK y la demo estable.

## Pear: integración futura

### Caso de uso posible

Replicar comandas entre caja, cocina y barra mediante Hypercore/Hyperbee e Hyperswarm, reduciendo la dependencia de un servidor central.

### Motivo para postergarlo

Pear está orientado a aplicaciones ejecutadas mediante Pear/Bare, Electron, React Native o binarios propios. El flujo principal de Mesa Abierta pretende que un cliente escanee un QR y entre desde un navegador sin instalar nada.

Introducir Pear en el teléfono del comensal cambiaría esa experiencia. Podría utilizarse solamente entre dispositivos internos del restaurante, pero para el MVP agrega complejidad sin mejorar la demostración principal.

## Fuentes oficiales

- WDK: https://docs.wdk.tether.io/
- Políticas WDK: https://docs.wdk.tether.io/sdk/core-module/guides/transaction-policies/
- Seguridad WDK CLI: https://docs.wdk.tether.io/cli/reference/security-model/
- QVAC: https://docs.qvac.tether.io/
- QVAC JS/TS: https://docs.qvac.tether.io/quickstart/
- Pear: https://docs.pears.com/
- Pear y Bare: https://docs.pears.com/explanation/pear-and-bare/
