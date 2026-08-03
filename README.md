# ATLAS SO · v0.9.0

ATLAS SO reúne la operación personal y de RR. HH. en una aplicación instalable, privada y sincronizada.

## RR. HH. Operación Real y Gestión Masiva v0.9

La v0.9 amplía la base estable v0.8 sin reconstruirla. El flujo operativo ahora
se organiza de forma explícita como:

```text
Empresa → Cliente → Sucursal → Funcionario → Asignación → Horario → Marcación → Novedad
```

- Selector persistente de empresa, cliente y sucursal, aplicado a nómina,
  asignaciones, métricas, marcaciones, novedades e importaciones.
- Identidad del funcionario separada de su asignación laboral. Un traslado
  cierra la vigencia anterior y crea otra, con motivo, responsable e historial.
- Sucursales, áreas y cargos editables; horario y supervisor vinculados a la
  asignación vigente.
- Motor único para importar funcionarios, clientes, sucursales, asignaciones,
  horarios, marcaciones y novedades desde XLSX, XLS, XLSM o CSV.
- Mapeo automático o manual de columnas, normalización, vista previa, errores
  por fila, hash SHA-256, bloqueo de archivos ya procesados e informe descargable.
- Tablas operativas con selección, búsqueda, ordenamiento, vista compacta,
  copia de filas y adaptación móvil.
- Dashboard accionable con altas, bajas, traslados, personal sin horario,
  marcaciones incompletas, faltas, tardanzas, novedades e importaciones.
- Parámetros legales con vigencia, fuente, responsable e historial. La semilla
  heredada queda marcada para revisión y el motor no incrusta porcentajes legales.
- Correcciones de marcaciones y cambios sensibles con motivo y auditoría.

La v0.9 no incorpora un motor salarial definitivo, liquidaciones finales, una
fábrica documental completa ni una APK final. Esos alcances permanecen fuera de
producción hasta poder implementarlos y validarlos de forma independiente.

## Base conservada: estabilidad, privacidad y seguridad v0.8

- Las copias nuevas se cifran con AES-GCM y contraseña; la restauración valida
  el contenido completo antes de reemplazar datos.
- Las marcaciones se restauran en una transacción atómica de Supabase.
- RR. HH. falla de forma cerrada: sin verificación vigente del permiso no se
  abre el módulo ni se conserva su copia local para esa cuenta.
- La sincronización aísla los fallos por grupo de datos, conserva la cola entre
  pestañas y reintenta cargas o eliminaciones pendientes de comprobantes.
- El service worker no guarda parámetros de recuperación, tokens ni códigos de
  autenticación en la caché.
- Las políticas RLS reconocen las claves de RR. HH. sin depender de mayúsculas,
  validan las rutas del depósito privado y revocan permisos públicos sobrantes.
- La administración de RR. HH. deja de asignarse al primer registro: se fija por
  UID verificado desde el SQL Editor.

## Base funcional v0.7.1

- Corrige feriados, tolerancias y marcaciones válidas sin horario asignado.
- Sincroniza marcaciones por lotes, usa el último día real de cada mes y conserva
  tanto cambios como eliminaciones hechos sin conexión.
- La copia completa reemplaza datos anteriores e incluye empresa, contratos,
  asignaciones, marcaciones y comprobantes separados por espacio.
- Elimina la simulación aislada de liquidación, que duplicaba el cálculo sin estar conectada al periodo.
- Neutraliza ejemplos y valores personales para que Finanzas, Estudios, Salud, Proyectos, Hábitos y Trabajo sean claros para otras personas.
- Permite registrar horas de trabajo aunque todavía no se conozca la tarifa.
- Agrega pruebas CRUD reales de los seis módulos personales y un recorrido
  encadenado de RR. HH.
- Actualiza el lector de planillas a SheetJS 0.20.3 y deja la auditoría de
  dependencias de producción en cero vulnerabilidades.
- El esquema incluye las políticas RLS completas de marcaciones.

## RR. HH. v0.7

La actualización reorganiza RR. HH. alrededor de dos entidades que nunca se mezclan:

- **Empresa administrada:** nombre visible, razón social, RUC, representante y logo editables.
- El número patronal IPS y la ciudad de celebración también se configuran por
  empresa.
- **Cliente:** nombre, logo, lugar de trabajo, centro de costo y modelo contractual editables.

