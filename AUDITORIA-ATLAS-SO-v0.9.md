# ATLAS SO v0.9.0 · informe de implementación y validación

## Resultado ejecutivo

La base v0.8 se conservó y se amplió con el núcleo **RR. HH. Operación Real y
Gestión Masiva**. La implementación separa identidad y asignación, incorpora el
contexto de sucursal, un motor único de importaciones, auditoría de cambios y un
dashboard accionable.

La suite completa finalizó correctamente. La prueba de volumen utilizó 1.500
funcionarios sintéticos, cinco clientes y quince sucursales, con cero filtraciones
entre contextos y cero duplicados al reimportar. No se utilizó información
empresarial real.

## Auditoría focalizada de la base v0.8

| Área | Estado v0.8 | Cambio v0.9 | Resultado | Evidencia |
|---|---|---|---|---|
| Empresa y cliente | FUNCIONAL | Contexto persistente extendido a sucursal | FUNCIONAL | Prueba de aislamiento v0.9 |
| Sucursales | AUSENTE | CRUD y selector de alcance | FUNCIONAL | Recorrido funcional y prueba estática |
| Funcionarios | FUNCIONAL | Identidad separada de la asignación, búsqueda, selección y operaciones rápidas | FUNCIONAL | Regresión CRUD |
| Asignaciones | PARCIAL | Vigencias históricas, traslados, área, cargo, supervisor y horario | FUNCIONAL | Prueba de transición histórica |
| Horarios | FUNCIONAL | Vinculación a la asignación vigente e importación centralizada | FUNCIONAL | Regresión RR. HH. |
| Marcaciones | FUNCIONAL | Contexto de sucursal/asignación y corrección justificada | FUNCIONAL | Pruebas de cálculo, sincronización y auditoría |
| Novedades | PARCIAL | Tipos consolidados, estado, impacto, respaldo y auditoría | FUNCIONAL PARA CONTROL OPERATIVO | Recorrido funcional |
| Importaciones | PARCIAL | Motor único con mapeo, vista previa, hash, errores e historial | FUNCIONAL | Pruebas de idempotencia y volumen |
| Dashboard RR. HH. | PARCIAL | Doce métricas accionables | FUNCIONAL | Prueba de métricas v0.9 |
| Auditoría | PARCIAL | Registro transversal de cambios sensibles | FUNCIONAL | Historial operativo |
| Parámetros legales | SIMULADA EN CÓDIGO | Versiones con vigencia, fuente y responsable | FUNCIONAL, REQUIERE VALIDACIÓN LEGAL | Prueba estática y UI de parámetros |
| Acceso/RLS | FUNCIONAL | Se conserva denegación por defecto y administración principal | FUNCIONAL | Suite seguridad/privacidad |
| Modo sin conexión | FUNCIONAL | Nuevas claves incluidas en sincronización y copia | FUNCIONAL | Prueba offline |

## Arquitectura incorporada

- `rrhh-v09-core.js`: modelo puro de asignaciones, aislamiento, importación e
  indicadores. Puede probarse sin navegador.
- `rrhh-operation.js`: migración controlada, estructuras, traslados, auditoría,
  parámetros versionados y dashboard operativo.
- `rrhh-bulk-import.js`: lectura XLSX/XLS/XLSM/CSV, mapeo, validación, vista
  previa, SHA-256, procesamiento e informe de errores.
- `rrhh-context.js`: contexto activo de empresa, cliente y sucursal.
- `rrhh-storage.js` y `rrhh-super.js`: persistencia de sucursal/asignación y
  correcciones justificadas de marcaciones.
- `supabase/v0.9-rrhh-operation.sql`: migración aditiva para `branch_id` y
  `assignment_id`, índices y restauración atómica actualizada.

La fuente central sincronizada continúa siendo Supabase. El almacenamiento
local conserva su función de caché y trabajo sin conexión; no se agregó una base
paralela.

## Importación masiva

El flujo implementado es: archivo → detección → tipo → lectura → mapeo →
normalización → validación → vista previa → confirmación → procesamiento →
resultado → informe → historial.

Controles principales:

- límite de 50 MB, 250.000 filas y 200 columnas;
- errores y advertencias asociados a la fila de origen;
- bloqueo de confirmación si existen errores graves;
- hash SHA-256 y bloqueo de archivos ya procesados;
- cédula normalizada y claves naturales estables;
- lote de funcionarios recuperable si falla el procesamiento;
- registro de usuario, contexto, cantidades, duración y resultado.

