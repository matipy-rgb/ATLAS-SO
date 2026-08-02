# ATLAS SO v0.7.1 · versión auditada

Esta versión revisa la aplicación completa, conecta pruebas entre módulos y
reduce decisiones innecesarias para personas sin experiencia técnica.

## Correcciones críticas

- Los cambios hechos sin conexión sobreviven al cierre y se sincronizan al
  volver la red.
- Una marcación eliminada sin conexión ya no reaparece desde la nube.
- La copia completa reemplaza los datos anteriores e incluye configuración de
  empresa, asignaciones, contratos, marcaciones y comprobantes.
- El cálculo conserva jornadas trabajadas aunque falte un horario, trata
  correctamente feriados y aplica la tolerancia solo al excedente.
- Fechas imposibles y rangos invertidos se rechazan.
- Las marcaciones usan el último día real del mes y se sincronizan por lotes.
- La restauración de marcaciones en la nube carga primero la copia y elimina
  registros obsoletos después, reduciendo el riesgo de una restauración parcial.

## Uso más simple

- Trabajo permite registrar horas sin conocer todavía la tarifa.
- Finanzas registra fechas reales, pagos parciales y deshacer pagos.
- Estudios conserva actividades reabiertas con 0 % de avance.
- Salud rechaza días vacíos y toma el último peso disponible.
- Proyectos exige fecha y próxima acción.
- Hábitos permite editar, eliminar y corregir los últimos siete días.
- Se retiraron frases técnicas o juzgadoras y se agregaron nombres accesibles a
  los botones de cierre.

## RR. HH.

- Salario inicial en cero: ATLAS no inventa montos contractuales.
- Horario simple por defecto y opción avanzada con horas distintas por día.
- Empresa, cliente, nómina y domicilio legal editables.
- Funcionarios activos, inactivos e inactivos del mes sin cupos artificiales.
- Importación del reloj con vinculación estable, comparación y reimportación.
- Contratos con validación previa, horario vigente, contenido editable saneado
  e historial.
- El número patronal IPS y la ciudad de los documentos pertenecen a cada
  empresa; ya no quedan fijos para toda la aplicación.
- La referencia del contrato escrito se corrige al artículo 46 y se retira el
  periodo de prueba automático de 60 días.
- Se retiró la pantalla aislada de Liquidación; el resultado oficial permanece
  en Cálculo de horas.

## Seguridad y dependencias

- Los administradores de miembros no pueden crear, modificar ni eliminar al
  propietario del espacio.
- Una instalación nueva asigna correctamente la primera cuenta como
  administradora de RR. HH. aunque el esquema se ejecute antes de registrarla.
- El esquema base activa las políticas RLS de marcaciones sin depender de una
  migración histórica adicional.
- Los permisos SQL de actualización se limitan a las columnas necesarias.
- SheetJS se actualizó a la versión oficial 0.20.3 y la auditoría de dependencias
  de producción informa cero vulnerabilidades.
- Los comprobantes quedan separados por espacio de trabajo.
- Se eliminaron el modelo OCR duplicado y utilidades de análisis que no forman
  parte de la aplicación.

## Verificación

- Suite estructural, autenticación y recuperación.
- Persistencia y eliminación sin conexión.
- CRUD completo de Finanzas, Estudios, Salud, Proyectos, Hábitos y Trabajo.
- Flujo RR. HH.: funcionario → novedad → horario por día → asignación →
  marcación → cálculo → contrato.
- 10.000 marcaciones reimportadas y 62.000 jornadas calculadas.
- Lectura y escritura XLSX/CSV, además de las planillas reales analizadas.
- Preparación PWA/Android.

El detalle completo está en `AUDITORIA-ATLAS-SO-v0.7.1.md`.
