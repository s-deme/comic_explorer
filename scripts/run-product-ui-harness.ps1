$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$executable = Join-Path $projectRoot "src-tauri\target\release\comic-explorer.exe"
$evidenceRoot = Join-Path $projectRoot "dist\product-ui-harness"
$library = Join-Path $evidenceRoot "library"
$appData = Join-Path $evidenceRoot "appdata"
$port = 9224
$script:sequence = 0
$script:socket = $null

function Connect-Cdp {
    $deadline = [DateTime]::UtcNow.AddSeconds(15)
    do {
        try {
            $pages = Invoke-RestMethod "http://127.0.0.1:$port/json"
            $page = $pages | Where-Object { $_.type -eq "page" } | Select-Object -First 1
            if ($page) {
                $script:socket = [Net.WebSockets.ClientWebSocket]::new()
                $script:socket.ConnectAsync(
                    [Uri]$page.webSocketDebuggerUrl,
                    [Threading.CancellationToken]::None
                ).GetAwaiter().GetResult() | Out-Null
                return
            }
        } catch {}
        Start-Sleep -Milliseconds 100
    } while ([DateTime]::UtcNow -lt $deadline)
    throw "WebView2 DevTools endpoint did not become ready."
}

function Invoke-Cdp([string]$Method, [hashtable]$Params) {
    $script:sequence += 1
    $id = $script:sequence
    $payload = @{ id = $id; method = $Method; params = $Params } |
        ConvertTo-Json -Compress -Depth 10
    $bytes = [Text.Encoding]::UTF8.GetBytes($payload)
    $segment = [ArraySegment[byte]]::new($bytes)
    $script:socket.SendAsync(
        $segment,
        [Net.WebSockets.WebSocketMessageType]::Text,
        $true,
        [Threading.CancellationToken]::None
    ).GetAwaiter().GetResult() | Out-Null
    do {
        $stream = [IO.MemoryStream]::new()
        do {
            $buffer = New-Object byte[] 65536
            $result = $script:socket.ReceiveAsync(
                [ArraySegment[byte]]::new($buffer),
                [Threading.CancellationToken]::None
            ).GetAwaiter().GetResult()
            $stream.Write($buffer, 0, $result.Count)
        } while (-not $result.EndOfMessage)
        $message = [Text.Encoding]::UTF8.GetString($stream.ToArray()) |
            ConvertFrom-Json
    } while ($message.id -ne $id)
    if ($message.error) { throw $message.error.message }
    return $message.result
}

function Invoke-Evaluate([string]$Expression) {
    $result = Invoke-Cdp "Runtime.evaluate" @{
        expression = $Expression
        awaitPromise = $true
        returnByValue = $true
    }
    if ($result.exceptionDetails) { throw $result.exceptionDetails.text }
    return $result.result.value
}

function Wait-Evaluate([string]$Expression, [string]$Description) {
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    do {
        if (Invoke-Evaluate $Expression) { return }
        Start-Sleep -Milliseconds 100
    } while ([DateTime]::UtcNow -lt $deadline)
    $diagnostic = Invoke-Evaluate (
        "(async () => { const image = document.querySelector('.thumbnail img'); " +
        "let fetchResult = null; if (image) { try { const response = await fetch(image.src); " +
        "fetchResult = {status: response.status, headers: [...response.headers]}; } " +
        "catch (error) { fetchResult = String(error); } } return {url: location.href, " +
        "text: document.body.innerText, image: image && {complete: image.complete, " +
        "naturalWidth: image.naturalWidth, src: image.src}, fetchResult, thumbnails: " +
        "[...document.querySelectorAll('.thumbnail')].map((node) => node.outerHTML)}; })()"
    )
    throw "Timed out waiting for $Description. thumbnails=$($diagnostic | ConvertTo-Json -Compress)"
}

function Start-Product {
    $env:LOCALAPPDATA = $appData
    $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$port"
    $process = Start-Process -FilePath $executable -PassThru
    try {
        Connect-Cdp
        return $process
    } catch {
        Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        throw
    }
}

function Stop-Product($Process) {
    if ($script:socket) {
        $script:socket.Dispose()
        $script:socket = $null
    }
    Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
    $Process.WaitForExit()
}

Remove-Item $evidenceRoot -Recurse -Force -ErrorAction SilentlyContinue
New-Item $library -ItemType Directory -Force | Out-Null
Copy-Item (
    Join-Path $projectRoot "tests\fixtures\generated\FIX-ZIP-001\standard.cbz"
) (Join-Path $library "1-valid.cbz")
Copy-Item (
    Join-Path $projectRoot "tests\fixtures\generated\FIX-ZIP-ERROR-001\corrupt.zip"
) (Join-Path $library "2-corrupt.zip")
$sourceFiles = @(
    (Join-Path $library "1-valid.cbz"),
    (Join-Path $library "2-corrupt.zip")
)
$before = $sourceFiles | ForEach-Object { (Get-FileHash $_ -Algorithm SHA256).Hash }

$cold = $null
$warm = $null
try {
    $cold = Start-Product
    Wait-Evaluate "document.querySelector('#library-root') !== null" "setup UI"
    $libraryJson = $library | ConvertTo-Json -Compress
    Invoke-Evaluate @"
(() => {
  const input = document.querySelector('#library-root');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(input, $libraryJson);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  document.querySelector('button[type=submit]').click();
  return true;
})()
"@ | Out-Null
    Wait-Evaluate "document.querySelectorAll('[role=gridcell]').length === 2" "catalog entries"
    Wait-Evaluate (
        "document.querySelectorAll('.thumbnail[data-cache-hit=false] img').length === 1 && " +
        "document.querySelectorAll('.thumbnail[data-thumbnail-state=error]').length === 1"
    ) "cold thumbnail success and error"
    Wait-Evaluate (
        "[...document.querySelectorAll('.thumbnail[data-cache-hit=false] img')]" +
        ".every((image) => image.complete && image.naturalWidth > 0)"
    ) "cold thumbnail image decode"
    Stop-Product $cold
    $cold = $null

    $warm = Start-Product
    Wait-Evaluate "document.querySelectorAll('[role=gridcell]').length === 2" "restored catalog"
    Wait-Evaluate (
        "document.querySelectorAll('.thumbnail[data-cache-hit=true] img').length === 1 && " +
        "document.querySelectorAll('.thumbnail[data-thumbnail-state=error]').length === 1"
    ) "warm cache hit and negative placeholder"
    Wait-Evaluate (
        "[...document.querySelectorAll('.thumbnail[data-cache-hit=true] img')]" +
        ".every((image) => image.complete && image.naturalWidth > 0)"
    ) "warm thumbnail image decode"
    $after = $sourceFiles | ForEach-Object { (Get-FileHash $_ -Algorithm SHA256).Hash }
    if (Compare-Object $before $after) {
        throw "Product UI harness changed source archives."
    }
    @{
        status = "ok"
        coldGenerated = $true
        warmCacheHit = $true
        negativePlaceholder = $true
        imageDecoded = $true
        sourceDifferenceCount = 0
    } | ConvertTo-Json -Compress
} finally {
    if ($cold) { Stop-Product $cold }
    if ($warm) { Stop-Product $warm }
    Remove-Item $evidenceRoot -Recurse -Force -ErrorAction SilentlyContinue
}
