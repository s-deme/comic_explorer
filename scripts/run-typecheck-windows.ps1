[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$toolchainScript = Join-Path $PSScriptRoot "windows-toolchain.ps1"
. $toolchainScript
$node = Resolve-WindowsNode

Push-Location $projectRoot
try {
    $result = Invoke-TrackedNative -FilePath $node `
        -Arguments @((Join-Path $projectRoot "node_modules\typescript\bin\tsc"), "--noEmit") `
        -WorkingDirectory $projectRoot
    if ($result.StandardOutput) { [Console]::Out.Write($result.StandardOutput) }
    if ($result.StandardError) { [Console]::Error.Write($result.StandardError) }
    exit $result.ExitCode
} finally {
    Pop-Location
}
