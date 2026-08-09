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
$toolchainScript = Join-Path $PSScriptRoot "windows-toolchain.ps1"
. $toolchainScript
$python = (Resolve-ExecutablePath -ToolName "Windows Python virtual environment" `
    -CandidatePaths @((Join-Path $venvRoot "Scripts\python.exe"))).Path
$runner = Join-Path $projectRoot "scripts\run-codd-consistency.py"

function Invoke-PythonChecked {
    param([string[]]$Arguments)
    $result = Invoke-TrackedNative -FilePath $python -Arguments (@("-X", "utf8") + $Arguments) `
        -WorkingDirectory $projectRoot
    if ($result.StandardOutput) { [Console]::Out.Write($result.StandardOutput) }
    if ($result.StandardError) { [Console]::Error.Write($result.StandardError) }
    if ($result.ExitCode -ne 0) {
        throw "Windows Python command failed with exit code $($result.ExitCode)"
    }
}

Push-Location $projectRoot
try {
    $env:PYTHONUTF8 = "1"
    Invoke-PythonChecked @($runner, "--project-root", $projectRoot)
} finally {
    Pop-Location
}
