# Plantilla para CSV de movimientos de PERMISO en IPS

## Dato fijo

- Número patronal: `0005-82-01080`

## Columnas en orden exacto

1. Número patronal
2. Número de cédula
3. Nombres
4. Apellidos
5. Código de movimiento
6. Fecha de inicio
7. Fecha de fin
8. Fecha del documento
9. Número de documento que respalda el movimiento
10. Observación

## Reglas fijas

- Movimiento: `PERMISO`.
- Código de movimiento: `11` en la columna 5.
- Usar el `ID` visible de REOP en la columna 9.
- Usar `Fecha Alta` o `Fecha Alta Registro` en la columna 8, salvo indicación expresa de otra fecha documental.
- Observación: `PERMISO` en la columna 10.
- Fechas en formato `dd/mm/aaaa`.
- Separar nombres y apellidos según las columnas de la fuente.
- Cédula solo con números, sin puntos ni comas.
- Conservar el número patronal exactamente como `0005-82-01080`.
- CSV UTF-8 sin BOM.
- Separador: punto y coma (`;`).
- Sin fila de encabezados.
- Sin espacios antes ni después de los datos.
- El archivo no debe abrirse ni guardarse mediante Excel después de generarlo.

## Tratamiento de fechas

- Una sola fecha: repetirla como inicio y fin.
- Periodo continuo: una línea con fecha inicial y final.
- Fechas separadas no consecutivas: una línea diferente por fecha o periodo.
- No inventar ni completar fechas que no estén visibles.
- Si falta la fecha documental, bloquear la descarga y solicitarla antes de generar el CSV.

## Exclusiones

- No incluir reposos, sanciones, licencias de maternidad ni otros movimientos.
- Solo incluirlos si Matías indica expresamente que deben tratarse como permiso.

## Lectura automática desde captura REOP

- La captura mantiene el diseño tabular del REOP.
- Detectar `ID`, `C.I.`, `Nombre`, `Apellidos`, `Desde`, `Hasta`, `Motivo Permiso`, `Tipo Permiso` y `Fecha Alta`.
- Filtrar automáticamente únicamente las filas cuyo movimiento sea permiso.
- Mostrar una vista previa editable antes de descargar.
- Marcar como `Revisar` cualquier cédula, ID, nombre, apellido o fecha dudosa.
- No permitir la descarga mientras exista un dato obligatorio inválido o faltante.
- Procesar la imagen localmente en el dispositivo; no incrustar claves secretas en el navegador.

## Control antes de entregar

- Todos los permisos visibles están incluidos.
- No existen duplicados.
- El ID está en la columna 9.
- El código `11` está en la columna 5.
- Cada línea contiene exactamente 10 columnas.
- No hay BOM ni caracteres ocultos antes del número patronal.
- Cada línea comienza directamente con `0005-82-01080`.
- Informar la cantidad final de registros.

## Ejemplo

```text
0005-82-01080;5469180;EDGAR;LUGO ARMOA;11;20/07/2026;20/07/2026;20/07/2026;1989608;PERMISO
```
