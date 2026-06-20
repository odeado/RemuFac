# Script para limpiar y organizar la carpeta C:\Contabilidad\REMUNERACIONES\
# Mueve los archivos y carpetas heredados a C:\Contabilidad\REMUNERACIONES\_Legacy_Backup\

$remuDir = "C:\Contabilidad\REMUNERACIONES"
$backupDir = Join-Path $remuDir "_Legacy_Backup"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " Iniciando limpieza de la carpeta REMUNERACIONES" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "Carpeta base: $remuDir"
Write-Host "Carpeta de respaldo: $backupDir"
Write-Host ""

# 1. Crear carpeta de respaldo si no existe
if (!(Test-Path $backupDir)) {
    Write-Host "Creando carpeta de respaldo..."
    New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
    Write-Host "Creada: $backupDir" -ForegroundColor Green
}

# 2. Leer empresas activas de Empresas.txt
$empresasFile = Join-Path $remuDir "Empresas.txt"
$activeDirs = @()
if (Test-Path $empresasFile) {
    $activeDirs = Get-Content $empresasFile | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" }
}

# Convertir a minúsculas para comparaciones seguras
$activeDirsLower = $activeDirs | ForEach-Object { $_.ToLower() }
$preserveFilesLower = @("empresas.txt", "key.mdb", "xwages.mdb", "snow.mdb", "_legacy_backup")

Write-Host "Empresas activas a conservar:" -ForegroundColor Yellow
foreach ($emp in $activeDirs) {
    Write-Host " - $emp"
}
Write-Host "Archivos del nuevo sistema a conservar:" -ForegroundColor Yellow
foreach ($file in $preserveFilesLower) {
    if ($file -ne "_legacy_backup") {
        Write-Host " - $file"
    }
}
Write-Host ""

# 3. Escanear y mover elementos inactivos
$items = Get-ChildItem -Path $remuDir

$movedFoldersCount = 0
$movedFilesCount = 0

foreach ($item in $items) {
    $nameLower = $item.Name.ToLower()
    $shouldPreserve = $false
    
    if ($item.PSIsContainer) {
        # Si es directorio, verificar si es una empresa activa o carpeta a conservar
        if ($activeDirsLower -contains $nameLower -or $preserveFilesLower -contains $nameLower) {
            $shouldPreserve = $true
        }
    } else {
        # Si es archivo, verificar si está en la lista a conservar
        if ($preserveFilesLower -contains $nameLower) {
            $shouldPreserve = $true
        }
    }
    
    if (!$shouldPreserve) {
        $destPath = Join-Path $backupDir $item.Name
        Write-Host "Moviendo a respaldo: $($item.Name)..." -ForegroundColor Gray
        try {
            if ($item.PSIsContainer) {
                Move-Item -Path $item.FullName -Destination $destPath -Force
                $movedFoldersCount++
            } else {
                Move-Item -Path $item.FullName -Destination $destPath -Force
                $movedFilesCount++
            }
        } catch {
            Write-Host "ERROR al mover $($item.Name): $_" -ForegroundColor Red
        }
    }
}

Write-Host ""
Write-Host "==================================================" -ForegroundColor Green
Write-Host " Limpieza completada con éxito" -ForegroundColor Green
Write-Host " Carpetas movidas a respaldo: $movedFoldersCount"
Write-Host " Archivos movidos a respaldo: $movedFilesCount"
Write-Host "==================================================" -ForegroundColor Green
