# ATLAS SO v0.8 · entrega de estabilidad, privacidad y seguridad

Esta versión parte del checkpoint v0.8 recibido y conserva su alcance funcional
y visual. No agrega módulos ni rediseña pantallas.

## Correcciones aplicadas

- Permisos de RR. HH. con verificación en línea y denegación por defecto.
- Políticas RLS y funciones de Supabase con privilegio mínimo.
- Rutas privadas de archivos validadas antes de evaluar membresía.
- Administrador de RR. HH. configurado por UID, nunca por orden de registro.
- Restauración atómica de marcaciones mediante RPC transaccional.
- Cola durable e independiente por grupo para cambios sin conexión.
- Reintento de comprobantes pendientes y eliminaciones del depósito privado.
- Copias nuevas cifradas con PBKDF2, AES-256-GCM y contraseña del usuario.
- Validación completa de la copia antes de cualquier reemplazo.
- Caché sin parámetros de autenticación y política CSP en páginas públicas y
  protegidas.
- Ejemplos y documentación sin nombres ni identificadores personales reales.

## Aplicación en Supabase

Una base existente debe ejecutar al final
`supabase/v0.8-security-privacy-sync.sql`. Una instalación nueva sigue el orden
indicado en `CONFIGURAR-ACTUALIZACION.md`.

## Verificación

La entrega solo se empaqueta después de aprobar `npm run check`, el análisis de
dependencias de producción y el barrido final del ZIP.
