# Downloads the pinned AKVirtualCamera Windows installer into build/akvcam/ (GPL-3.0).
# Run before `npm run dist` if build/akvcam/akvirtualcamera-windows-*.exe is missing.

$ErrorActionPreference = "Stop"
$version = "9.4.0"
$name = "akvirtualcamera-windows-$version.exe"
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$dir = Join-Path $root "build\akvcam"
$dest = Join-Path $dir $name
$url = "https://github.com/webcamoid/akvirtualcamera/releases/download/$version/$name"

New-Item -ItemType Directory -Force $dir | Out-Null
if (Test-Path $dest) {
  Write-Host "Already present: $dest"
  exit 0
}

Write-Host "Downloading $url ..."
Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing
Write-Host "Saved $dest ($((Get-Item $dest).Length) bytes)"
