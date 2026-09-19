[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$toolchainScript = Join-Path $PSScriptRoot "windows-toolchain.ps1"
. $toolchainScript
$toolchainEntry = Join-Path $PSScriptRoot "invoke-windows-toolchain.ps1"
$powershell = Resolve-PowerShellHost
$result = Invoke-TrackedNative -FilePath $powershell `
    -Arguments @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $toolchainEntry, "-Task", "Release") `
    -WorkingDirectory $projectRoot
if ($result.StandardOutput) { [Console]::Out.Write($result.StandardOutput) }
if ($result.StandardError) { [Console]::Error.Write($result.StandardError) }
exit $result.ExitCode
