param(
    [Parameter(Mandatory = $true)]
    [string] $DatasetDirectory,
    [Parameter(Mandatory = $true)]
    [string] $ApplicationPath,
    [Parameter(Mandatory = $true)]
    [string] $OutputFile,
    [ValidateRange(3, 30)]
    [int] $Runs = 7,
    [ValidateSet("cold", "warm")]
    [string] $CacheState = "warm",
    [int] $TimeoutSeconds = 30
)

$ErrorActionPreference = "Stop"
$dataset = [IO.Path]::GetFullPath($DatasetDirectory)
$application = [IO.Path]::GetFullPath($ApplicationPath)
if (-not [IO.Directory]::Exists($dataset)) { throw "Dataset not found: $dataset" }
if (-not [IO.File]::Exists($application)) { throw "Application not found: $application" }

# Benchmark protocol:
# The application receives the dataset and cache state and writes one JSON object
# per line to COMIC_EXPLORER_BENCH_OUTPUT. Required events:
# process_started, ui_ready, first_thumbnail, list_ready, page_requested,
# page_presented. Optional samples: input_delay_ms, long_task_ms, fps, gpu_percent.
$sessionDirectory = Join-Path ([IO.Path]::GetTempPath()) `
    ("comic-explorer-bench-" + [guid]::NewGuid().ToString("N"))
[IO.Directory]::CreateDirectory($sessionDirectory) | Out-Null
$samples = @()
try {
    for ($run = 1; $run -le $Runs; $run++) {
        $eventFile = Join-Path $sessionDirectory "events-$run.jsonl"
        $env:COMIC_EXPLORER_BENCH_OUTPUT = $eventFile
        $env:COMIC_EXPLORER_BENCH_DATASET = $dataset
        $env:COMIC_EXPLORER_BENCH_CACHE = $CacheState
        $started = [Diagnostics.Stopwatch]::StartNew()
        $process = Start-Process -FilePath $application -ArgumentList "--benchmark" -PassThru
        $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
        while (-not [IO.File]::Exists($eventFile) -and [DateTime]::UtcNow -lt $deadline) {
            Start-Sleep -Milliseconds 20
        }
        while ([DateTime]::UtcNow -lt $deadline) {
            if ([IO.File]::Exists($eventFile) -and
                (Select-String -LiteralPath $eventFile -SimpleMatch '"event":"run_complete"' -Quiet)) {
                break
            }
            if ($process.HasExited) { break }
            Start-Sleep -Milliseconds 20
            $process.Refresh()
        }
        $process.Refresh()
        $sample = @{
            run = $run
            launcherElapsedMs = [Math]::Round($started.Elapsed.TotalMilliseconds, 3)
            workingSetBytes = $process.WorkingSet64
            peakWorkingSetBytes = $process.PeakWorkingSet64
            events = @()
        }
        if ([IO.File]::Exists($eventFile)) {
            $sample.events = @(Get-Content -LiteralPath $eventFile |
                Where-Object { $_.Trim() } | ForEach-Object { $_ | ConvertFrom-Json })
        }
        $samples += $sample
        if (-not $process.HasExited) {
            $process.CloseMainWindow() | Out-Null
            if (-not $process.WaitForExit(5000)) { $process.Kill($true) }
        }
    }
    $computer = Get-CimInstance Win32_ComputerSystem
    $os = Get-CimInstance Win32_OperatingSystem
    $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
    @{
        schemaVersion = 1
        classification = "windows-desktop-measured"
        cacheState = $CacheState
        environment = @{
            os = $os.Caption
            osVersion = $os.Version
            cpu = $cpu.Name
            memoryBytes = [uint64]$computer.TotalPhysicalMemory
            powerPlan = (powercfg /GETACTIVESCHEME | Out-String).Trim()
            scaleAndResolution = "RECORD_MANUALLY"
            applicationSha256 = (Get-FileHash -LiteralPath $application -Algorithm SHA256).Hash
            runs = $Runs
        }
        samples = $samples
    } | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $OutputFile -Encoding utf8
} finally {
    Remove-Item Env:COMIC_EXPLORER_BENCH_OUTPUT -ErrorAction SilentlyContinue
    Remove-Item Env:COMIC_EXPLORER_BENCH_DATASET -ErrorAction SilentlyContinue
    Remove-Item Env:COMIC_EXPLORER_BENCH_CACHE -ErrorAction SilentlyContinue
}
Write-Output ([IO.Path]::GetFullPath($OutputFile))

