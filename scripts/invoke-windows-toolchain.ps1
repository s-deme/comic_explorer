[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("Bootstrap", "FrontendFocused", "Typecheck", "Release", "FrontendSbom", "ReleaseExecutable", "RustFocused", "RustCanonical", "Freshness")]
    [string]$Task,
    [switch]$ForceRelease
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
. (Join-Path $PSScriptRoot "windows-toolchain.ps1")
. (Join-Path $PSScriptRoot "release-freshness.ps1")

function Throw-NativeFailure {
    param([string]$Name, [int]$ExitCode)
    $exception = [Exception]::new("$Name failed with exit code $ExitCode.")
    $exception.Data["ExitCode"] = $ExitCode
    throw $exception
}

function Invoke-Checked {
    param([string]$Name, [string]$Executable, [string[]]$Arguments, [string]$WorkingDirectory)
    $result = Invoke-TrackedNative -FilePath $Executable -Arguments $Arguments `
        -WorkingDirectory $WorkingDirectory
    if ($result.StandardOutput) { [Console]::Out.Write($result.StandardOutput) }
    if ($result.StandardError) { [Console]::Error.Write($result.StandardError) }
    if ($result.ExitCode -ne 0) {
        Throw-NativeFailure -Name $Name -ExitCode $result.ExitCode
    }
}

function Invoke-FrontendSbom {
    param([bool]$IncludeTypecheck)
    if ($IncludeTypecheck) {
        Invoke-Checked "TypeScript typecheck" $toolchain.Node `
            @((Join-Path $projectRoot "node_modules\typescript\bin\tsc"), "--noEmit") $projectRoot
    }
    Invoke-Checked "Vite frontend build" $toolchain.Node `
        @((Join-Path $projectRoot "node_modules\vite\bin\vite.js"), "build") $projectRoot

    $metadataPath = Join-Path $projectRoot "dist\cargo-metadata.json"
    $metadataResult = Invoke-TrackedNative -FilePath $toolchain.Cargo -Arguments @(
        "metadata", "--manifest-path", (Join-Path $projectRoot "src-tauri\Cargo.toml"),
        "--locked", "--format-version", "1"
    ) -WorkingDirectory $projectRoot
    if ($metadataResult.StandardError) { [Console]::Error.Write($metadataResult.StandardError) }
    if ($metadataResult.ExitCode -ne 0) {
        Throw-NativeFailure -Name "Cargo metadata" -ExitCode $metadataResult.ExitCode
    }
    $encoding = [Text.UTF8Encoding]::new($false)
    [IO.File]::WriteAllText($metadataPath, ($metadataResult.StandardOutput.TrimEnd() + "`n"), $encoding)
    Invoke-Checked "SBOM generation" $toolchain.Python `
        @("-X", "utf8", (Join-Path $projectRoot "scripts\generate-sbom.py")) $projectRoot
}

function Invoke-ReleaseExecutable {
    $freshness = Test-ReleaseFreshness -ProjectRoot $projectRoot
    if ($freshness.Fresh -and !$ForceRelease) {
        $freshness | ConvertTo-Json -Compress
        return
    }
    Invoke-Checked "Rust release build" $toolchain.Cargo `
        @("build", "--release", "--locked", "--features", "tauri/custom-protocol") `
        (Join-Path $projectRoot "src-tauri")
    Write-ReleaseFreshnessManifest -ProjectRoot $projectRoot | ConvertTo-Json -Compress
}

$exitCode = 0
try {
    if ($Task -ne "Bootstrap" -and $env:COMIC_EXPLORER_WINDOWS_TOOLCHAIN) {
        $toolchain = $env:COMIC_EXPLORER_WINDOWS_TOOLCHAIN | ConvertFrom-Json
    } else {
        $toolchain = Initialize-WindowsToolchain -ProjectRoot $projectRoot
    }
    switch ($Task) {
        "Bootstrap" { $toolchain | ConvertTo-Json -Compress }
        "FrontendFocused" {
            Invoke-Checked "Focused FR-B11 frontend test" $toolchain.Node `
                @(
                    (Join-Path $projectRoot "node_modules\vitest\vitest.mjs"), "run",
                    (Join-Path $projectRoot "src\App.fr-b11.test.tsx"),
                    "--pool=threads", "--poolOptions.threads.singleThread=true"
                ) $projectRoot
        }
        "Typecheck" {
            Invoke-Checked "TypeScript typecheck" $toolchain.Node `
                @((Join-Path $projectRoot "node_modules\typescript\bin\tsc"), "--noEmit") $projectRoot
        }
        "Release" {
            Invoke-FrontendSbom -IncludeTypecheck $true
            $ForceRelease = $true
            Invoke-ReleaseExecutable
        }
        "FrontendSbom" { Invoke-FrontendSbom -IncludeTypecheck $false }
        "ReleaseExecutable" { Invoke-ReleaseExecutable }
        "RustFocused" {
            Invoke-Checked "Focused shortcut Rust test" $toolchain.Cargo `
                @("test", "--locked", "--lib", "shortcut") (Join-Path $projectRoot "src-tauri")
        }
        "RustCanonical" {
            Invoke-Checked "Rust format check" $toolchain.Cargo @("fmt", "--check") (Join-Path $projectRoot "src-tauri")
            Invoke-Checked "Rust check" $toolchain.Cargo @("check", "--locked") (Join-Path $projectRoot "src-tauri")
            Invoke-Checked "Rust canonical test" $toolchain.Cargo @("test", "--locked") (Join-Path $projectRoot "src-tauri")
        }
        "Freshness" {
            $freshness = Test-ReleaseFreshness -ProjectRoot $projectRoot
            $freshness | ConvertTo-Json -Compress
            if (!$freshness.Fresh) { $exitCode = 3 }
        }
    }
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    if ($_.Exception.Data.Contains("ExitCode")) {
        $exitCode = [int]$_.Exception.Data["ExitCode"]
    } elseif ($exitCode -eq 0) {
        $exitCode = 1
    }
}
exit $exitCode
