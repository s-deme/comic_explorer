[CmdletBinding()]
param(
    [string]$VenvPath = ".venv-windows",
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet("scan", "check", "verify", "dag")]
    [string]$Command,
    [Parameter(Position = 1)]
    [string[]]$CoddArguments = @()
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$venvRoot = if ([IO.Path]::IsPathRooted($VenvPath)) {
    $VenvPath
} else {
    Join-Path $projectRoot $VenvPath
}
$python = Join-Path $venvRoot "Scripts\python.exe"

if (!(Test-Path -LiteralPath $python -PathType Leaf)) {
    throw "Windows Python venv not found: $python"
}

$exitCode = 1
Push-Location $projectRoot
try {
    $env:PYTHONUTF8 = "1"
    # codd verify launches the configured portable Python runners through the
    # shell; make this selected venv the active Windows interpreter for those
    # child processes without requiring a profile-level activation.
    $env:Path = "$venvRoot\Scripts;$env:Path"
    & $python -X utf8 -m codd $Command @CoddArguments
    $exitCode = $LASTEXITCODE
} finally {
    Pop-Location
}

exit $exitCode
