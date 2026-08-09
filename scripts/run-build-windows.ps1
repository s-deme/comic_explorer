[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$toolchainScript = Join-Path $PSScriptRoot "windows-toolchain.ps1"
. $toolchainScript
$node = Resolve-WindowsNode

Push-Location $projectRoot
try {
    $typecheck = Invoke-TrackedNative -FilePath $node `
        -Arguments @((Join-Path $projectRoot "node_modules\typescript\bin\tsc"), "--noEmit") `
        -WorkingDirectory $projectRoot
    if ($typecheck.StandardOutput) { [Console]::Out.Write($typecheck.StandardOutput) }
    if ($typecheck.StandardError) { [Console]::Error.Write($typecheck.StandardError) }
    if ($typecheck.ExitCode -ne 0) { exit $typecheck.ExitCode }
    $build = Invoke-TrackedNative -FilePath $node `
        -Arguments @((Join-Path $projectRoot "node_modules\vite\bin\vite.js"), "build") `
        -WorkingDirectory $projectRoot
    if ($build.StandardOutput) { [Console]::Out.Write($build.StandardOutput) }
    if ($build.StandardError) { [Console]::Error.Write($build.StandardError) }
    exit $build.ExitCode
} finally {
    Pop-Location
}
