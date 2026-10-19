param(
  [ValidateSet('start', 'status')][string]$Action = 'start',
  [switch]$Rebuild
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $projectRoot '.env'
if (-not (Test-Path -LiteralPath $envFile -PathType Leaf)) { throw 'Missing .env. Complete the local setup in README first.' }
$nodeCommand = Get-Command node -ErrorAction Stop
$nodeArgs = @("--env-file=$envFile", (Join-Path $PSScriptRoot 'geo-local.ts'), $Action)
if ($Rebuild) { $nodeArgs += '--rebuild' }
Push-Location $projectRoot
try { & $nodeCommand.Source @nodeArgs; exit $LASTEXITCODE }
finally { Pop-Location }
