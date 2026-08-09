[CmdletBinding()]
param(
    [string]$VenvPath = ".venv-windows"
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$venvRoot = if ([IO.Path]::IsPathRooted($VenvPath)) {
    $VenvPath
} else {
    Join-Path $projectRoot $VenvPath
}
$python = Join-Path $venvRoot "Scripts\python.exe"
$npm = (Get-Command npm.cmd -ErrorAction Stop).Source

if (!(Test-Path -LiteralPath $python -PathType Leaf)) {
    throw "Windows Python venv not found: $python"
}

Push-Location $projectRoot
try {
    & (Join-Path $PSScriptRoot "run-codd-consistency-windows.ps1") -VenvPath $venvRoot
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    $env:PYTHONUTF8 = "1"
    & $python -X utf8 -B -m unittest discover -s tests -p "test_*.py"
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    & $npm test -- --pool=threads --poolOptions.threads.singleThread=true
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
