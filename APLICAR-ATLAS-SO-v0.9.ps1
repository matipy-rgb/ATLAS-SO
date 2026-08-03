param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectPath,

    [Parameter(Mandatory = $false)]
    [string]$PackagePath = $PSScriptRoot
)

$ErrorActionPreference = "Stop"
$branch = "v0.9-rrhh-operacion-real"
$project = (Resolve-Path $ProjectPath).Path
$package = (Resolve-Path $PackagePath).Path

if ($project -eq $package) {
    throw "ExtraÃ© el paquete fuera del repositorio antes de aplicarlo."
}

Set-Location $project

if ((git branch --show-current) -ne "main") {
    throw "La instalaciÃ³n debe comenzar en la rama main."
}
if (-not [string]::IsNullOrWhiteSpace((git status --porcelain))) {
    throw "El repositorio tiene cambios pendientes."
}

git fetch origin --prune
if ($LASTEXITCODE -ne 0) { throw "No se pudo consultar origin." }
if ((git rev-parse main) -ne (git rev-parse origin/main)) {
    throw "main local no coincide con origin/main."
}
if ([string]::IsNullOrWhiteSpace((git tag -l "v0.8.0"))) {
    throw "No se encontrÃ³ la etiqueta estable v0.8.0."
}

if ([string]::IsNullOrWhiteSpace((git branch --list $branch))) {
    git switch -c $branch
} else {
    git switch $branch
}
if ($LASTEXITCODE -ne 0) { throw "No se pudo abrir la rama v0.9." }

$excludedFolders = @(".git", "node_modules", "outputs", "www")
$excludedFiles = @("atlas-config.js")
$sourceFiles = Get-ChildItem -Path $package -File -Recurse | Where-Object {
    $candidate = $_
    $relative = $candidate.FullName.Substring($package.Length).TrimStart('\', '/')
    $segments = $relative -split '[\\/]'
    -not ($segments | Where-Object { $excludedFolders -contains $_ }) -and
    -not ($excludedFiles -contains $candidate.Name)
}

foreach ($source in $sourceFiles) {
    $relative = $source.FullName.Substring($package.Length).TrimStart('\', '/')
    $destination = Join-Path $project $relative
    $destinationFolder = Split-Path $destination -Parent
    if (-not (Test-Path $destinationFolder)) {
        New-Item -ItemType Directory -Path $destinationFolder -Force | Out-Null
    }
    Copy-Item -LiteralPath $source.FullName -Destination $destination -Force
}

npm install
if ($LASTEXITCODE -ne 0) { throw "La instalaciÃ³n de dependencias fallÃ³." }
npm run check
if ($LASTEXITCODE -ne 0) { throw "La validaciÃ³n v0.9 fallÃ³. No publiques la rama." }

"`n===== ATLAS SO v0.9 APLICADO PARA REVISION ====="
git status -sb
"`nLa configuracion local no fue reemplazada. No se realizo commit, push ni merge."
