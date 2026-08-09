[CmdletBinding()]
param(
    [string]$VenvPath = ".venv-windows",
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet("scan", "impact", "check", "verify", "dag")]
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
$toolchainScript = Join-Path $PSScriptRoot "windows-toolchain.ps1"
. $toolchainScript
$python = (Resolve-ExecutablePath -ToolName "Windows Python virtual environment" `
    -CandidatePaths @((Join-Path $venvRoot "Scripts\python.exe"))).Path

$exitCode = 1
Push-Location $projectRoot
try {
    $env:PYTHONUTF8 = "1"
    # codd verify launches the configured portable Python runners through the
    # shell; make this selected venv the active Windows interpreter for those
    # child processes without requiring a profile-level activation.
    $env:Path = "$venvRoot\Scripts;$env:Path"
    $result = Invoke-TrackedNative -FilePath $python `
        -Arguments (@("-X", "utf8", "-m", "codd", $Command) + @($CoddArguments)) `
        -WorkingDirectory $projectRoot
    if ($result.StandardOutput) { [Console]::Out.Write($result.StandardOutput) }
    if ($result.StandardError) { [Console]::Error.Write($result.StandardError) }
    $exitCode = $result.ExitCode
} finally {
    Pop-Location
}

exit $exitCode
