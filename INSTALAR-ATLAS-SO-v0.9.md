# Aplicar ATLAS SO v0.9 sobre la versión estable v0.8

## Requisitos

- Proyecto local limpio y en `main`.
- `main` igual a `origin/main`.
- Etiqueta `v0.8.0` disponible.
- Conexión local de Supabase funcionando.
- Node.js 22 o posterior.
- Paquete v0.9 extraído fuera del repositorio.

## Instalación asistida en Windows

Abrí PowerShell y ejecutá el instalador incluido, indicando la carpeta real del
proyecto y la carpeta donde extrajiste el paquete:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
& "C:\Ruta\ATLAS-SO-v0.9\APLICAR-ATLAS-SO-v0.9.ps1" `
  -ProjectPath "C:\Matias Ayala\ATLAS-SO-GITHUB" `
  -PackagePath "C:\Ruta\ATLAS-SO-v0.9"
```

El script:

1. valida rama, limpieza, remoto y etiqueta;
2. crea o abre `v0.9-rrhh-operacion-real`;
3. copia únicamente los archivos de aplicación;
4. no reemplaza `atlas-config.js`;
5. instala dependencias y ejecuta la suite completa;
6. no hace commit, push, Pull Request, merge, etiqueta ni release.

## Migración de Supabase

Después de comprobar la aplicación local, ejecutá en el SQL Editor de Supabase:

```text
supabase/v0.9-rrhh-operation.sql
```

Debe ejecutarse después de `supabase/v0.8-security-privacy-sync.sql`. Es una
migración aditiva e idempotente: agrega contexto de sucursal/asignación a las
marcaciones y actualiza la restauración atómica.

No pegues URL, claves ni tokens en Git. No reemplaces la configuración local.

## Validación manual mínima

Usá datos sintéticos y verificá:

1. cambio entre dos clientes y dos sucursales sin mezcla;
2. alta de un funcionario y persistencia al recargar;
3. traslado con motivo y dos vigencias en el historial;
4. asignación y cambio de horario sin alterar el periodo anterior;
5. importación con una fila válida y otra inválida;
6. descarga del informe de errores;
7. bloqueo del mismo archivo por hash después de procesarlo;
8. marcación incompleta y corrección con motivo;
9. novedad pendiente y métrica accionable;
10. acceso denegado con una cuenta no administradora.

## Recuperación

La etiqueta `v0.8.0` es el punto estable. Si decidís descartar por completo la
prueba v0.9, primero cerrá la aplicación y preservá por separado cualquier dato
sintético que quieras estudiar. Después, desde la rama v0.9 y con la configuración
local protegida, podés restaurar los archivos versionados y volver a `main`:

```powershell
git status --short
git restore --source=HEAD --staged --worktree -- .
git switch main
git status -sb
```

No borres datos de Supabase como parte de esa recuperación. Las columnas de la
migración v0.9 son compatibles con v0.8 y pueden permanecer vacías.

## Publicación

Antes de publicar, revisar exactamente los archivos preparados, comprobar cero
secretos y ejecutar:

```powershell
npm run check
npm audit
git status --short
git diff --cached --stat
```

La publicación solo debe continuar después de una confirmación explícita.