La **Nómina general** es una vista consolidada de la empresa; no es un cliente, no duplica funcionarios y también puede cambiar de nombre.

### Funcionarios

- Nómina sin cupos artificiales por cliente.
- Filtros separados para activos, inactivos e inactivos del mes.
- Cédula e ID del reloj guardados como campos distintos.
- Importación `.xlsx`, `.xls` y `.xlsm` con vista previa, validación y actualizaciones por cédula.
- Exportación completa compatible con la plantilla maestra.
- Paginación para mantener fluida una nómina extensa.

### Horarios y marcaciones

- Tipos de horario con denominación, días, entrada, salida, descanso, tolerancia
  y vigencia; el modo avanzado permite horas distintas según el día.
- Los cambios crean una nueva vigencia y no alteran meses anteriores.
- Asignación individual e importación/exportación simple por cédula y denominación.
- Importación del reloj con `Nombre | ID | Fecha | Entrada | Salida`.
- Vinculación persistente entre ID del reloj y funcionario.
- Reimportación con conteo de registros nuevos, actualizados e iguales, sin duplicar.
- `FALTA` se conserva como dato original pendiente de clasificar.

### Cálculo de horas

El motor de horas clasifica:

- Total de horas y días trabajados.
- Horas nocturnas ordinarias.
- Extras diurnas y nocturnas.
- Domingos y feriados, incluidos los tramos nocturnos.
- Ausencias, horas faltantes, vacaciones, maternidad, permisos y reposos.
- Resumen y detalle exportables a Excel.

Los domingos, feriados, cruces de medianoche, jornadas incompletas y faltas pendientes se calculan explícitamente y quedan auditables. Los importes estimados solo se obtienen a partir de la versión vigente de parámetros configurables.

### Contratos

- Módulo propio con búsqueda por funcionario.
- Modelo automático por identificador estable del cliente.
- Modelos iniciales AMANCER, BDP, ARCOR, POLO y GEOMAX.
- Certificado de trabajo y adendas 1 y 2.
- Vista previa, generación Word, impresión/PDF e historial.
- Validación de datos faltantes —incluido el salario nominal real— antes de generar.
- Saneamiento del contenido editable antes de guardar o descargar.
- Referencia al artículo 46 para los datos del contrato escrito, sin imponer un
  periodo de prueba automático.

### Volumen y seguridad

Los funcionarios no tienen un máximo configurado. Las marcaciones se guardan por fila y periodo en `hr_attendance_records`, con copia local en IndexedDB para trabajar sin conexión. Toda instalación debe terminar aplicando `supabase/v0.8-security-privacy-sync.sql`.

## Áreas personales

- Finanzas: ingresos, gastos, cuentas, cuotas y comprobantes.
- Estudios: materias, entregas, exámenes y avance.
- Salud: peso, sueño, agua, energía y entrenamiento.
- Proyectos: plazos, progreso y próxima acción.
- Hábitos: control diario y rachas.
- Trabajo: horas, tarifa opcional, bruto, descuentos y neto.

## Verificación

```bash
npm install
npm run check
```

La suite valida sintaxis, autenticación, apertura y cambios sin conexión, copia
por reemplazo, CRUD de los seis módulos personales, contexto empresa/cliente,
flujo completo de RR. HH., cálculo diurno/nocturno, feriados, tolerancias,
faltas, reimportaciones de 10.000 registros, cálculo de 62.000 jornadas y el
aislamiento de 1.500 funcionarios sintéticos entre cinco clientes y quince
sucursales. También verifica que no existan secretos ni artefactos empresariales
preparados para Git.

El informe completo se encuentra en
`AUDITORIA-ATLAS-SO-v0.9.md`.

## Migración desde v0.8

1. Trabajar desde `main` limpia y etiquetada como `v0.8.0`.
2. Crear la rama `v0.9-rrhh-operacion-real`.
3. Conservar el `atlas-config.js` local; la copia versionada no contiene claves.
4. Ejecutar `supabase/v0.9-rrhh-operation.sql` después de la migración v0.8.
5. Ejecutar `npm install` y `npm run check`.

La migración SQL es aditiva e idempotente. El procedimiento completo y la
recuperación se documentan en `INSTALAR-ATLAS-SO-v0.9.md`.

## Instalación y móvil

La aplicación funciona como PWA y contiene configuración Capacitor 8. `npm run mobile:prepare` genera la carpeta `www` para Android.
