# Auditoría exhaustiva de ATLAS SO v0.7.1

## Resultado

La versión v0.7.1 queda aprobada para integración y prueba en el entorno real.
No se detectaron bloqueos en la ejecución local, la suite completa, la
persistencia sin conexión, los archivos Excel ni la preparación móvil.

La aprobación no sustituye cuatro comprobaciones que solo pueden hacerse
después del despliegue: aplicar el SQL en el Supabase real, probar permisos con
dos cuentas reales, confirmar la entrega de correo SMTP y revisar la PWA/APK en
un dispositivo físico.

## Alcance revisado

- Inicio de sesión, recuperación y apertura sin conexión para cuentas conocidas.
- Portada, captura rápida, prioridad diaria, tareas, notas y búsqueda.
- Finanzas, Estudios, Salud, Proyectos, Hábitos y Trabajo.
- Empresa, cliente, funcionarios, novedades, horarios, asignaciones,
  marcaciones, cálculos, contratos, checklist e IPS.
- Importación/exportación XLSX, XLS, XLSM y CSV.
- Copia completa, restauración, comprobantes e información mensual de
  marcaciones.
- Sincronización local/nube, PWA, service worker y paquete Android.
- Permisos RLS, roles, exposición de datos y dependencias.
- Claridad del lenguaje, accesibilidad básica y eliminación de funciones
  desconectadas.

## Hallazgos y correcciones

| Área | Hallazgo | Corrección aplicada | Verificación |
|---|---|---|---|
| Sin conexión | Un cambio pendiente podía perderse al cerrar la página y una eliminación podía reaparecer | Cola durable por espacio y registro de eliminaciones pendientes | Recarga sin red, reconexión y borrado probados |
| Copia completa | La restauración mezclaba datos viejos y omitía marcaciones/comprobantes | Restauración por reemplazo, datos RR. HH. por empresa y archivos por espacio | Reemplazo automatizado y validaciones de formato |
| Restauración nube | Borrar todo antes de cargar exponía a una copia parcial | Se cargan primero los registros restaurados y luego se retiran los obsoletos por lotes | Revisión de flujo y control de errores |
| Fechas | Fechas imposibles podían normalizarse a otro día | Parser estricto y controles de rangos | Casos válidos, invertidos e imposibles |
| Cálculo | Trabajo sin horario quedaba en cero; feriados podían contarse como falta; tolerancia se aplicaba completa | Jornada preservada con advertencia, feriado correcto y excedente real | Pruebas diurnas, nocturnas, domingos, feriados y tolerancia |
| Salario | El formulario proponía un monto por defecto | Salario inicial en cero y contrato bloqueado hasta cargar el monto real | Alta de funcionario y validación contractual |
| Horarios | Un solo horario diario no cubría turnos diferentes por día | Modo simple y modo avanzado por día, ambos versionados | Creación, asignación y cálculo encadenados |
| Reimportación | Una segunda exportación del reloj podía duplicar o pisar cambios | Comparación por funcionario/fecha con nuevo, actualizado e igual | 10.000 registros, 1.000 cambios y ningún duplicado |
| Volumen | Datos mensuales grandes no debían depender de una lista única del navegador | IndexedDB local, tabla por fila y lotes de nube | 62.000 jornadas y meses de 28/29/30/31 días |
| Contratos | Una vista previa vieja o HTML pegado podía contaminar el documento | Huella de campos, saneamiento y límite de historial | Horario, vista previa, generación e historial probados |
| Contratos | La cabecera citaba el artículo 48 en vez del 46 y un modelo imponía 60 días de prueba sin clasificar el cargo | Referencia corregida, supuesto retirado y advertencia para plazos determinados | Comparación con la Ley 213 y regresión contractual |
| Multiempresa IPS | El número patronal estaba fijo para todas las empresas | Campo patronal por empresa, validación y nombre de archivo con empresa | Revisión estática y bloqueo cuando falta el dato |
| Permisos | Un editor tenía capacidades demasiado amplias sobre miembros | Gestión solo para owner/admin, propietario inmutable y columnas limitadas | Revisión de esquema y migración v0.7.1 |
| Instalación nueva | Si el SQL se ejecutaba antes del primer registro podía no existir administrador de RR. HH.; la tabla de marcaciones del esquema base no activaba sus RLS | Trigger para la primera cuenta y políticas completas dentro del esquema base | Revisión de orden, presencia de trigger y políticas |
| Comprobantes | Registros antiguos podían mezclarse entre espacios | Claves con identificador de espacio y compatibilidad controlada | Exportación/restauración revisadas |
| Excel | La dependencia 0.18.5 tenía alertas conocidas | SheetJS oficial 0.20.3, paquete fijado localmente | XLSX/CSV sintético y cinco libros reales |
| Trabajo | No era posible guardar horas sin una tarifa | Tarifa opcional; importes quedan en cero hasta configurarla | CRUD con tarifa cero y posterior edición |
| Lenguaje | Había textos técnicos, duros o poco útiles para usuarios nuevos | Instrucciones neutrales y acciones directas | Revisión de todas las pantallas |
| Accesibilidad | Algunos botones “×” no tenían nombre comprensible | `aria-label="Cerrar"` | Revisión estructural de HTML |
| Funciones duplicadas | Liquidación repetía parcialmente el cálculo sin usar el periodo real | Módulo retirado; Cálculo de horas queda como fuente única | Ausencia del panel y regresión RR. HH. |
| Archivos irrelevantes | Había un modelo OCR duplicado y material de análisis mezclado con la aplicación | Duplicado eliminado y paquete final limitado a archivos ejecutables, documentación y pruebas | Inventario y preparación móvil |

