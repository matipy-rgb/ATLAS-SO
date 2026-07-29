# Configurar ATLAS SO v0.7.0

La pantalla de acceso y la conexión pública ya están configuradas. No coloques contraseñas, App Passwords ni la `service_role key` dentro de ningún archivo del proyecto.

## 1. Crear la base de ATLAS SO

1. Creá un proyecto en Supabase.
2. Abrí **SQL Editor**.
3. Copiá y ejecutá todo `supabase/atlas-schema.sql`.
4. Entrá en **Settings > API**.
5. Confirmá que el proyecto muestre las tablas creadas.

Esta compilación ya contiene la **Project URL** y la **Publishable key** proporcionadas. Ambas son datos públicos de la aplicación; la seguridad real la aplican las políticas RLS del archivo SQL.

La Publishable key se puede usar en el navegador. La seguridad real la aplican las políticas RLS del archivo SQL.

## 2. Configurar las direcciones permitidas

En **Authentication > URL Configuration** configurá:

- Site URL local: `http://127.0.0.1:5500`
- Redirect URL local: `http://127.0.0.1:5500/**`
- Cuando publiques: agregá también la dirección HTTPS real de ATLAS SO con `/**`.

Si Live Server usa `http://localhost:5500`, agregá esa dirección también.

## 3. Correo provisional para recuperar contraseñas

El remitente no se escribe en el código. Se configura en **Authentication > SMTP Settings** para que su contraseña nunca quede expuesta.

Para las primeras pruebas podés usar el servicio de correo incluido por Supabase, pero tiene límites fuertes y solo envía a direcciones autorizadas del equipo. Para probar con otras personas necesitás SMTP propio.

Prepará estos datos del correo provisional:

- Dirección remitente.
- Nombre visible: `ATLAS SO`.
- Host SMTP.
- Puerto.
- Usuario SMTP.
- Contraseña SMTP o App Password.

Luego activá **Custom SMTP** y cargalos allí. Cuando ATLAS SO tenga dominio y correo propio, solo se reemplaza esta configuración; el código no cambia.

## 4. Primera entrada y datos anteriores

1. Abrí `login.html` con Live Server.
2. Creá primero tu cuenta de propietario.
3. Confirmá el correo.
4. Iniciá sesión.

En el primer ingreso, ATLAS SO asigna a esa cuenta tus datos antiguos de Finanzas, Estudios, Trabajo, Salud, Proyectos y Personal. Por eso la cuenta del propietario debe ser la primera que ingrese en el navegador donde ya existen datos.

Cada persona de prueba debe crear su propia cuenta. No compartas tu contraseña: así se comprueba de verdad que los datos estén separados.

## 5. Instalar en el teléfono

Cuando el sitio esté publicado con HTTPS, abrilo en Chrome para Android y elegí **Instalar aplicación**. La versión instalada se actualiza al publicar cambios.

## 6. Descargar un APK de prueba

Después de subir esta versión a GitHub:

1. Abrí la pestaña **Actions** del repositorio.
2. Elegí **Generar APK de prueba**.
3. Presioná **Run workflow**.
4. Al terminar, descargá el archivo `atlas-so-debug-apk` en **Artifacts**.
5. Extraé el ZIP e instalá `app-debug.apk` en Android.

El APK de prueba no es todavía una versión firmada para Play Store. Esa firma se prepara cuando la aplicación esté estable.
# ATLAS SO v0.4 · activación de RR. HH. privado

Antes de reemplazar los archivos en tu proyecto, abrí:

**Supabase → SQL Editor → New query**

Copiá todo el contenido de `supabase/v0.4-rrhh-admin.sql`, ejecutalo con
**Run** y confirmá que aparezca `Success`. Este paso fija a la primera cuenta
registrada como única administradora de Recursos Humanos y bloquea las claves
`atlasHR...` para cualquier otra cuenta.

Después reemplazá los archivos, cerrá ATLAS SO, volvé a abrirlo y presioná
`Ctrl + F5`.

# ATLAS SO v0.7 · marcaciones a escala

Después de tener activa la protección de RR. HH. de la v0.4, ejecutá una sola
vez `supabase/v0.7-rrhh-scale.sql`. Esta migración crea la tabla mensual de
marcaciones con acceso exclusivo para la cuenta administradora. No borra ni
reemplaza datos anteriores.