## Pruebas y métricas

| Prueba | Registros | Resultado esperado | Resultado real | Estado |
|---|---:|---|---|---|
| Suite integral `npm run check` | Proyecto completo | Cero fallas | Cero fallas | APROBADA |
| Aislamiento por cliente | 1.500 funcionarios | Cero mezclas | 0 filtraciones | APROBADA |
| Aislamiento por sucursal | 15 sucursales | Cero mezclas | 0 filtraciones | APROBADA |
| Búsqueda sintética | 1.500 funcionarios | Un resultado exacto | 0,328 ms; un resultado | APROBADA |
| Filtro por contexto | 1.500 funcionarios | 300 registros del cliente | 7,383 ms; 300 correctos | APROBADA |
| Métricas operativas | 1.500 funcionarios | Conteos consistentes | 12,565 ms | APROBADA |
| Reimportación idempotente | Registro repetido | No duplicar | 0 duplicados | APROBADA |
| Traslado | Dos vigencias | Cerrar anterior y crear nueva | Historial preservado | APROBADA |
| Seguridad y privacidad | Proyecto completo | Cero fallas críticas | Cero fallas | APROBADA |
| Secretos y artefactos | Archivos preparados para Git | Cero hallazgos | 0 hallazgos | APROBADA |

Los tiempos corresponden a la ejecución automatizada del entorno de validación y
no constituyen una promesa de rendimiento para todos los equipos.

## Seguridad y datos

- La copia versionada de `atlas-config.js` permanece sin URL ni clave.
- La configuración local operativa no forma parte del paquete ni del commit.
- No hay Excel, CSV, PDF, imágenes ni resultados empresariales preparados para Git.
- Las pruebas usan nombres, cédulas y estructuras sintéticas.
- RR. HH. conserva la denegación por defecto y exige verificación vigente del
  administrador principal.
- Las migraciones son aditivas e idempotentes; no eliminan tablas ni datos.

## Archivos principales nuevos

- `rrhh-v09-core.js`
- `rrhh-operation.js`
- `rrhh-bulk-import.js`
- `scripts/test-rrhh-v09.mjs`
- `scripts/test-no-sensitive-artifacts.mjs`
- `supabase/v0.9-rrhh-operation.sql`
- `INSTALAR-ATLAS-SO-v0.9.md`
- `APLICAR-ATLAS-SO-v0.9.ps1`

No se agregaron dependencias. Se conservaron las versiones ya bloqueadas en
`package-lock.json`.

## Límites y backlog

| Pendiente | Motivo | Impacto | Versión futura recomendada |
|---|---|---|---|
| Motor salarial completo | Requiere reglas legales, casos y validación independiente | No genera liquidación definitiva | v1.0 o fase dedicada |
| Liquidaciones finales y aguinaldo | Fuera del núcleo operativo | Se controlan datos, no el cálculo final | Fase salarial |
| Fábrica documental completa | Requiere plantillas y firma/versionado | Se conservan contratos existentes | Fase documental |
| Portal del funcionario | Requiere roles y aislamiento adicionales | Solo opera la cuenta administradora | Fase de acceso |
| Integraciones IPS/MTESS/banco | Requieren formatos y autorización vigentes | Exportaciones existentes siguen siendo auxiliares | Fase regulatoria |
| Aplicación comercial separada | No debe duplicar prematuramente la plataforma | Sin impacto en uso interno | Futuro producto |
| APK definitiva | Necesita firma y distribución | La PWA y preparación Capacitor continúan disponibles | Fase móvil |
| Aplicar migración SQL | Requiere autorización sobre Supabase productivo | Las columnas remotas nuevas no existen hasta aplicarla | Antes de prueba productiva |

## Criterio de cierre

La rama puede presentarse para revisión cuando:

- el usuario aplique la migración en un entorno controlado;
- ejecute el recorrido manual con datos sintéticos;
- confirme la vigencia de los parámetros legales;
- vuelva a ejecutar `npm run check` en su instalación;
- verifique la configuración local de Supabase.

No se debe fusionar, etiquetar, publicar ni borrar la rama sin confirmación
expresa del usuario.
