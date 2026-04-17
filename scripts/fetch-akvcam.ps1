# Downloads the pinned AKVirtualCamera Windows installer into build/akvcam/ (GPL-3.0).
# Run before `npm run dist` if build/akvcam/akvirtualcamera-windows-*.exe is missing.
#
# Verifies size + SHA256 from the GitHub Releases API so truncated/corrupt downloads
# (which trigger NSIS "Installer integrity check has failed") are rejected and retried.

$ErrorActionPreference = "Stop"
$version = "9.4.0"
$name = "akvirtualcamera-windows-$version.exe"
# scripts/ is one level below repo root
$root = Split-Path -Parent $PSScriptRoot
$dir = Join-Path $root "build\akvcam"
$dest = Join-Path $dir $name

$apiUrl = "https://api.github.com/repos/webcamoid/akvirtualcamera/releases/tags/$version"
# GitHub rejects unauthenticated API requests without a User-Agent.
$ghHeaders = @{
  "User-Agent"    = "background-removal-camera-akvcam-fetch"
  "Accept"        = "application/vnd.github+json"
  "X-GitHub-Api-Version" = "2022-11-28"
}

New-Item -ItemType Directory -Force $dir | Out-Null

Write-Host "Querying release $version ..."
$release = Invoke-RestMethod -Uri $apiUrl -Headers $ghHeaders -Method Get
$asset = $release.assets | Where-Object { $_.name -eq $name } | Select-Object -First 1
if (-not $asset) {
  throw "Release asset not found: $name (tag $version)"
}

$expectedSize = [int64]$asset.size
$expectedSha256 = $null
if ($asset.PSObject.Properties.Name -contains "digest" -and $asset.digest) {
  $expectedSha256 = ($asset.digest -replace "^sha256:", "").ToLowerInvariant()
}

function Test-InstallerOk {
  param(
    [string]$Path,
    [int64]$Size,
    [string]$Sha256
  )
  if (-not (Test-Path -LiteralPath $Path)) { return $false }
  $len = (Get-Item -LiteralPath $Path).Length
  if ($len -ne $Size) { return $false }
  if ($Sha256) {
    $hash = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($hash -ne $Sha256) { return $false }
  }
  return $true
}

if (Test-InstallerOk -Path $dest -Size $expectedSize -Sha256 $expectedSha256) {
  Write-Host "Already present and verified: $dest ($expectedSize bytes)"
  exit 0
}

if (Test-Path -LiteralPath $dest) {
  Write-Host "Removing unverified or mismatched file: $dest"
  Remove-Item -LiteralPath $dest -Force
}

$url = $asset.browser_download_url
Write-Host "Downloading $url ..."
$tmp = "$dest.part"
if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Force }

try {
  Invoke-WebRequest -Uri $url -OutFile $tmp -UseBasicParsing -Headers $ghHeaders
  Move-Item -LiteralPath $tmp -Destination $dest -Force
}
catch {
  if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue }
  throw
}

if (-not (Test-InstallerOk -Path $dest -Size $expectedSize -Sha256 $expectedSha256)) {
  Remove-Item -LiteralPath $dest -Force -ErrorAction SilentlyContinue
  throw "Download failed verification (expected $expectedSize bytes$(if ($expectedSha256) { ", sha256=$expectedSha256" }))."
}

Write-Host "Saved verified $dest ($expectedSize bytes)"
