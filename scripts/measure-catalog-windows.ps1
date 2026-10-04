[CmdletBinding()]
param(
    [string]$LibraryPath = 'E:\F\doujin\_A',
    [string]$ExecutablePath,
    [Parameter(Mandatory = $true)][string]$Label,
    [ValidateRange(1, 10)][int]$Runs = 3
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$executable = if ($ExecutablePath) { (Resolve-Path -LiteralPath $ExecutablePath).Path }
    else { Join-Path $projectRoot 'src-tauri\target\release\comic-explorer.exe' }
$outputRoot = Join-Path $projectRoot "src-tauri\target\verification\catalog-performance\$Label"
New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null
# Reuse the product harness's bounded CDP and process cleanup operations.
$tokens = $null
$parseErrors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile(
    (Join-Path $PSScriptRoot 'run-product-ui-harness.ps1'), [ref]$tokens, [ref]$parseErrors
)
$helpers = @('Get-FreeTcpPort', 'Invoke-Cdp', 'Invoke-Evaluate',
    'Get-HarnessDiagnostics', 'Get-DescendantProcessIds', 'Stop-HarnessDescendants',
    'Wait-ProcessIdReleased', 'Wait-CdpPortReleased', 'Start-Product', 'Stop-Product')
foreach ($definition in $ast.FindAll({ param($node)
    $node -is [Management.Automation.Language.FunctionDefinitionAst]
}, $false)) {
    if ($helpers -contains $definition.Name) { Invoke-Expression $definition.Extent.Text }
}
$script:sequence = 0
$script:socket = $null
$script:viewerTarget = $false
$script:activeProduct = $null
$script:testStage = 'catalog measurement'
# Startup can expose an about:blank target before the application's page exists.
function Connect-Cdp([int]$TimeoutSeconds = 30) {
    $deadline = [DateTime]::UtcNow.AddSeconds([Math]::Max(60, $TimeoutSeconds))
    do {
        try {
            $pages = Invoke-RestMethod "http://127.0.0.1:$port/json" -TimeoutSec 2
            $page = $pages | Where-Object {
                $_.type -eq 'page' -and $_.url -match '^(https?://tauri\.localhost|tauri://localhost)/'
            } | Select-Object -First 1
            if ($page) {
                $script:socket = [Net.WebSockets.ClientWebSocket]::new()
                $timeout = [Threading.CancellationTokenSource]::new([TimeSpan]::FromSeconds(10))
                try { $script:socket.ConnectAsync([Uri]$page.webSocketDebuggerUrl, $timeout.Token).GetAwaiter().GetResult() | Out-Null }
                finally { $timeout.Dispose() }
                return
            }
        } catch {}
        Start-Sleep -Milliseconds 100
    } while ([DateTime]::UtcNow -lt $deadline)
    throw "Application CDP page did not become ready: $($pages | ConvertTo-Json -Compress -Depth 4)"
}
$libraryJson = ConvertTo-Json $LibraryPath -Compress
$results = @()
foreach ($run in 1..$Runs) {
    $dataRoot = Join-Path $outputRoot "run-$run-$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"
    $product = $null
    try {
        $product = Start-Product $dataRoot
        $script:testStage = 'address readiness'
        $deadline = [DateTime]::UtcNow.AddSeconds(30)
        do {
            $ready = Invoke-Evaluate '!!document.querySelector("#address")'
            if ($ready) { break }
            Start-Sleep -Milliseconds 100
        } while ([DateTime]::UtcNow -lt $deadline)
        if (!$ready) { throw 'Address input did not become available.' }
        # Include UI handler + paint latency and event-loop stalls during loading/scrolling.
        $script:testStage = 'navigate to library'
        Invoke-Evaluate @"
(() => {
  window.catalogMeasurement = { started: performance.now(), samples: [], stalls: [], loadedMs: null, handledKeys: 0 };
  let previous = performance.now();
  window.catalogMeasurement.timer = setInterval(() => {
    const now = performance.now(), m = window.catalogMeasurement;
    m.stalls.push(Math.max(0, now - previous - 100)); previous = now;
    const item = document.querySelector('.catalog-item');
    if (item) {
      item.focus();
      const event = new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true, cancelable: true});
      item.dispatchEvent(event);
      if (event.defaultPrevented) {
        m.handledKeys++;
        requestAnimationFrame(() => m.samples.push(performance.now() - now));
      }
    }
    if (m.loadedMs === null && document.querySelector('.catalog-item') && !document.querySelector('.loading-state')) {
      m.loadedMs = performance.now() - m.started;
    }
  }, 100);
  const input = document.querySelector('#address');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, $libraryJson);
  input.dispatchEvent(new Event('input', {bubbles: true}));
  document.querySelector('.address-bar button[type=submit]').click();
  return true;
})()
"@ | Out-Null
        $deadline = [DateTime]::UtcNow.AddSeconds(120)
        $script:testStage = 'wait for catalog'
        do {
            $loaded = Invoke-Evaluate 'window.catalogMeasurement.loadedMs !== null'
            if ($loaded) { break }
            Start-Sleep -Milliseconds 250
        } while ([DateTime]::UtcNow -lt $deadline)
        if (!$loaded) { throw 'Catalog did not load within 120 seconds.' }
        $script:testStage = 'scroll catalog'
        Invoke-Evaluate @'
