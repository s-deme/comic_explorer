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
    if ($result.exceptionDetails) {
        throw (
            "$($result.exceptionDetails.text): " +
            "$($result.exceptionDetails.exception.description) in $Expression"
        )
    }
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
New-Item (Join-Path $library "folder-a\child\deep") -ItemType Directory -Force |
    Out-Null
New-Item (Join-Path $library "comic-folder") -ItemType Directory -Force |
    Out-Null
Copy-Item (
    Join-Path $projectRoot "tests\fixtures\generated\FIX-IMAGE-001\portrait.png"
) (Join-Path $library "comic-folder\1.png")
Copy-Item (
    Join-Path $projectRoot "tests\fixtures\generated\FIX-IMAGE-001\wide.png"
) (Join-Path $library "comic-folder\2.png")
Copy-Item (
    Join-Path $projectRoot "tests\fixtures\generated\FIX-IMAGE-001\square.png"
) (Join-Path $library "comic-folder\3.png")
$longName = "0-very-long-comic-folder-name-0123456789-abcdefghijklmnopqrstuvwxyz"
New-Item (Join-Path $library $longName) -ItemType Directory -Force | Out-Null
1..120 | ForEach-Object {
    New-Item (Join-Path $library ("scroll-folder-{0:D3}" -f $_)) `
        -ItemType Directory -Force | Out-Null
}
$sourceFiles = @(
    (Join-Path $library "1-valid.cbz"),
    (Join-Path $library "2-corrupt.zip"),
    (Join-Path $library "comic-folder\1.png"),
    (Join-Path $library "comic-folder\2.png"),
    (Join-Path $library "comic-folder\3.png")
)
$before = $sourceFiles | ForEach-Object { (Get-FileHash $_ -Algorithm SHA256).Hash }
$beforeTree = Get-ChildItem $library -File -Recurse | Sort-Object FullName |
    ForEach-Object {
        "$($_.FullName.Substring($library.Length)):$((Get-FileHash $_.FullName -Algorithm SHA256).Hash)"
    }

$cold = $null
$warm = $null
$viewerRestart = $null
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
    Wait-Evaluate (
        "document.querySelector('.status-bar span')?.textContent.startsWith('125') && " +
        "document.querySelector('#address').value.endsWith('\\library') && " +
        "[...document.querySelectorAll('[role=treeitem]')].some((node) => " +
        "node.textContent === 'library' && node.getAttribute('aria-selected') === 'true')"
    ) "all catalog entries"
    Wait-Evaluate (
        "document.querySelectorAll('.thumbnail[data-cache-hit=false] img').length === 2 && " +
        "document.querySelectorAll('.thumbnail[data-thumbnail-state=error]').length === 1"
    ) "cold thumbnail success and error"
    Wait-Evaluate (
        "[...document.querySelectorAll('.thumbnail[data-cache-hit=false] img')]" +
        ".every((image) => image.complete && image.naturalWidth > 0)"
    ) "cold thumbnail image decode"
    $longNameJson = $longName | ConvertTo-Json -Compress
    if (-not (Invoke-Evaluate (
        "[...document.querySelectorAll('.catalog-item')].some((node) => " +
        "node.title.startsWith($longNameJson + ' '))"
    ))) { throw "Long-name tooltip was not exposed." }
    if ((Invoke-Evaluate "document.querySelectorAll('[role=gridcell]').length") -gt 100) {
        throw "Virtual grid mounted more than 100 cells."
    }
    Invoke-Evaluate (
        "(() => { const scroll = document.querySelector('.catalog-scroll'); " +
        "scroll.scrollTop = scroll.scrollHeight; scroll.dispatchEvent(new Event('scroll')); " +
        "return true; })()"
    ) | Out-Null
    Wait-Evaluate (
        "[...document.querySelectorAll('.catalog-item')].some((node) => " +
        "node.title.startsWith('scroll-folder-120 '))"
    ) "last virtualized catalog item"
    Invoke-Evaluate (
        "(() => { const item = [...document.querySelectorAll('.catalog-item')]" +
        ".find((node) => node.title.startsWith('scroll-folder-120 ')); " +
        "item.click(); return true; })()"
    ) | Out-Null
    Wait-Evaluate (
        "[...document.querySelectorAll('.status-bar span')].some((node) => " +
        "node.textContent.includes('scroll-folder-120'))"
    ) "selected-item status"
    Invoke-Evaluate (
        "(() => { const scroll = document.querySelector('.catalog-scroll'); " +
        "scroll.scrollTop = 0; scroll.dispatchEvent(new Event('scroll')); return true; })()"
    ) | Out-Null
    Wait-Evaluate (
        "[...document.querySelectorAll('.catalog-item')].some((node) => " +
        "node.title.startsWith('folder-a '))"
    ) "first virtualized catalog items"
    Invoke-Evaluate @"
(() => {
  const item = [...document.querySelectorAll('.catalog-item')]
    .find((node) => node.title.startsWith('folder-a '));
  item.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  return true;
})()
"@ | Out-Null
    Wait-Evaluate "document.querySelector('#address').value.endsWith('\\folder-a')" "folder navigation"
    Wait-Evaluate (
        "[...document.querySelectorAll('[role=treeitem]')].some((node) => " +
        "node.textContent === 'folder-a' && node.getAttribute('aria-selected') === 'true')"
    ) "tree/address/list synchronization"
    Invoke-Evaluate @"
(() => {
  const item = [...document.querySelectorAll('.catalog-item')]
    .find((node) => node.title.startsWith('child '));
  item.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  return true;
})()
"@ | Out-Null
    Wait-Evaluate "document.querySelector('#address').value.endsWith('\\folder-a\\child')" "deep navigation"
    Invoke-Evaluate "document.querySelector('.toolbar > button:nth-of-type(1)').click(); true" | Out-Null
    Wait-Evaluate "document.querySelector('#address').value.endsWith('\\folder-a')" "back navigation"
    Invoke-Evaluate "document.querySelector('.toolbar > button:nth-of-type(2)').click(); true" | Out-Null
    Wait-Evaluate "document.querySelector('#address').value.endsWith('\\folder-a\\child')" "forward navigation"
    Invoke-Evaluate "document.querySelector('.toolbar > button:nth-of-type(3)').click(); true" | Out-Null
    Wait-Evaluate "document.querySelector('#address').value.endsWith('\\folder-a')" "up navigation"
    $directPathJson = (Join-Path $library "folder-a\child") |
        ConvertTo-Json -Compress
    Invoke-Evaluate @"
(async () => {
  const input = document.querySelector('#address');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(input, $directPathJson);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  input.form.requestSubmit();
  return true;
})()
"@ | Out-Null
    Wait-Evaluate "document.querySelector('#address').value.endsWith('\\folder-a\\child')" "direct-path navigation"
    Invoke-Evaluate @"
(async () => {
  const input = document.querySelector('#address');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(input, 'C:\\outside-library');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  input.form.requestSubmit();
  return true;
})()
"@ | Out-Null
    Wait-Evaluate "document.querySelector('[role=alert]') !== null" "root escape rejection"
    $coldSortState = Invoke-Evaluate @"
(async () => {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
  for (const field of ['name', 'modified', 'size', 'kind']) {
    const select = document.querySelector('.toolbar select');
    setter.call(select, field);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  const select = document.querySelector('.toolbar select');
  setter.call(select, 'kind');
  select.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 300));
  const direction = document.querySelector('.toolbar > button:last-of-type');
  direction.click();
  await new Promise((resolve) => setTimeout(resolve, 500));
  return {field: document.querySelector('.toolbar select').value,
    text: document.querySelector('.toolbar > button:last-of-type').textContent};
})()
"@
    if ($coldSortState.field -ne "kind") {
        throw "Sort control did not change in product UI: $($coldSortState | ConvertTo-Json -Compress)"
    }
    Stop-Product $cold
    $cold = $null

    $warm = Start-Product
    Wait-Evaluate (
        "document.querySelector('.status-bar span')?.textContent.startsWith('125')"
    ) "restored catalog"
    Wait-Evaluate (
        "document.querySelectorAll('.thumbnail[data-cache-hit=true] img').length === 2 && " +
        "document.querySelectorAll('.thumbnail[data-thumbnail-state=error]').length === 1"
    ) "warm cache hit and negative placeholder"
    Wait-Evaluate (
        "[...document.querySelectorAll('.thumbnail[data-cache-hit=true] img')]" +
        ".every((image) => image.complete && image.naturalWidth > 0)"
    ) "warm thumbnail image decode"
    Invoke-Evaluate (
        "(() => { const item = [...document.querySelectorAll('.catalog-item')]" +
        ".find((node) => node.title.startsWith('comic-folder ')); item.click(); " +
        "item.closest('[role=gridcell]').querySelector('.read-action').click(); return true; })()"
    ) | Out-Null
    Wait-Evaluate (
        "document.querySelector('.viewer') !== null && " +
        "document.querySelector('.page-spread img:not(.prefetch-page)')?.naturalWidth > 0"
    ) "viewer first page"
    if (-not (Invoke-Evaluate (
        "(() => { const image = document.querySelector('.page-spread img'); " +
        "const box = image.getBoundingClientRect(); " +
        "const stage = document.querySelector('.viewer-stage').getBoundingClientRect(); " +
        "return box.width <= image.naturalWidth && " +
        "box.height <= image.naturalHeight && Math.abs(box.width / box.height - " +
        "image.naturalWidth / image.naturalHeight) < 0.02 && " +
        "Math.abs((box.left + box.right) / 2 - (stage.left + stage.right) / 2) < 2 && " +
        "Math.abs((box.top + box.bottom) / 2 - (stage.top + stage.bottom) / 2) < 2; })()"
    ))) { throw "Single-page fit distorted or upscaled the real image." }
    Invoke-Evaluate (
        "window.dispatchEvent(new KeyboardEvent('keydown', {key:'PageUp', bubbles:true})); true"
    ) | Out-Null
    Wait-Evaluate (
        "document.querySelector('.viewer-toolbar span:last-of-type').textContent.startsWith('1 / 3')"
    ) "first-page edge stays"
    Invoke-Evaluate (
        "window.dispatchEvent(new KeyboardEvent('keydown', {key:'PageDown', bubbles:true})); true"
    ) | Out-Null
    Wait-Evaluate (
        "document.querySelector('.viewer-toolbar span:last-of-type').textContent.startsWith('2 / 3')"
    ) "PageDown navigation"
    Wait-Evaluate (
        "document.querySelector('.page-spread img')?.naturalWidth > " +
        "document.querySelector('.page-spread img')?.naturalHeight"
    ) "landscape page decode"
    Invoke-Evaluate (
        "window.dispatchEvent(new KeyboardEvent('keydown', {key:'PageUp', bubbles:true})); true"
    ) | Out-Null
    Wait-Evaluate (
        "document.querySelector('.viewer-toolbar span:last-of-type').textContent.startsWith('1 / 3')"
    ) "PageUp navigation"
    Invoke-Evaluate (
        "document.querySelector('.viewer-stage').dispatchEvent(" +
        "new WheelEvent('wheel', {deltaY:1, bubbles:true})); true"
    ) | Out-Null
    Wait-Evaluate (
        "document.querySelector('.viewer-toolbar span:last-of-type').textContent.startsWith('2 / 3')"
    ) "wheel next navigation"
    Invoke-Evaluate (
        "document.querySelector('.viewer-stage').dispatchEvent(" +
        "new WheelEvent('wheel', {deltaY:-1, bubbles:true})); true"
    ) | Out-Null
    Wait-Evaluate (
        "document.querySelector('.viewer-toolbar span:last-of-type').textContent.startsWith('1 / 3')"
    ) "wheel previous navigation"
    Invoke-Evaluate "document.querySelector('.page-zone-left').click(); true" | Out-Null
    Wait-Evaluate (
        "document.querySelector('.viewer-toolbar span:last-of-type').textContent.startsWith('2 / 3')"
    ) "click next navigation"
    Invoke-Evaluate "document.querySelector('.viewer-toolbar button:nth-of-type(1)').click(); true" |
        Out-Null
    Wait-Evaluate (
        "document.querySelectorAll('.page-spread img:not(.prefetch-page)').length === 1"
    ) "landscape page alone in spread mode"
    Invoke-Evaluate (
        "window.dispatchEvent(new KeyboardEvent('keydown', {key:' ', bubbles:true})); true"
    ) | Out-Null
    Wait-Evaluate (
        "document.querySelector('.viewer-toolbar span:last-of-type').textContent.startsWith('3 / 3') && " +
        "document.querySelectorAll('.page-spread img:not(.prefetch-page)').length === 1"
    ) "final odd page"
    Invoke-Evaluate (
        "window.dispatchEvent(new KeyboardEvent('keydown', {key:'PageUp', bubbles:true})); true"
    ) | Out-Null
    Wait-Evaluate (
        "document.querySelector('.viewer-toolbar span:last-of-type').textContent.startsWith('2 / 3')"
    ) "spread history first reverse"
    Invoke-Evaluate (
        "window.dispatchEvent(new KeyboardEvent('keydown', {key:'PageUp', bubbles:true})); true"
    ) | Out-Null
    Wait-Evaluate (
        "document.querySelector('.viewer-toolbar span:last-of-type').textContent.startsWith('1-2 / 3')"
    ) "spread history returns leading page"
    Invoke-Evaluate "document.querySelector('.viewer-toolbar button:nth-of-type(2)').click(); true" |
        Out-Null
    Wait-Evaluate (
        "document.querySelector('.page-spread').dataset.direction === 'leftToRight' && " +
        "document.querySelector('.viewer-toolbar span:last-of-type').textContent.startsWith('1-2 / 3')"
    ) "direction switch keeps leading page"
    Invoke-Evaluate "document.querySelector('.page-zone-right').click(); true" | Out-Null
    Wait-Evaluate (
        "document.querySelector('.viewer-toolbar span:last-of-type').textContent.startsWith('3 / 3')"
    ) "left-to-right click direction"
    Invoke-Evaluate (
        "window.dispatchEvent(new KeyboardEvent('keydown', {key:'PageUp', bubbles:true})); true"
    ) | Out-Null
    Wait-Evaluate (
        "document.querySelector('.viewer-toolbar span:last-of-type').textContent.startsWith('1-2 / 3')"
    ) "direction click reverse"
    Invoke-Evaluate (
        "window.dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowRight', bubbles:true})); true"
    ) | Out-Null
    Wait-Evaluate (
        "document.querySelector('.viewer-toolbar span:last-of-type').textContent.startsWith('3 / 3')"
    ) "left-to-right arrow direction"
    Invoke-Evaluate (
        "window.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true})); true"
    ) | Out-Null
    Wait-Evaluate (
        "document.querySelector('.viewer') === null && " +
        "[...document.querySelectorAll('.status-bar span')].some((node) => " +
        "node.textContent.includes('comic-folder')) && " +
        "document.activeElement?.title?.startsWith('comic-folder ')"
    ) "viewer context restoration"
    Stop-Product $warm
    $warm = $null

    $viewerRestart = Start-Product
    Wait-Evaluate (
        "document.querySelector('.status-bar span')?.textContent.startsWith('125')"
    ) "viewer-settings restart catalog"
    Wait-Evaluate (
        "document.querySelectorAll('.thumbnail[data-cache-hit=true] img').length === 2 && " +
        "document.querySelectorAll('.thumbnail[data-thumbnail-state=error]').length === 1"
    ) "viewer-settings restart thumbnails"
    Invoke-Evaluate (
        "(() => { const item = [...document.querySelectorAll('.catalog-item')]" +
        ".find((node) => node.title.startsWith('comic-folder ')); item.focus(); " +
        "item.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', bubbles:true})); " +
        "return true; })()"
    ) | Out-Null
    Wait-Evaluate (
        "document.querySelector('#address').value.endsWith('\\comic-folder') && " +
        "document.querySelector('.viewer') === null"
    ) "comic-folder Enter navigates"
    Invoke-Evaluate "document.querySelector('.toolbar > button:nth-of-type(3)').click(); true" |
        Out-Null
    Wait-Evaluate (
        "document.querySelector('#address').value.endsWith('\\library') && " +
        "document.querySelector('.status-bar span')?.textContent.startsWith('125')"
    ) "comic-folder keyboard navigation return"
    Invoke-Evaluate (
        "(() => { const item = [...document.querySelectorAll('.catalog-item')]" +
        ".find((node) => node.title.startsWith('comic-folder ')); item.click(); item.focus(); " +
        "item.dispatchEvent(new KeyboardEvent('keydown', " +
        "{key:'Enter', ctrlKey:true, bubbles:true})); return true; })()"
    ) | Out-Null
    Wait-Evaluate (
        "document.querySelector('.page-spread')?.dataset.direction === 'leftToRight' && " +
        "document.querySelectorAll('.page-spread img:not(.prefetch-page)').length === 1 && " +
        "document.querySelector('.viewer-toolbar span:last-of-type').textContent.startsWith('3 / 3')"
    ) "viewer position, mode and direction restart restoration"
    Invoke-Evaluate (
        "window.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true})); true"
    ) | Out-Null
    Wait-Evaluate "document.querySelector('.viewer') === null" "restored viewer close"
    Invoke-Evaluate (
        "(() => { const item = [...document.querySelectorAll('.catalog-item')]" +
        ".find((node) => node.title.startsWith('1-valid.cbz ')); item.focus(); " +
        "item.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', bubbles:true})); " +
        "return true; })()"
    ) | Out-Null
    Wait-Evaluate (
        "document.querySelector('.viewer') !== null && " +
        "document.body.innerText.includes('1-valid.cbz')"
    ) "archive Enter opens viewer"
    Invoke-Evaluate (
        "window.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true})); true"
    ) | Out-Null
    Wait-Evaluate "document.querySelector('.viewer') === null" "archive viewer close"
    Invoke-Evaluate (
        "(() => { const item = [...document.querySelectorAll('.catalog-item')]" +
        ".find((node) => node.title.startsWith('2-corrupt.zip ')); item.focus(); " +
        "item.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', bubbles:true})); " +
        "return true; })()"
    ) | Out-Null
    Wait-Evaluate (
        "document.querySelector('[role=alert]')?.textContent.includes('2-corrupt.zip') && " +
        "document.querySelector('[role=alert] button:nth-of-type(2)') !== null"
    ) "corrupt archive error and recovery actions"
    Invoke-Evaluate "document.querySelector('[role=alert] button:nth-of-type(2)').click(); true" |
        Out-Null
    Wait-Evaluate (
        "document.querySelector('[role=alert]') === null && " +
        "document.querySelector('.status-bar span')?.textContent.startsWith('125')"
    ) "corrupt archive list recovery"
    $after = $sourceFiles | ForEach-Object { (Get-FileHash $_ -Algorithm SHA256).Hash }
    if (Compare-Object $before $after) {
        throw "Product UI harness changed source archives."
    }
    $afterTree = Get-ChildItem $library -File -Recurse | Sort-Object FullName |
        ForEach-Object {
            "$($_.FullName.Substring($library.Length)):$((Get-FileHash $_.FullName -Algorithm SHA256).Hash)"
        }
    if (Compare-Object $beforeTree $afterTree) {
        throw "Product UI harness changed the source tree or created adjacent files."
    }
    @{
        status = "ok"
        coldGenerated = $true
        warmCacheHit = $true
        negativePlaceholder = $true
        imageDecoded = $true
        rootRestored = $true
        navigationHistory = $true
        treeAddressListSynchronized = $true
        rootEscapeRejected = $true
        sortControlsExercised = $true
        longNameTooltip = $true
        mountedGridCellsAtMost100 = $true
        viewerFitNoUpscale = $true
        viewerInputParity = $true
        spreadHistoryReversible = $true
        landscapeAndOddPagesAlone = $true
        viewerContextRestored = $true
        viewerSettingsRestored = $true
        sourceDifferenceCount = 0
    } | ConvertTo-Json -Compress
} finally {
    if ($cold) { Stop-Product $cold }
    if ($warm) { Stop-Product $warm }
    if ($viewerRestart) { Stop-Product $viewerRestart }
    Remove-Item $evidenceRoot -Recurse -Force -ErrorAction SilentlyContinue
}
