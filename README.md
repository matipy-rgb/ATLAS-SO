# ATLAS SO · v0.4.1

Centro personal de operaciones para escritorio y teléfono, con acceso por cuenta, recuperación de contraseña y sincronización en la nube.

## Módulos

- Centro de mando con alertas y tareas rápidas.
- Finanzas con cuentas, vencimientos, pagos parciales y comprobantes.
- Estudios con instituciones, materias, entregas, avance y resultados.
- Trabajo con horas, bruto, descuentos y neto.
- Recursos Humanos privado con funcionarios, clientes, sucursales, horarios, marcaciones, novedades, liquidación y alertas IPS/MTESS.
- Conversor privado de capturas REOP a CSV IPS para movimientos de permiso, con lectura local, revisión y controles de formato.
- Salud con peso, sueño, agua y entrenamiento.
- Proyectos con plazos, progreso y próxima acción.
- Personal con hábitos, rachas y consistencia semanal.

## Seguridad y datos

- Supabase Auth para correo y contraseña.
- Recuperación de acceso mediante enlace por correo.
- Espacio separado por usuario y políticas Row Level Security.
- Copia local para trabajar con rapidez y sincronización por cuenta.
- Migración automática de los datos de la versión anterior al primer usuario que ingrese.

La conexión pública con Supabase ya está cargada en esta compilación. Antes de crear la primera cuenta, completá las direcciones permitidas siguiendo [CONFIGURAR-ACTUALIZACION.md](CONFIGURAR-ACTUALIZACION.md).

Antes de abrir la v0.4.1, ejecutá una sola vez `supabase/v0.4-rrhh-admin.sql`
en el SQL Editor. La primera cuenta registrada quedará fijada como única
administradora de RR. HH.; para las demás cuentas el menú, la ruta y los datos
permanecerán bloqueados.

## Teléfono y APK

La aplicación incluye un manifiesto PWA para instalarla desde Chrome y una configuración Capacitor 8. El flujo manual de GitHub Actions `Generar APK de prueba` produce un APK de depuración descargable sin compilarlo en la computadora local.