new Promise(resolve => {
  let step = 0;
  const timer = setInterval(() => {
    const grid = document.querySelector('.catalog-scroll');
    grid.scrollTop = (step % 10) * Math.max(1, (grid.scrollHeight - grid.clientHeight) / 10);
    if (++step === 30) { clearInterval(timer); resolve(true); }
  }, 250);
})
'@ | Out-Null
        $script:testStage = 'collect metrics'
        $measurement = Invoke-Evaluate @'
(() => {
  const m = window.catalogMeasurement; clearInterval(m.timer);
  const sorted = m.samples.slice().sort((a,b) => a-b);
  return { loadedMs: m.loadedMs, inputPaintP95Ms: sorted[Math.ceil(sorted.length * .95)-1],
    samples: sorted.length, handledKeys: m.handledKeys, maxEventLoopStallMs: Math.max(0, ...m.stalls),
    rendererJsHeapBytes: performance.memory?.usedJSHeapSize ?? null,
    entryCount: Number(document.querySelector('.catalog-scroll')?.dataset.entryCount),
    address: document.querySelector('#address')?.value,
    visibleItems: document.querySelectorAll('.catalog-item').length,
    visibleTreeRows: document.querySelectorAll('.tree-row').length,
    errors: [...document.querySelectorAll('[role=alert]')].map(n => n.textContent) };
})()
'@
        $ids = @($product.Id) + @(Get-DescendantProcessIds $product.Id)
        if ($measurement.handledKeys -eq 0) { throw 'No catalog keyboard events were handled; input latency is unmeasured.' }
        $memory = (Get-Process -Id $ids -ErrorAction SilentlyContinue |
            Measure-Object -Property WorkingSet64 -Sum).Sum
        $results += [pscustomobject]@{ run = $run; measurement = $measurement; processTreeWorkingSetBytes = $memory }
        $results[-1] | ConvertTo-Json -Depth 6 -Compress | Write-Output
    } catch {
        $pages = $null
        try { $pages = Invoke-RestMethod "http://127.0.0.1:$port/json" -TimeoutSec 2 } catch {}
        $results += [pscustomobject]@{ run = $run; stage = $script:testStage; error = $_.Exception.Message; pages = $pages }
        $results[-1] | ConvertTo-Json -Depth 6 -Compress | Write-Output
    } finally {
        if ($product) {
            try { Stop-Product $product -Force }
            catch {
                $results += [pscustomobject]@{ run = $run; stage = 'cleanup'; error = $_.Exception.Message }
                $results[-1] | ConvertTo-Json -Compress | Write-Output
            }
        }
    }
}
$report = [pscustomobject]@{
    label = $Label; libraryPath = $LibraryPath; executableSha256 = (Get-FileHash $executable).Hash
    capturedAt = [DateTimeOffset]::UtcNow.ToString('o'); runs = $results
    notes = 'Cold app-local cache per run; filesystem cache uncontrolled. Input latency is simulated keyboard dispatch to next paint, not OS input latency. Memory is a post-scroll snapshot, not peak.'
}
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $outputRoot 'results.json') -Encoding UTF8
if (@($results | Where-Object { $_.PSObject.Properties['error'] }).Count -gt 0) { exit 1 }
