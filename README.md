# Mesa Abierta

> Nombre provisorio para el proyecto del Aleph Hackathon 2026.

Mesa Abierta propone una experiencia de pedidos por QR para restaurantes. Cada integrante de una mesa puede consultar el menú, realizar pedidos desde su celular, seguir agregando productos durante la comida y, al finalizar, elegir entre pagar en conjunto o por separado.

## Estado actual

- **IMPLEMENTADO:** todavía no hay aplicación en este repositorio.
- **VERIFICADO:** el repositorio fue creado y su rama principal está disponible.
- **PROPUESTO:** aplicación web responsive accesible mediante un QR asociado a cada mesa.
- **FUTURO:** pagos reales, facturación e integraciones con sistemas del restaurante.

## Problema

En un restaurante se pierde tiempo esperando para pedir, agregar otro producto o solicitar la cuenta. Además, la toma manual puede generar errores y hace que el personal dedique tiempo a tareas repetitivas.

## Flujo propuesto del comensal

1. El cliente llega a la mesa.
2. Escanea el QR asociado a esa mesa.
3. Se identifica con un nombre simple.
4. Consulta el menú.
5. Selecciona productos.
6. Confirma el pedido.
7. Puede volver al menú y hacer pedidos adicionales.
8. Al finalizar, solicita la cuenta y elige cómo pagar.

## Flujo propuesto de cocina

Cuando un comensal confirma, el sistema crea una comanda y la muestra en el panel de cocina.

Cada comanda debe incluir:

- Número de mesa.
- Nombre del comensal.
- Productos y cantidades.
- Aclaraciones del pedido, si existen.
- Hora de recepción.
- Indicación de pedido inicial o adicional.
- Estado actual.

### Estados del pedido

Para el MVP, la comanda completa avanza por cuatro estados:

1. **Recibido:** el pedido ingresó al sistema.
2. **En preparación:** cocina comenzó a prepararlo.
3. **Listo:** el pedido está listo para retirar o entregar.
4. **Entregado:** el pedido llegó a la mesa.

Cuando cocina cambia el estado, el comensal puede verlo desde su celular.

### Pedidos adicionales

Si alguien pide un trago, postre u otro producto más tarde, se crea una nueva comanda vinculada con la misma mesa. No se modifica silenciosamente la comanda anterior.

Ejemplo:

- Mesa 12 · Felipe · Pedido inicial · 20:31.
- Mesa 12 · Mora · Pedido inicial · 20:32.
- Mesa 12 · Felipe · Pedido adicional · 21:18.

Esto permite que cocina detecte inmediatamente qué se agregó y cuándo.

## Alcance recomendado para el MVP de cocina

- Una sola pantalla de cocina.
- Todas las comandas visibles y ordenadas por hora.
- Cambio de estado de la comanda completa.
- Identificación clara de pedidos adicionales.
- Actualización del estado para el cliente.
- Datos y pagos simulados durante la demo.

## Fuera del MVP

- Separación automática entre barra, cocina y postres.
- Impresión física de comandas.
- Integración con sistemas gastronómicos existentes.
- Gestión completa de inventario.
- Métricas avanzadas de tiempos.
- Cambio de estado producto por producto.

## Decisión pendiente

Confirmar si para el MVP cocina actualizará la comanda completa, como se recomienda, o si cada producto tendrá un estado independiente.
