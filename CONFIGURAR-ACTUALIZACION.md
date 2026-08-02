# Configurar ATLAS SO v0.7.1

Esta guía separa una instalación nueva de una actualización existente. Antes de
tocar la base de datos, descargá una copia completa desde ATLAS SO y conservá el
respaldo anterior del proyecto.

## Requisitos

- Node.js 22 o 24 LTS.
- Un proyecto de Supabase.
- Sitio servido por HTTP/HTTPS; no abras los HTML con `file://`.
- Nunca guardes contraseñas, App Passwords ni la `service_role key` en el
  proyecto.

En PowerShell podés usar `npm.cmd` si la política del equipo bloquea `npm.ps1`.

## Base de datos

### Instalación nueva

En **Supabase > SQL Editor**, ejecutá una sola vez:

```text
supabase/atlas-schema.sql
```

Ese esquema ya contiene las tablas, funciones, marcaciones, permisos de RR. HH.
y refuerzos de seguridad vigentes en v0.7.1. No ejecutes también las migraciones
históricas en una base nueva.

### Actualización de una instalación existente

- Si ya instalaste v0.7, ejecutá únicamente:

  ```text
  supabase/v0.7.1-security-hardening.sql
  ```

- Si venís de v0.6 o anterior y nunca aplicaste las migraciones de RR. HH.,
  ejecutá, en este orden:

  ```text
  supabase/v0.4-rrhh-admin.sql
  supabase/v0.7-rrhh-scale.sql
  supabase/v0.7.1-security-hardening.sql
  ```

Los scripts no borran la información de la aplicación. Aun así, confirmá que
Supabase muestre `Success` antes de seguir.

## Direcciones permitidas

En **Authentication > URL Configuration** configurá:

- Site URL local: `http://127.0.0.1:5500`
- Redirect URL local: `http://127.0.0.1:5500/**`
- Si usás `localhost`, agregá también `http://localhost:5500/**`.
- Al publicar, agregá la dirección HTTPS real con `/**`.

## Recuperación de contraseña

El remitente se configura en **Authentication > SMTP Settings**. No se escribe
en el código. El correo incluido por Supabase sirve para pruebas limitadas; para
usuarios externos configurá SMTP propio.

## Verificación antes de publicar

Desde la carpeta del proyecto:

```powershell
npm.cmd ci
npm.cmd run check
npm.cmd audit --omit=dev
npm.cmd run mobile:prepare
```

El resultado esperado es:

- Toda la suite de ATLAS SO aprobada.
- `found 0 vulnerabilities`.
- Carpeta `www` generada para Android.

Después de aplicar el SQL en la base real, probá con dos cuentas diferentes:

1. La cuenta propietaria puede abrir RR. HH. y administrar miembros.
2. Una cuenta común no puede abrir RR. HH.
3. Ninguna cuenta ve los datos personales de otra.
4. Un editor puede modificar datos, pero no asignarse un rol administrativo.

## Instalación móvil

La PWA puede instalarse desde Chrome cuando el sitio esté publicado con HTTPS.
Para Android, `npm run mobile:prepare` prepara `www`; el flujo de GitHub Actions
genera el APK de prueba. El APK debe probarse en un dispositivo antes de
distribuirlo.
