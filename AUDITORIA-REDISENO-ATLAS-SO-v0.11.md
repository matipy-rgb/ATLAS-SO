# Auditoría y rediseño de ATLAS SO v0.11

Fecha: 20 de agosto de 2026
Rama: v0.11-experiencia-simple

## Decisión

ATLAS SO conserva el motor, los cálculos, la sincronización, el historial y la base financiera de v0.10. La v0.11 reemplaza la jerarquía visible: primero muestra lo urgente, después las tareas frecuentes y finalmente la administración avanzada.

No se copiaron logotipos, ilustraciones ni recursos protegidos de otras marcas. Se estudiaron patrones públicos de uso:

- [Mango](https://www.mangoapp.com.py/) y su [aplicación oficial](https://play.google.com/store/apps/details?hl=es&id=com.mangopayment.mangoapp): saldo principal y acciones frecuentes visibles.
- [ueno](https://www.ueno.com.py/personas/caja-de-ahorro/) y su [aplicación oficial](https://play.google.com/store/apps/details?hl=es&id=py.com.elcomercio.retailbanking): cuenta, transferencia, pago y movimientos recientes con poca profundidad.
- [Banco Familiar](https://www.familiar.com.py/) y su [aplicación oficial](https://play.google.com/store/apps/details?hl=es&id=py.com.familiar.app): tablero actualizado para encontrar los datos importantes al ingresar.

ATLAS usa esos principios de jerarquía, no una copia visual literal. Mantiene identidad, colores, textos y componentes propios.

## Hallazgos medidos

### Finanzas anterior

- Altura móvil de la página inicial: 3.227 px.
- “Cuánto debo” aparecía recién después de aproximadamente 1.393 px.
- Nueve tarjetas de resumen competían con el dato principal.
- El formulario de una operación diaria abría 16 controles y 14 etiquetas.
- Cierre, patrimonio, presupuestos, metas, migración y configuración tenían casi el mismo peso que registrar un gasto.

### RR. HH. anterior

- Diez pestañas aparecían al mismo nivel.
- La nómina era una tabla ancha de diez columnas.
- El cálculo de horas podía llegar a quince columnas.
- Configuración, importaciones, auditoría y operación diaria estaban mezcladas.
- Sucursales, áreas y cargos podían editarse, pero no archivarse ni recuperarse desde la interfaz.

### Inicio anterior

- El saludo, porcentaje diario, cinco altas, prioridad, agenda, módulos, tareas, ritmo, sugerencias y notas aparecían como bloques abiertos.
- Cargaba el almacenamiento financiero aunque el usuario no fuera a usar copias de seguridad.

## Resultado v0.11

### Finanzas

La primera pantalla responde, en este orden:

1. Cuánto hay disponible.
2. Cuánto se debe en total.
3. Qué se debe pagar este mes.
4. Cuánto se acumuló para las metas de ahorro.
5. Cuál es el próximo pago.
6. Cuánto entró, salió y quedó en el mes.

Resultados móviles medidos con 390 × 844 px:

- La primera iteración simple redujo la altura de 3.227 px a 1.373 px; después se incorporó la tarjeta funcional de ahorro solicitada.
- Disponible y acciones frecuentes aparecen antes de 420 px.
- Deuda total y pagos del mes aparecen dentro del primer alto de pantalla.
- El alta diaria muestra cinco campos básicos: importe, tipo, cuenta, categoría y descripción.
- Fecha, estado, medio, contraparte, etiquetas, nota y comprobante están en “Agregar…”.
- La acción Guardar queda visible sin abrir las opciones avanzadas.

La navegación móvil queda en Inicio, Movimientos, Nuevo, Pagos y Más. Cuentas, presupuestos, metas, patrimonio, cierres, informes, categorías, medios, contextos, auditoría y migración siguen disponibles, pero ya no invaden el uso diario.

#### Especificación financiera definitiva incorporada

- Flechas anterior/siguiente y selector directo permiten recorrer meses pasados y futuros.
- Los movimientos y sus filtros quedan limitados al mes activo; un rango no puede mezclar periodos.
- “Compra” es un alta principal con fecha, descripción, monto, categoría, medio y forma al contado o financiada.
- Una compra al contado se registra como gasto confirmado del mes.
- Una compra financiada crea cuotas mensuales independientes, con entidad, cantidad, progreso y próximo vencimiento.
- El total se reparte en enteros PYG. Por ejemplo, ₲ 1.000.001 en 12 cuotas sigue sumando exactamente ₲ 1.000.001.
- Se corrigió el error anterior que podía repetir el monto total en cada cuota.
- Las cuotas muestran cuántas se pagaron, el estado en español y la próxima fecha.
- Atrasado, vence hoy, próximo, pagado y eliminado tienen señales visuales diferentes.
- Las categorías iniciales incluyen Salario, Trabajos extra, Otros ingresos, Compras y Estudios sin reemplazar las categorías existentes del usuario.
- Ahorro muestra objetivo, acumulado, aportes y retiros por mes.
- Inversiones muestra capital actual y rendimiento absoluto y porcentual a partir de valuaciones reales.
- Eliminar una compra financiada revierte de manera controlada sus pagos y elimina toda la serie de cuotas de la vista, conservando auditoría.
- Los movimientos eliminados no aparecen en la vista normal; se pueden consultar mediante el filtro correspondiente.

### RR. HH.

La navegación principal queda en:

1. Inicio.
2. Personas.
3. Asistencia.
4. Novedades.
5. Más.

“Más” contiene estructura y reglas, importaciones, cálculo de horas, contratos, control laboral e IPS.

La nómina ahora se muestra como fichas de personas. Cada ficha enseña nombre, cargo, sucursal, cédula, cliente, estado y una acción directa “Ver y editar”. El alta nueva pide primero cédula, nombre, cliente, sucursal, cargo, ingreso y estado; el resto del legajo es desplegable.

### Inicio

- El encabezado concentra saludo y estado del día.
- Las cinco altas directas quedan como botones compactos.
- “Necesita tu atención” aparece antes que la organización secundaria.
- Tareas, ritmo, sugerencias y notas están dentro de un único bloque plegado.

## Modificación, anulación y recuperación

| Registro | Acción segura disponible |
|---|---|
| Movimiento confirmado | Editar y eliminar de la vista con historial |
| Borrador financiero | Editar y eliminar |
| Pago o cobro | Editar y eliminar con recálculo del saldo |
| Deuda o compromiso | Editar, pagar/cobrar y eliminar |
| Compra financiada | Editar por cuota o eliminar la serie completa |
| Cuenta, categoría, medio, meta, activo | Editar, eliminar de la vista y restaurar |
| Persona | Ver, editar, activar o inactivar |
| Novedad de RR. HH. | Editar, anular y reactivar |
| Marcación | Corregir y eliminar con confirmación |
| Horario | Editar mediante nueva vigencia, desactivar y reactivar |
| Sucursal, área y cargo | Editar, archivar y reactivar |
| Asignación | Finalizar o trasladar conservando vigencias |

Los registros contables confirmados, vigencias laborales y auditorías no se destruyen físicamente: se anulan o archivan. Esto evita que un botón “Eliminar” rompa saldos, cálculos o antecedentes. Los borradores y marcaciones corregibles sí admiten eliminación confirmada.

## Rendimiento

- finance-storage.js dejó de bloquear la carga de Inicio; se carga bajo demanda para resumen local o copias.
- Tesseract dejó de cargarse al abrir RR. HH.; se descarga solo cuando se procesa una captura IPS.
- Las herramientas secundarias se mantienen cerradas hasta que el usuario las pide.
- No se modificó la base Supabase ni fue necesaria una migración destructiva.

## Criterio de aceptación

- Los datos financieros existentes abren sin migración SQL nueva.
- Los meses anteriores y futuros no mezclan movimientos.
- Una compra financiada conserva exactamente el monto total al dividir sus cuotas.
- Ahorro e inversiones tienen una entrada directa y un resumen entendible.
- Las cinco funciones básicas de Finanzas están dentro del primer recorrido móvil.
- El alta simple no obliga a completar campos avanzados.
- RR. HH. no muestra más de cinco destinos principales.
- Todas las entidades operativas principales tienen edición y una salida segura: anulación, archivo, inactivación o eliminación confirmada según su naturaleza.
- La suite histórica v0.10 y la auditoría específica v0.11 deben quedar verdes antes de publicar.
