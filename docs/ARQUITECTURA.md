# Arquitectura del motor

## Objetivo de esta etapa

Construir y verificar las reglas del producto antes de diseñar la interfaz gráfica. El código no depende de React ni de otra tecnología visual.

## Capas

- `src/domain`: entidades, tipos y errores de negocio.
- `src/application`: casos de uso y reglas del restaurante.
- `src/infrastructure`: implementaciones reemplazables de almacenamiento, reloj e identificadores.
- `src/api`: adaptación HTTP para que una futura interfaz pueda usar el motor.
- `src/config`: datos ficticios de la demostración.
- `tests`: pruebas automáticas de los flujos principales y de seguridad.

La aplicación depende de interfaces (`SessionRepository` y `MenuCatalog`), no de una base de datos específica. Esto permite validar primero el producto y agregar persistencia real sin reescribir las reglas.

## Decisiones de negocio implementadas

- Una mesa solo puede tener una sesión activa.
- Cada comensal tiene identidad propia dentro de la mesa.
- El primer pedido de cada comensal es `INITIAL`; los siguientes son `ADDITIONAL`.
- Las comandas avanzan sin saltos: `RECEIVED → PREPARING → READY → DELIVERED`.
- Solicitar la cuenta requiere confirmación explícita y bloquea nuevos pedidos.
- La mesa puede reabrirse si todavía no registró pagos.
- La cuenta se paga completa o por comensal; no se mezclan ambos modos.
- La propina puede variar entre comensales.
- Los pagos del MVP son siempre simulados.
- Los importes se guardan como enteros en centavos.

## Persistencia actual

La implementación actual usa memoria local del servidor. Está pensada para pruebas y demostración: los datos se pierden al reiniciar.

La base de datos real todavía es **PROPUESTA**, no está implementada. La interfaz `SessionRepository` marca el límite que deberá implementar el adaptador de base de datos elegido.

## API disponible

| Método | Ruta | Función |
| --- | --- | --- |
| `GET` | `/health` | Verificar el servidor |
| `GET` | `/api/menu` | Obtener el menú |
| `POST` | `/api/tables` | Abrir una mesa |
| `GET` | `/api/tables/:id` | Consultar la mesa |
| `POST` | `/api/tables/:id/diners` | Sumar un comensal |
| `POST` | `/api/tables/:id/orders` | Crear una comanda |
| `GET` | `/api/kitchen/orders` | Listar comandas |
| `PATCH` | `/api/kitchen/orders/:id/status` | Avanzar una comanda |
| `POST` | `/api/tables/:id/bill/request` | Solicitar la cuenta |
| `POST` | `/api/tables/:id/bill/reopen` | Reabrir la mesa |
| `GET` | `/api/tables/:id/bill` | Calcular la cuenta |
| `POST` | `/api/tables/:id/payments/simulated` | Registrar un pago simulado |

## Fuera de esta etapa

- Interfaz gráfica.
- Base de datos persistente.
- Autenticación del restaurante.
- Pagos reales.
- Integraciones externas.
