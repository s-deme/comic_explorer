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
$node = Resolve-WindowsNode

Push-Location $projectRoot
try {
    $consistency = Invoke-TrackedNative -FilePath (Join-Path $PSHOME "powershell.exe") `
        -Arguments @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
            (Join-Path $PSScriptRoot "run-codd-consistency-windows.ps1"), "-VenvPath", $venvRoot) `
        -WorkingDirectory $projectRoot
    if ($consistency.StandardOutput) { [Console]::Out.Write($consistency.StandardOutput) }
    if ($consistency.StandardError) { [Console]::Error.Write($consistency.StandardError) }
    if ($consistency.ExitCode -ne 0) { exit $consistency.ExitCode }

    $env:PYTHONUTF8 = "1"
    $pythonTests = Invoke-TrackedNative -FilePath $python `
        -Arguments @("-X", "utf8", "-B", "-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py") `
        -WorkingDirectory $projectRoot
    if ($pythonTests.StandardOutput) { [Console]::Out.Write($pythonTests.StandardOutput) }
    if ($pythonTests.StandardError) { [Console]::Error.Write($pythonTests.StandardError) }
    if ($pythonTests.ExitCode -ne 0) { exit $pythonTests.ExitCode }

    $frontendTests = Invoke-TrackedNative -FilePath $node `
        -Arguments @((Join-Path $projectRoot "node_modules\vitest\vitest.mjs"), "run",
            "--pool=threads", "--poolOptions.threads.singleThread=true") `
        -WorkingDirectory $projectRoot
    if ($frontendTests.StandardOutput) { [Console]::Out.Write($frontendTests.StandardOutput) }
    if ($frontendTests.StandardError) { [Console]::Error.Write($frontendTests.StandardError) }
    exit $frontendTests.ExitCode
} finally {
    Pop-Location
}
