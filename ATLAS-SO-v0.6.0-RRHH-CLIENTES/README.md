# ATLAS SO · v0.6.0

ATLAS SO reúne lo importante de la vida diaria en un solo espacio personal, sencillo de usar desde computadora o teléfono.

## Experiencia v0.5

- Portada pública que explica qué es ATLAS SO antes de pedir una cuenta.
- Inicio “Mi día” con prioridad diaria, progreso, agenda unificada y sugerencias.
- Registro rápido global para tareas, dinero, estudios, salud y notas.
- Búsqueda global desde cualquier módulo.
- Guía inicial para cuentas nuevas y orden personalizado de áreas.
- Navegación móvil simplificada con botón central para registrar.
- Página clara de privacidad y acceso más confiable.
- Copia completa compatible con los datos y comprobantes anteriores.

## Áreas personales

- Finanzas: ingresos, gastos, cuentas, cuotas, pagos parciales y comprobantes.
- Estudios: instituciones, materias, entregas, exámenes, avance y resultados.
- Salud: peso, sueño, agua, energía y entrenamiento.
- Proyectos: plazos, progreso y próxima acción.
- Hábitos: control diario, rachas y consistencia semanal.
- Trabajo: horas, bruto, descuentos y neto.

## RR. HH. v0.6

El módulo permanece disponible únicamente para la cuenta administradora e incorpora:

- Empresas administradas independientes.
- A Support con Arcor, BDP, Servieri, Geomax y Polo Este.
- Panel y datos separados para cada cliente.
- Importación Excel con revisión, errores y confirmación antes de procesar.
- Exportación de la nómina actualizada a Excel.
- Funcionarios, sucursales y horarios.
- Marcaciones, novedades y liquidación.
- Alertas IPS y MTESS.
- Conversor privado REOP → CSV IPS.

Esta actualización no modifica la estructura de RR. HH. ni requiere ejecutar otro archivo SQL. Si la instalación todavía no aplicó la seguridad administrativa de la v0.4, debe ejecutarse una sola vez `supabase/v0.4-rrhh-admin.sql`.

## Seguridad y sincronización

- Supabase Auth para correo y contraseña.
- Recuperación de acceso mediante enlace por correo.
- Datos separados por cuenta con políticas Row Level Security.
- Copia local para trabajar con rapidez y sincronización en la nube.
- Página pública sin publicidad ni rastreadores comerciales.

## Teléfono y APK

La aplicación incluye PWA instalable desde Chrome y configuración Capacitor 8. El comando `npm run mobile:prepare` genera la carpeta `www` con la misma versión para Android.
