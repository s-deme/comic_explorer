[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Feature,
    [ValidateSet("Focused", "Canonical")]
    [string]$RustMode = "Focused",
    [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
. (Join-Path $PSScriptRoot "windows-toolchain.ps1")
$featureKey = $Feature.ToLowerInvariant()
$featureConfig = switch ($featureKey) {
    "imp-004" { [pscustomobject]@{ Id = "IMP-004"; ProductSwitch = "-ShortcutOnly"; ProductStage = "shortcut"; FrontendTest = "src\App.fr-b11.test.tsx"; FrontendTestName = ""; ExpectedFrontendPasses = 1; RustFilter = "shortcut" } }
    "fut-c-019" { [pscustomobject]@{ Id = "FUT-C-019"; ProductSwitch = "-ShortcutOnly"; ProductStage = "shortcut"; FrontendTest = "src\App.fr-b11.test.tsx"; FrontendTestName = ""; ExpectedFrontendPasses = 1; RustFilter = "shortcut" } }
    "shortcutonly" { [pscustomobject]@{ Id = "ShortcutOnly"; ProductSwitch = "-ShortcutOnly"; ProductStage = "shortcut"; FrontendTest = "src\App.fr-b11.test.tsx"; FrontendTestName = ""; ExpectedFrontendPasses = 1; RustFilter = "shortcut" } }
    "imp-005" { [pscustomobject]@{ Id = "IMP-005"; ProductSwitch = "-TagsOnly"; ProductStage = "tags"; FrontendTest = "src\App.fr-b10.test.tsx"; FrontendTestName = ""; ExpectedFrontendPasses = 1; RustFilter = "fr_b10" } }
    "fut-c-022" { [pscustomobject]@{ Id = "FUT-C-022"; ProductSwitch = "-TagsOnly"; ProductStage = "tags"; FrontendTest = "src\App.fr-b10.test.tsx"; FrontendTestName = ""; ExpectedFrontendPasses = 1; RustFilter = "fr_b10" } }
    "tagsonly" { [pscustomobject]@{ Id = "TagsOnly"; ProductSwitch = "-TagsOnly"; ProductStage = "tags"; FrontendTest = "src\App.fr-b10.test.tsx"; FrontendTestName = ""; ExpectedFrontendPasses = 1; RustFilter = "fr_b10" } }
    "imp-006" { [pscustomobject]@{ Id = "IMP-006"; ProductSwitch = "-MemoOnly"; ProductStage = "memo"; FrontendTest = "src\App.fr-b07.test.tsx"; FrontendTestName = "FT-B07-001"; ExpectedFrontendPasses = 1; RustFilter = "fr_b07_memo" } }
    "fut-c-023" { [pscustomobject]@{ Id = "FUT-C-023"; ProductSwitch = "-MemoOnly"; ProductStage = "memo"; FrontendTest = "src\App.fr-b07.test.tsx"; FrontendTestName = "FT-B07-001"; ExpectedFrontendPasses = 1; RustFilter = "fr_b07_memo" } }
    "memoonly" { [pscustomobject]@{ Id = "MemoOnly"; ProductSwitch = "-MemoOnly"; ProductStage = "memo"; FrontendTest = "src\App.fr-b07.test.tsx"; FrontendTestName = "FT-B07-001"; ExpectedFrontendPasses = 1; RustFilter = "fr_b07_memo" } }
    "imp-007" { [pscustomobject]@{ Id = "IMP-007"; ProductSwitch = "-HistoryOnly"; ProductStage = "history"; FrontendTest = "src\App.fr-b07.test.tsx"; FrontendTestName = "FT-B07-002"; ExpectedFrontendPasses = 1; RustFilter = "fr_b07_history_deterministic_order_and_dedup" } }
    "fut-r-004" { [pscustomobject]@{ Id = "FUT-R-004"; ProductSwitch = "-HistoryOnly"; ProductStage = "history"; FrontendTest = "src\App.fr-b07.test.tsx"; FrontendTestName = "FT-B07-002"; ExpectedFrontendPasses = 1; RustFilter = "fr_b07_history_deterministic_order_and_dedup" } }
    "historyonly" { [pscustomobject]@{ Id = "HistoryOnly"; ProductSwitch = "-HistoryOnly"; ProductStage = "history"; FrontendTest = "src\App.fr-b07.test.tsx"; FrontendTestName = "FT-B07-002"; ExpectedFrontendPasses = 1; RustFilter = "fr_b07_history_deterministic_order_and_dedup" } }
    "imp-008" { [pscustomobject]@{ Id = "IMP-008"; ProductSwitch = "-RatingOnly"; ProductStage = "rating"; FrontendTest = "src\App.fr-b07.test.tsx"; FrontendTestName = "FT-B07-003"; ExpectedFrontendPasses = 1; RustFilter = "fr_b07_rating_boundaries_and_invalid_rejection" } }
    "fut-r-005" { [pscustomobject]@{ Id = "FUT-R-005"; ProductSwitch = "-RatingOnly"; ProductStage = "rating"; FrontendTest = "src\App.fr-b07.test.tsx"; FrontendTestName = "FT-B07-003"; ExpectedFrontendPasses = 1; RustFilter = "fr_b07_rating_boundaries_and_invalid_rejection" } }
    "ratingonly" { [pscustomobject]@{ Id = "RatingOnly"; ProductSwitch = "-RatingOnly"; ProductStage = "rating"; FrontendTest = "src\App.fr-b07.test.tsx"; FrontendTestName = "FT-B07-003"; ExpectedFrontendPasses = 1; RustFilter = "fr_b07_rating_boundaries_and_invalid_rejection" } }
    "imp-012" { [pscustomobject]@{ Id = "IMP-012"; ProductSwitch = "-SearchOnly"; ProductStage = "search"; FrontendTest = "src\App.test.tsx"; FrontendTestName = "FT-B05-"; ExpectedFrontendPasses = 5; RustFilter = "search_port_" } }
    "fut-c-010" { [pscustomobject]@{ Id = "FUT-C-010"; ProductSwitch = "-SearchOnly"; ProductStage = "search"; FrontendTest = "src\App.test.tsx"; FrontendTestName = "FT-B05-"; ExpectedFrontendPasses = 5; RustFilter = "search_port_" } }
    "searchonly" { [pscustomobject]@{ Id = "SearchOnly"; ProductSwitch = "-SearchOnly"; ProductStage = "search"; FrontendTest = "src\App.test.tsx"; FrontendTestName = "FT-B05-"; ExpectedFrontendPasses = 5; RustFilter = "search_port_" } }
    default { $null }
}
$resolvedFeatureId = if ($null -ne $featureConfig) { $featureConfig.Id } else { $Feature }
$resultStem = if ($null -ne $featureConfig) { $featureConfig.Id.ToLowerInvariant() } else { "unsupported" }

$runId = [DateTimeOffset]::UtcNow.ToString("yyyyMMddTHHmmssfffZ")
$verificationRoot = Join-Path $projectRoot "src-tauri\target\verification"
$logRoot = Join-Path $verificationRoot "$resultStem-$runId"
New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
$env:COMIC_EXPLORER_VERIFICATION_LOG_ROOT = $logRoot
if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $OutputPath = Join-Path $verificationRoot "$resultStem-latest.json"
} elseif (![IO.Path]::IsPathRooted($OutputPath)) {
    $OutputPath = Join-Path $projectRoot $OutputPath
}
$outputParent = Split-Path -Parent $OutputPath
if ($outputParent) { New-Item -ItemType Directory -Path $outputParent -Force | Out-Null }

$stages = [Collections.Generic.List[object]]::new()
$failedStage = $null
$overallExitCode = 0
$startedAt = [DateTimeOffset]::UtcNow
$total = [Diagnostics.Stopwatch]::StartNew()

function Invoke-VerificationStage {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$FilePath,
        [string[]]$Arguments = @()
    )
    $stageStarted = [DateTimeOffset]::UtcNow
    $timer = [Diagnostics.Stopwatch]::StartNew()
    $stdout = Join-Path $logRoot "$Name.stdout.log"
    $stderr = Join-Path $logRoot "$Name.stderr.log"
    $exitCode = 1
    $processId = $null
    try {
        $process = Invoke-TrackedNative -FilePath $FilePath -Arguments $Arguments `
            -WorkingDirectory $projectRoot
        $processId = $process.ProcessId
        $exitCode = $process.ExitCode
        $encoding = [Text.UTF8Encoding]::new($false)
        [IO.File]::WriteAllText($stdout, $process.StandardOutput, $encoding)
        [IO.File]::WriteAllText($stderr, $process.StandardError, $encoding)
    } catch {
        $_ | Out-String | Set-Content -LiteralPath $stderr -Encoding UTF8
        $exitCode = 1
    }
    $timer.Stop()
    $stage = [pscustomobject][ordered]@{
        name = $Name
        startedAt = $stageStarted.ToString("o")
        finishedAt = [DateTimeOffset]::UtcNow.ToString("o")
        durationSeconds = [Math]::Round($timer.Elapsed.TotalSeconds, 3)
        exitCode = [int]$exitCode
        processId = $processId
        stdout = $stdout.Substring($projectRoot.Length + 1).Replace("\", "/")
        stderr = $stderr.Substring($projectRoot.Length + 1).Replace("\", "/")
    }
    $script:stages.Add($stage)
    if ($exitCode -ne 0) {
        $script:failedStage = $Name
        $script:overallExitCode = [int]$exitCode
        return $false
    }
    return $true
}

function Invoke-ToolchainBootstrapStage {
    $name = "toolchain-bootstrap"
    $stageStarted = [DateTimeOffset]::UtcNow
    $timer = [Diagnostics.Stopwatch]::StartNew()
    $stdout = Join-Path $logRoot "$name.stdout.log"
    $stderr = Join-Path $logRoot "$name.stderr.log"
    $exitCode = 1
    try {
        $resolvedToolchain = Initialize-WindowsToolchain -ProjectRoot $projectRoot
        $env:COMIC_EXPLORER_WINDOWS_TOOLCHAIN = $resolvedToolchain | ConvertTo-Json -Compress
        $encoding = [Text.UTF8Encoding]::new($false)
        [IO.File]::WriteAllText($stdout, $env:COMIC_EXPLORER_WINDOWS_TOOLCHAIN + "`n", $encoding)
        [IO.File]::WriteAllText($stderr, "", $encoding)
        $exitCode = 0
    } catch {
        $_ | Out-String | Set-Content -LiteralPath $stderr -Encoding UTF8
    }
    $timer.Stop()
    $script:stages.Add([pscustomobject][ordered]@{
        name = $name
        startedAt = $stageStarted.ToString("o")
        finishedAt = [DateTimeOffset]::UtcNow.ToString("o")
        durationSeconds = [Math]::Round($timer.Elapsed.TotalSeconds, 3)
        exitCode = [int]$exitCode
        processId = $PID
        stdout = $stdout.Substring($projectRoot.Length + 1).Replace("\", "/")
        stderr = $stderr.Substring($projectRoot.Length + 1).Replace("\", "/")
    })
    if ($exitCode -ne 0) {
        $script:failedStage = $name
        $script:overallExitCode = [int]$exitCode
        return $false
    }
    return $true
}

$powerShell = Join-Path $PSHOME "powershell.exe"
$toolchainScript = Join-Path $PSScriptRoot "invoke-windows-toolchain.ps1"
$coddScript = Join-Path $PSScriptRoot "run-codd-windows.ps1"
$productScript = Join-Path $PSScriptRoot "run-product-ui-harness.ps1"
$productCleanupAudit = Join-Path $PSScriptRoot "audit-product-cleanup.ps1"
$frontendTest = if ($null -ne $featureConfig) { $featureConfig.FrontendTest } else { "src\App.fr-b11.test.tsx" }
$frontendTestName = if ($null -ne $featureConfig) { $featureConfig.FrontendTestName } else { "" }
$expectedFrontendPasses = if ($null -ne $featureConfig) { $featureConfig.ExpectedFrontendPasses } else { 1 }
$rustFilter = if ($null -ne $featureConfig) { $featureConfig.RustFilter } else { "shortcut" }
$productStage = if ($null -ne $featureConfig) { $featureConfig.ProductStage } else { "shortcut" }
$pipeline = @(
    [pscustomobject]@{ Name = "frontend-focused"; File = $powerShell; Args = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $toolchainScript, "-Task", "FrontendFocused", "-FrontendTest", $frontendTest, "-FrontendTestName", $frontendTestName, "-ExpectedFrontendPasses", $expectedFrontendPasses) },
    [pscustomobject]@{ Name = "typecheck"; File = $powerShell; Args = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $toolchainScript, "-Task", "Typecheck") },
    [pscustomobject]@{ Name = "frontend-sbom"; File = $powerShell; Args = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $toolchainScript, "-Task", "FrontendSbom") },
    [pscustomobject]@{ Name = "rust-$($RustMode.ToLowerInvariant())"; File = $powerShell; Args = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $toolchainScript, "-Task", "Rust$RustMode", "-RustFilter", $rustFilter) },
    [pscustomobject]@{ Name = "release-executable"; File = $powerShell; Args = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $toolchainScript, "-Task", "ReleaseExecutable") },
    [pscustomobject]@{ Name = "release-freshness"; File = $powerShell; Args = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $toolchainScript, "-Task", "Freshness") },
    [pscustomobject]@{ Name = "product-$productStage"; File = $powerShell; Args = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $productScript, $(if ($null -ne $featureConfig) { $featureConfig.ProductSwitch } else { "-ShortcutOnly" })) },
    [pscustomobject]@{ Name = "product-cleanup-audit"; File = $powerShell; Args = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $productCleanupAudit) },
    [pscustomobject]@{ Name = "codd-scan"; File = $powerShell; Args = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $coddScript, "scan") },
    [pscustomobject]@{ Name = "codd-check"; File = $powerShell; Args = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $coddScript, "check") }
)
if ($RustMode -eq "Canonical") {
    $pipeline += [pscustomobject]@{
        Name = "codd-verify"
        File = $powerShell
        Args = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $coddScript, "verify")
    }
}

