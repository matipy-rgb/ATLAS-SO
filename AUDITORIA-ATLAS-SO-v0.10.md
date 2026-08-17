# ATLAS SO v0.10 · Auditoría técnica integral

Fecha: 17 de agosto de 2026

Rama: `v0.10-finanzas-control-patrimonial`

Base verificada: `main` / v0.9.0

Estado: las cinco etapas están implementadas en la rama local. No se publicó, fusionó ni aplicó la migración en Supabase.

## Alcance construido

### 1. Base financiera

- Contextos Personal y emprendimientos aislados, con vista General de solo lectura.
- Cuentas, categorías y medios de pago configurables, editables y archivables.
- PYG entero como única moneda.
- IndexedDB normalizado por registro, cola durable, idempotencia y conflictos explícitos.
- Acceso financiero exclusivo del propietario en interfaz, almacenamiento, respaldo, RLS y archivos privados.
- Migración v0.9 con previsualización, validación, informe de errores, conciliación e importación repetible sin duplicados.

### 2. Operación diaria

- Ingreso, gasto, transferencia, ajuste, aporte, retiro, reembolso, cobro y pago.
- Transferencias con dos lados guardados localmente en una sola transacción y remotamente por RPC.
- Separación entre efecto en saldo y efecto en resultado: las transferencias son neutrales y una compra con tarjeta registra el gasto cuando ocurre.
- Estados pendiente y confirmado; los borradores sin relaciones pueden eliminarse y los confirmados se anulan con motivo.
- Edición, anulación con motivo, contraparte, etiquetas, búsqueda, filtros y filtros guardados editables/archivables.
- Comprobantes JPG, PNG, WebP y PDF de hasta 10 MB, primero locales y luego en el depósito privado; también pueden quitarse del registro y del objeto remoto.
- Exportaciones CSV y Excel protegidas contra fórmulas inyectadas.

### 3. Compromisos

- Cuentas por pagar y cobrar, préstamos, cuotas, tarjetas y compromisos recurrentes.
- Pagos o cobros parciales, interés y recargo opcionales, con validación del saldo restante.
- Pagos de tarjeta o préstamo que reducen efectivo y pasivo sin duplicar el gasto.
- Estados pendiente, parcial, por vencer, vence hoy, vencido, pagado, cobrado y anulado.
- Recurrencias semanales, mensuales, trimestrales o anuales; cada fecha se genera independientemente de pendientes anteriores y sin duplicados.

### 4. Planificación y patrimonio

- Presupuestos mensuales por categoría: planificado, gastado, comprometido, disponible, porcentaje, proyección y alerta.
- Copia controlada al mes siguiente sin sobrescribir presupuestos existentes.
- Metas de ahorro con aportes y retiros trazables, editables y visibles como historial.
- Activos y pasivos con valuaciones manuales fechadas, editables y archivables; no se inventan precios de mercado.
- Patrimonio neto mensual calculado como activos menos pasivos.

### 5. Control mensual

- Flujo de cierre con diez controles, saldo calculado, saldo informado y diferencia por cuenta, más confirmación explícita.
- Fotografía mensual versionada e inmutable.
- Bloqueo de cambios del mes cerrado en JavaScript y mediante disparadores PostgreSQL.
- Reapertura con motivo obligatorio; la versión anterior se conserva.
- Comparación con el mes anterior, resumen de flujo, presupuesto, pendientes y patrimonio.
- Informe imprimible/PDF y exportación Excel.

## Modelo y seguridad

`supabase/v0.10-finance-base.sql` define las entidades normalizadas, claves relacionales, validaciones, auditoría consultable, control optimista de versiones y RPC para operaciones compuestas, borradores, pagos y cierres. Las políticas RLS solo permiten acceso a la persona propietaria del espacio. El depósito `atlas-finance-files` es privado y valida espacio, ruta, MIME y tamaño.

Las copias cifradas incluyen todos los almacenes financieros v0.10 y siguen aceptando copias de la Etapa 1 para migración. Los datos financieros locales se purgan si la cuenta deja de ser propietaria.

## Verificación automatizada

Comando final ejecutado:

```text
npm run check
```

Resultado: todas las pruebas del producto quedaron verdes.

La prueba específica cubre, entre otros casos:

- 10 contextos, 50 cuentas, 100 categorías, 10.000 movimientos, 1.000 compromisos y 60 cierres;
- filtro de 10.000 movimientos y resumen por debajo de 100 ms;
- transferencia equilibrada y neutral;
- compra, reembolso, pago y corrección de tarjeta con efectos correctos y cero gasto duplicado;
- interés/recargo, recurrencia, presupuesto, meta, valuación, archivo y recuperación;
- cierre conciliado, rechazo de escritura cerrada, reapertura versionada y escritura posterior;
- alta y eliminación de borrador pendiente, y carga/eliminación local/remota de comprobante;
- cola durable, recarga y conflicto compuesto explícito;
- rol no propietario denegado;
- migración válida, inválida y repetida con cero duplicados;
- estructura HTML móvil, caché, respaldo, SQL, RLS y ausencia de secretos.

## Validación visual real

La aplicación fue recorrida en el navegador local con vistas de computadora (1.440 × 900) y teléfono (390 × 844 y ancho mínimo de 360 px). Se comprobó el alta de una cuenta, el registro de un gasto, la actualización inmediata de saldos y patrimonio, las cinco rutas de navegación móvil y la ausencia de errores en la consola. La revisión detectó y corrigió un desborde horizontal del selector de mes; la repetición quedó sin desborde en 360 y 390 px.

## Límites de validación de este entorno

No había un servidor PostgreSQL/Supabase local ni la CLI correspondiente, por lo que el SQL fue revisado estáticamente y está cubierto por pruebas de contratos, pero todavía debe ejecutarse en un proyecto Supabase aislado.

## Puertas antes de publicar

1. Aplicar `supabase/v0.10-finance-base.sql` en Supabase aislado y probar propietario/no propietario, RPC, RLS, archivos, cierre y reapertura.
2. Completar en una sesión real la reconexión, el zoom y el teclado móvil contra ese proyecto aislado.
3. Revisar el diff completo y los resultados de prueba.
4. Solo con aprobación separada: commit final, push, Pull Request, merge, etiqueta, release, Supabase productivo y GitHub Pages.

No se realizó ninguna de esas acciones de publicación.
