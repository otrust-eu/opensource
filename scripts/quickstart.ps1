[CmdletBinding()]
param(
  [ValidateRange(1, 65535)]
  [int]$Port = 3000
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function New-HexSecret {
  $bytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($bytes)
  } finally {
    $rng.Dispose()
  }
  return (([BitConverter]::ToString($bytes) -replace '-', '').ToLowerInvariant())
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'Docker is required. Install Docker Desktop: https://docs.docker.com/desktop/'
}

docker info --format '{{.ServerVersion}}' | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw 'Docker Desktop is not running.'
}

if ($env:PORT) {
  $Port = [int]$env:PORT
}
if ([string]::IsNullOrWhiteSpace($env:ADMIN_KEY)) {
  $env:ADMIN_KEY = New-HexSecret
}
if ([string]::IsNullOrWhiteSpace($env:AUTH_SECRET)) {
  $env:AUTH_SECRET = New-HexSecret
}
$env:PORT = [string]$Port

Write-Host "Starting OTRUST (MongoDB + app) on http://localhost:$Port"
docker compose up -d --build
if ($LASTEXITCODE -ne 0) {
  throw 'Docker Compose failed to start OTRUST.'
}

Write-Host 'Waiting for health check...'
$healthy = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 -Uri "http://localhost:$Port/health"
    if ($response.StatusCode -eq 200) {
      $healthy = $true
      break
    }
  } catch {
    Start-Sleep -Seconds 2
  }
}

if (-not $healthy) {
  throw 'Server did not become healthy. Run: docker compose logs app'
}

Write-Host ''
Write-Host 'OTRUST is running'
Write-Host ''
Write-Host "  Web UI:     http://localhost:$Port"
Write-Host "  Health:     http://localhost:$Port/health"
Write-Host "  Developers: http://localhost:$Port/developers.html"
Write-Host "  Admin key:  $env:ADMIN_KEY"
Write-Host ''
Write-Host 'Save ADMIN_KEY and AUTH_SECRET in your secrets manager. Never commit them.'
