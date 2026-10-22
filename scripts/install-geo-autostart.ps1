param([switch]$Remove)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$startup = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startup 'GEO Learning Map.lnk'
if ($Remove) {
  if (Test-Path -LiteralPath $shortcutPath) { Remove-Item -LiteralPath $shortcutPath }
  Write-Output 'Removed GEO login shortcut; running services are preserved.'
  exit
}
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot '.env'))) { throw 'Configure .env first.' }
$nodePath = (Get-Command node -ErrorAction Stop).Source
$launcher = Join-Path $PSScriptRoot 'start-geo-hidden.vbs'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = Join-Path $env:WINDIR 'System32/wscript.exe'
$shortcut.Arguments = '"' + $launcher + '" "' + $nodePath + '" "' + $projectRoot + '"'
$shortcut.WorkingDirectory = $projectRoot
$shortcut.Description = 'GEO local website service supervisor'
$shortcut.Save()
Start-Process -FilePath $shortcut.TargetPath -ArgumentList $shortcut.Arguments -WindowStyle Hidden
Write-Output 'Installed GEO login shortcut and started hidden supervisor. No administrator credentials required.'