## Matriz funcional

| Módulo | Casos comprobados |
|---|---|
| Acceso | sesión, error vacío, límite de correo, caché segura para apertura sin conexión |
| Mi día | cinco capturas rápidas, tareas, filtros, prioridad, notas, búsqueda y restauración |
| Finanzas | cuentas, movimientos con fecha, pago parcial, deshacer pago, editar/eliminar y validaciones |
| Estudios | alta, avance, completar, reabrir en 0 %, editar, filtrar y eliminar |
| Salud | alta/actualización por fecha, rechazo vacío, peso más reciente, tendencia y eliminación |
| Proyectos | fecha obligatoria, avance, completar, reabrir, editar, filtrar y eliminar |
| Hábitos | alta, edición, marcado de hoy, corrección de siete días, racha y eliminación |
| Trabajo | horas sin tarifa, cálculo posterior con tarifa, edición, filtro mensual y eliminación |
| Funcionarios | alta, cédula/ID separados, salario real, activo/inactivo del mes y checklist |
| Novedades | alta, superposición, anulación/reactivación y reintegro |
| Horarios | modo simple/por día, vigencia, asignación y finalización histórica |
| Marcaciones | manual, importación, vínculo de reloj, reimportación, eliminación offline y exportación |
| Cálculo | ordinarias, nocturnas, extras, domingos/feriados, faltas, permisos y meses completos |
| Contratos | modelo por cliente, datos obligatorios, horario, vista editable saneada e historial |
| IPS | patronal por empresa, límites de archivo/dimensiones, revisión manual y generación CSV |
| Copia | formato permitido, límite, reemplazo de datos y separación por espacio |
| PWA/Android | recursos locales, estrategia de caché y generación de `www` |

## Evidencia ejecutada

```text
npm run check
→ todas las pruebas aprobadas

npm audit --omit=dev
→ found 0 vulnerabilities

npm run mobile:prepare
→ 61 archivos, 31 MB, sin el tarball de desarrollo
```

Pruebas de escala:

- 10.000 marcaciones reimportadas.
- 62.000 jornadas calculadas.
- Meses de 28, 29, 30 y 31 días.
- Libro real del reloj con 2.080 filas.
- Cinco libros reales de marcaciones, cálculo y nómina leídos con SheetJS
  0.20.3.

## Controles obligatorios después de publicar

1. Ejecutar la migración correspondiente y confirmar `Success` en Supabase.
2. Entrar con la cuenta propietaria y con una cuenta común.
3. Crear un dato sencillo con cada cuenta y comprobar que no se mezclen.
4. Confirmar que RR. HH. solo abre para la cuenta autorizada.
5. Hacer una marcación sin red, cerrar, reabrir y reconectar.
6. Descargar una copia, crear un dato temporal y restaurar la copia.
7. Solicitar un correo de recuperación real.
8. Recargar con `Ctrl + F5` y comprobar que el service worker entregue v0.7.1.
9. Probar la PWA o el APK en el teléfono que se usará.
10. Revisar visualmente cualquier lectura OCR antes de descargar el CSV IPS.
11. Someter cada modelo contractual y su causa de plazo determinado a revisión
    de un profesional laboral antes de firmarlo.

Referencia normativa consultada:
[Ley N.º 213, Código del Trabajo, publicada por el MTESS](https://www.mtess.gov.py/wp-content/uploads/2026/01/Ley_213.pdf).

## Decisión

El código está listo para reemplazar v0.7.0. La publicación debe considerarse
completa únicamente después de los controles del entorno real. No conviene
borrar el respaldo anterior hasta que esa comprobación termine.
