[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$npm = (Get-Command npm.cmd -ErrorAction Stop).Source

Push-Location $projectRoot
try {
    & $npm run build
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
