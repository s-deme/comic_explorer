[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$executable = (Join-Path $projectRoot "src-tauri\target\release\comic-explorer.exe").ToLowerInvariant()
$evidenceRoot = Join-Path $projectRoot "dist\product-ui-harness"
$deadline = [DateTime]::UtcNow.AddSeconds(10)

do {
    $processes = @(Get-CimInstance Win32_Process | Where-Object {
        ($_.Name -eq "comic-explorer.exe" -and $_.ExecutablePath -and
            $_.ExecutablePath.ToLowerInvariant() -eq $executable) -or
        ($_.Name -eq "msedgewebview2.exe" -and $_.CommandLine -and
            $_.CommandLine -like "*product-ui-harness*")
    })
    $lockedEvidence = Test-Path -LiteralPath $evidenceRoot
    if ($processes.Count -eq 0 -and !$lockedEvidence) {
        [pscustomobject]@{
            status = "ok"
            productProcessCount = 0
            harnessWebViewProcessCount = 0
            evidenceExists = $false
            sqliteLockExists = $false
        } | ConvertTo-Json -Compress
        exit 0
    }
    Start-Sleep -Milliseconds 100
} while ([DateTime]::UtcNow -lt $deadline)

$locks = @(Get-ChildItem -LiteralPath $evidenceRoot -File -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like "*.sqlite3*" })
[Console]::Error.WriteLine((@{
    status = "failed"
    processes = @($processes | Select-Object ProcessId, ParentProcessId, Name, CommandLine)
    evidenceExists = (Test-Path -LiteralPath $evidenceRoot)
    sqliteLocks = @($locks.FullName)
} | ConvertTo-Json -Depth 5 -Compress))
exit 1
