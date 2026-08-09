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
$runner = Join-Path $projectRoot "scripts\run-codd-consistency.py"

if (!(Test-Path -LiteralPath $python -PathType Leaf)) {
    throw "Windows Python venv not found: $python"
}

function Invoke-PythonChecked {
    param([string[]]$Arguments)
    & $python -X utf8 @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Windows Python command failed with exit code $LASTEXITCODE"
    }
}

Push-Location $projectRoot
try {
    $env:PYTHONUTF8 = "1"
    Invoke-PythonChecked @($runner, "--project-root", $projectRoot)
} finally {
    Pop-Location
}