try {
    if ($null -eq $featureConfig) {
        $failedStage = "feature-resolution"
        $overallExitCode = 2
        $errorPath = Join-Path $logRoot "feature-resolution.stderr.log"
        $message = "Unsupported feature '$Feature'. Supported values: IMP-004, FUT-C-019, ShortcutOnly, IMP-005, FUT-C-022, TagsOnly, IMP-006, FUT-C-023, MemoOnly, IMP-007, FUT-R-004, HistoryOnly, IMP-008, FUT-R-005, RatingOnly, IMP-012, FUT-C-010, SearchOnly."
        $message | Set-Content -LiteralPath $errorPath -Encoding UTF8
        $now = [DateTimeOffset]::UtcNow
        $stages.Add([pscustomobject][ordered]@{
            name = $failedStage
            startedAt = $now.ToString("o")
            finishedAt = $now.ToString("o")
            durationSeconds = 0
            exitCode = $overallExitCode
            processId = $PID
            stdout = $null
            stderr = $errorPath.Substring($projectRoot.Length + 1).Replace("\", "/")
        })
    } elseif (Invoke-ToolchainBootstrapStage) {
        foreach ($stage in $pipeline) {
            if (!(Invoke-VerificationStage -Name $stage.Name -FilePath $stage.File -Arguments $stage.Args)) { break }
        }
    }
} catch {
    if ($null -eq $failedStage) { $failedStage = "runner" }
    if ($overallExitCode -eq 0) { $overallExitCode = 1 }
    $_ | Out-String | Set-Content -LiteralPath (Join-Path $logRoot "runner.stderr.log") -Encoding UTF8
} finally {
    $total.Stop()
    $result = [pscustomobject][ordered]@{
        schemaVersion = 1
        feature = $resolvedFeatureId
        rustMode = $RustMode
        status = $(if ($overallExitCode -eq 0) { "passed" } else { "failed" })
        failedStage = $failedStage
        exitCode = [int]$overallExitCode
        startedAt = $startedAt.ToString("o")
        finishedAt = [DateTimeOffset]::UtcNow.ToString("o")
        totalSeconds = [Math]::Round($total.Elapsed.TotalSeconds, 3)
        logRoot = $logRoot.Substring($projectRoot.Length + 1).Replace("\", "/")
        stages = @($stages)
    }
    $json = $result | ConvertTo-Json -Depth 8
    $encoding = [Text.UTF8Encoding]::new($false)
    [IO.File]::WriteAllText($OutputPath, $json + "`n", $encoding)
    [Console]::Out.WriteLine($json)
}
exit $overallExitCode
