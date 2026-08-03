# ATLAS SO v0.6 · RR. HH. por empresa y cliente

## Nuevo modelo de trabajo

RR. HH. ahora separa dos niveles:

1. **Empresa administrada:** la organización para la que la persona usuaria gestiona el servicio.
2. **Cliente operativo:** la empresa o cuenta donde se asignan funcionarios y operaciones.

A Support incluye inicialmente:

- Arcor · referencia de hasta 60 funcionarios.
- BDP / Bebidas del Paraguay · hasta 5.
- Servieri · hasta 1.
- Geomax · hasta 2.
- Polo Este · hasta 1.

Se pueden agregar nuevas empresas administradas y nuevos clientes. Cada espacio conserva por separado funcionarios, ausencias, sucursales, horarios, marcaciones, cumplimiento IPS/MTESS y demás registros.

## Excel de funcionarios

La sección Funcionarios permite:

- Descargar la plantilla maestra.
- Leer archivos `.xlsx`, `.xls` y `.xlsm`.
- Encontrar automáticamente la hoja de datos personales.
- Detectar cédulas repetidas en el archivo.
- Detectar cédulas ya existentes y tratarlas como actualización.
- Rechazar filas sin cédula o sin nombre.
- Revisar la vista previa completa antes de guardar.
- Procesar solo después de una confirmación explícita.
- Exportar nuevamente la nómina actualizada en Excel.

## Compatibilidad

- La información anterior de RR. HH. se migra al espacio A Support → Arcor la primera vez.
- No requiere ejecutar un SQL nuevo.
- Mantiene autenticación, sincronización, recuperación, PWA y preparación Android.
- El lector Excel se incluye dentro del paquete para poder trabajar sin depender de una página externa.
