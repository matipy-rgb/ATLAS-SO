# ATLAS SO · v0.3.3

Centro personal de operaciones para escritorio y teléfono, con acceso por cuenta, recuperación de contraseña y sincronización en la nube.

## Módulos

- Centro de mando con alertas y tareas rápidas.
- Finanzas con cuentas, vencimientos, pagos parciales y comprobantes.
- Estudios con instituciones, materias, entregas, avance y resultados.
- Trabajo con horas, bruto, descuentos y neto.
- Recursos Humanos con funcionarios, vacaciones, reposos, maternidad y reintegros automáticos.
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

## Teléfono y APK

La aplicación incluye un manifiesto PWA para instalarla desde Chrome y una configuración Capacitor 8. El flujo manual de GitHub Actions `Generar APK de prueba` produce un APK de depuración descargable sin compilarlo en la computadora local.
