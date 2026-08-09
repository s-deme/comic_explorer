[CmdletBinding()]
param(
    [switch]$FullscreenOnly,
    [switch]$ShortcutOnly,
    [switch]$TagsOnly,
    [switch]$MemoOnly
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot "release-freshness.ps1")
Set-StrictMode -Off
$executable = Join-Path $projectRoot "src-tauri\target\release\comic-explorer.exe"
$evidenceRoot = Join-Path $projectRoot "dist\product-ui-harness"
$library = Join-Path $evidenceRoot "library"
$missingLibrary = Join-Path $evidenceRoot "library-missing"
$appData = Join-Path $evidenceRoot "appdata"
$recoveryAppData = Join-Path $evidenceRoot "recovery-appdata"
$keyboardAppData = Join-Path $evidenceRoot "keyboard-appdata"
$script:sequence = 0
$script:socket = $null
$script:testStage = "preflight"
$script:activeProduct = $null

function Get-FreeTcpPort {
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
    try {
        $listener.Start()
        return ([Net.IPEndPoint]$listener.LocalEndpoint).Port
    } finally {
        $listener.Stop()
    }
}

$port = Get-FreeTcpPort
$freshness = Test-ReleaseFreshness -ProjectRoot $projectRoot
if (!$freshness.Fresh) {
    $freshnessFeature = if ($MemoOnly) { "IMP-006" } elseif ($TagsOnly) { "IMP-005" } else { "IMP-004" }
    $staleMessage = ("STALE_RELEASE: {0}. Run scripts\verify-feature-windows.ps1 " +
        "-Feature {1} to rebuild and bind the executable. manifest={2} inputHash={3}") -f `
        $freshness.Reason, $freshnessFeature, $freshness.ManifestPath, $freshness.InputHash
    throw $staleMessage
}

function Get-HarnessDiagnostics {
    $dom = $null
    try {
        if (!$script:socket -or $script:socket.State -ne [Net.WebSockets.WebSocketState]::Open) {
            throw "CDP socket is not open."
        }
        $dom = Invoke-Evaluate (
            "(() => ({url: location.href, title: document.title, readyState: document.readyState, " +
            "text: document.body?.innerText.slice(0, 3000), active: document.activeElement?.outerHTML.slice(0, 500), " +
            "dialogs: [...document.querySelectorAll('[role=dialog]')].map(n => n.outerHTML.slice(0, 1000)), " +
            "statuses: [...document.querySelectorAll('[role=status],[role=alert]')].map(n => n.outerHTML.slice(0, 500))}))()"
        )
    } catch { $dom = @{ error = $_.Exception.Message } }
    $processIds = @()
    if ($script:activeProduct) {
        $processIds = @($script:activeProduct.Id) + @(Get-DescendantProcessIds $script:activeProduct.Id)
    }
    $processes = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object { $processIds -contains [int]$_.ProcessId } |
        Select-Object ProcessId, ParentProcessId, Name, CommandLine)
    $ports = $null
    try {
        $ports = Get-NetTCPConnection -LocalPort $port -ErrorAction Stop |
            Select-Object LocalAddress, LocalPort, RemoteAddress, RemotePort, State, OwningProcess
    } catch { $ports = @() }
    return [pscustomobject]@{
        stage = $script:testStage
        port = $port
        dom = $dom
        processes = @($processes)
        connections = @($ports)
    }
}

function Connect-Cdp([int]$TimeoutSeconds = 30) {
    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    do {
        try {
            $pages = Invoke-RestMethod "http://127.0.0.1:$port/json" -TimeoutSec 2
            $page = $pages | Where-Object { $_.type -eq "page" } | Select-Object -First 1
            if ($page) {
                $script:socket = [Net.WebSockets.ClientWebSocket]::new()
                $connectTimeout = [Threading.CancellationTokenSource]::new(
                    [TimeSpan]::FromSeconds(10)
                )
                try {
                    $script:socket.ConnectAsync(
                        [Uri]$page.webSocketDebuggerUrl,
                        $connectTimeout.Token
                    ).GetAwaiter().GetResult() | Out-Null
                } finally {
                    $connectTimeout.Dispose()
                }
                return
            }
        } catch {}
        Start-Sleep -Milliseconds 100
    } while ([DateTime]::UtcNow -lt $deadline)
    throw ("WebView2 DevTools endpoint did not become ready. diagnostics=" +
        ((Get-HarnessDiagnostics) | ConvertTo-Json -Depth 6 -Compress))
}

function Invoke-Cdp([string]$Method, [hashtable]$Params) {
    $script:sequence += 1
    $id = $script:sequence
    $payload = @{ id = $id; method = $Method; params = $Params } |
        ConvertTo-Json -Compress -Depth 10
    $bytes = [Text.Encoding]::UTF8.GetBytes($payload)
    $segment = [ArraySegment[byte]]::new($bytes)
    try {
        $script:socket.SendAsync(
            $segment,
            [Net.WebSockets.WebSocketMessageType]::Text,
            $true,
            [Threading.CancellationToken]::None
        ).GetAwaiter().GetResult() | Out-Null
    } catch {
        if ($script:socket) { $script:socket.Dispose() }
        $script:socket = $null
        Connect-Cdp
        $script:socket.SendAsync(
            $segment,
            [Net.WebSockets.WebSocketMessageType]::Text,
            $true,
            [Threading.CancellationToken]::None
        ).GetAwaiter().GetResult() | Out-Null
    }
    do {
        $stream = [IO.MemoryStream]::new()
        $receiveTimeout = [Threading.CancellationTokenSource]::new(
            [TimeSpan]::FromSeconds(10)
        )
        try {
            do {
                $buffer = New-Object byte[] 65536
                $receiveTask = $script:socket.ReceiveAsync(
                    [ArraySegment[byte]]::new($buffer),
                    $receiveTimeout.Token
                )
                if (-not $receiveTask.Wait(10000)) {
                    throw "Timed out waiting for a WebView2 DevTools response."
                }
                $result = $receiveTask.GetAwaiter().GetResult()
                if ($result.MessageType -eq [Net.WebSockets.WebSocketMessageType]::Close) {
                    throw "WebView2 DevTools socket closed before a response arrived."
                }
                $stream.Write($buffer, 0, $result.Count)
            } while (-not $result.EndOfMessage)
        } finally {
            $receiveTimeout.Dispose()
        }
        $message = [Text.Encoding]::UTF8.GetString($stream.ToArray()) |
            ConvertFrom-Json
    } while ($message.id -ne $id)
    if ($message.PSObject.Properties["error"]) { throw $message.error.message }
    return $message.result
}

function Invoke-Evaluate([string]$Expression) {
    $result = Invoke-Cdp "Runtime.evaluate" @{
        expression = $Expression
        awaitPromise = $true
        returnByValue = $true
    }
    if ($result.PSObject.Properties["exceptionDetails"]) {
        throw (
            "$($result.exceptionDetails.text): " +
            "$($result.exceptionDetails.exception.description) in $Expression"
        )
    }
    return $result.result.value
}

function Wait-Evaluate([string]$Expression, [string]$Description) {
    $script:testStage = $Description
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    do {
        if (Invoke-Evaluate $Expression) { return }
        Start-Sleep -Milliseconds 100
    } while ([DateTime]::UtcNow -lt $deadline)
    throw ("Timed out waiting for $Description. diagnostics=" +
        ((Get-HarnessDiagnostics) | ConvertTo-Json -Depth 7 -Compress))
}

function Get-ViewerPagePosition {
    $position = Invoke-Evaluate (
        "(() => { const text = document.querySelector('.viewer-toolbar span:last-of-type')?.textContent || ''; " +
        "const match = text.match(/(\d+)\s*\/\s*(\d+)/); return match ? " +
        "{page:Number(match[1]), count:Number(match[2])} : null; })()"
    )
    if ($null -eq $position) { throw "Viewer page position is not available." }
    return $position
}

function Wait-ViewerPage([int]$Expected, [string]$Description) {
    Wait-Evaluate (
        "(() => { const match = (document.querySelector('.viewer-toolbar span:last-of-type')?.textContent || '')" +
        ".match(/(\d+)\s*\//); return match && Number(match[1]) === $Expected; })()"
    ) $Description
}

function Invoke-Key(
    [string]$Key,
    [string]$Code,
    [int]$VirtualKeyCode,
    [int]$Modifiers = 0
) {
    $down = @{
        type = "keyDown"
        key = $Key
        code = $Code
        windowsVirtualKeyCode = $VirtualKeyCode
        nativeVirtualKeyCode = $VirtualKeyCode
        modifiers = $Modifiers
    }
    if ($Key -eq "Enter") {
        $down.text = "`r"
        $down.unmodifiedText = "`r"
    }
    Invoke-Cdp "Input.dispatchKeyEvent" $down | Out-Null
    if ($Key -eq "Enter") {
        Invoke-Cdp "Input.dispatchKeyEvent" @{
            type = "char"
            key = $Key
            code = $Code
            text = "`r"
            unmodifiedText = "`r"
            windowsVirtualKeyCode = $VirtualKeyCode
            nativeVirtualKeyCode = $VirtualKeyCode
            modifiers = $Modifiers
        } | Out-Null
    }
    Invoke-Cdp "Input.dispatchKeyEvent" @{
        type = "keyUp"
        key = $Key
        code = $Code
        windowsVirtualKeyCode = $VirtualKeyCode
        nativeVirtualKeyCode = $VirtualKeyCode
        modifiers = $Modifiers
    } | Out-Null
}

function Invoke-OsKeys($Process, [string]$Keys) {
    $shell = New-Object -ComObject WScript.Shell
    if (-not $shell.AppActivate($Process.Id)) {
        throw "Could not activate product window for keyboard input."
    }
    Start-Sleep -Milliseconds 50
    $shell.SendKeys($Keys)
    Start-Sleep -Milliseconds 50
}

function Assert-CatalogSort([string]$Field, [string]$Direction) {
    $fieldJson = $Field | ConvertTo-Json -Compress
    $descendingJson = if ($Direction -eq "descending") { "true" } else { "false" }
    $result = Invoke-Evaluate @"
(async () => {
  const select = document.querySelector('.toolbar select');
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
  setter.call(select, $fieldJson);
  select.dispatchEvent(new Event('change', { bubbles: true }));
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (document.querySelector('.toolbar select').dataset.sortField === $fieldJson) break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const direction = document.querySelector('.toolbar > button:last-of-type');
  const currentlyDescending = direction.dataset.sortDescending === 'true';
  if (currentlyDescending !== $descendingJson) direction.click();
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const current = document.querySelector('.toolbar > button:last-of-type');
    if ((current.dataset.sortDescending === 'true') === $descendingJson) break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  await new Promise((resolve) => setTimeout(resolve, 100));
  const finalDirection = document.querySelector('.toolbar > button:last-of-type');

  const selected = document.querySelector('.catalog-item[data-selected=true]');
  const selectionFocused = selected?.dataset.relativePath === 'comic-folder' &&
    document.activeElement?.dataset.relativePath === 'comic-folder';
  const scroll = document.querySelector('.catalog-scroll');
  const items = new Map();
  const capture = () => {
    for (const row of document.querySelectorAll('.catalog-row')) {
      const rowIndex = Number(row.getAttribute('aria-rowindex')) - 1;
      [...row.querySelectorAll('.catalog-item')].forEach((item, column) => {
        items.set(rowIndex * 5 + column, {
          path: item.dataset.relativePath,
          name: item.dataset.relativePath.split('/').at(-1),
          kind: item.dataset.kind,
          archiveKind: item.dataset.archiveKind || null,
          modifiedMs: Number.isFinite(Number(item.dataset.modifiedMs)) ?
            Number(item.dataset.modifiedMs) : null,
          byteSize: Number.isFinite(Number(item.dataset.byteSize)) ?
            Number(item.dataset.byteSize) : null,
        });
      });
    }
  };
  for (let top = 0; top <= scroll.scrollHeight; top += Math.max(100, scroll.clientHeight / 2)) {
    scroll.scrollTop = top;
    scroll.dispatchEvent(new Event('scroll'));
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 10)));
    capture();
  }
  scroll.scrollTop = scroll.scrollHeight;
  scroll.dispatchEvent(new Event('scroll'));
  await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 10)));
  capture();
  const actual = [...items.entries()].sort((left, right) => left[0] - right[0]).map((entry) => entry[1]);

  const ordinal = (left, right) => {
    const length = Math.min(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
      const difference = left.charCodeAt(index) - right.charCodeAt(index);
      if (difference !== 0) return difference;
    }
    return left.length - right.length;
  };
  const natural = (left, right) => {
    let leftIndex = 0;
    let rightIndex = 0;
    while (leftIndex < left.length && rightIndex < right.length) {
      const leftDigit = left.charCodeAt(leftIndex) >= 48 && left.charCodeAt(leftIndex) <= 57;
      const rightDigit = right.charCodeAt(rightIndex) >= 48 && right.charCodeAt(rightIndex) <= 57;
      if (leftDigit && rightDigit) {
        let leftEnd = leftIndex;
        let rightEnd = rightIndex;
        while (leftEnd < left.length && /\d/.test(left[leftEnd])) leftEnd += 1;
        while (rightEnd < right.length && /\d/.test(right[rightEnd])) rightEnd += 1;
        const leftRun = left.slice(leftIndex, leftEnd);
        const rightRun = right.slice(rightIndex, rightEnd);
        const leftSignificant = leftRun.replace(/^0+/, '') || '0';
        const rightSignificant = rightRun.replace(/^0+/, '') || '0';
        const difference = leftSignificant.length - rightSignificant.length ||
          ordinal(leftSignificant, rightSignificant) || ordinal(leftRun, rightRun);
        if (difference !== 0) return difference;
        leftIndex = leftEnd;
        rightIndex = rightEnd;
        continue;
      }
      const difference = left.charCodeAt(leftIndex) - right.charCodeAt(rightIndex);
      if (difference !== 0) return difference;
      leftIndex += 1;
      rightIndex += 1;
    }
    return left.length - right.length;
  };
  const kindRank = (item) => item.kind === 'folder' ? 0 :
    item.kind === 'comicFolder' ? 1 :
    item.archiveKind === 'zip' ? 2 : item.archiveKind === 'cbz' ? 3 : 4;
  const compareOptional = (left, right) => {
    if (left == null) return right == null ? 0 : 1;
    if (right == null) return -1;
    return $descendingJson ? right - left : left - right;
  };
  const expected = [...actual].sort((left, right) => {
    let primary = 0;
    if ($fieldJson === 'name') primary = natural(left.name, right.name);
    else if ($fieldJson === 'modified') primary = compareOptional(left.modifiedMs, right.modifiedMs);
    else if ($fieldJson === 'size') primary = compareOptional(left.byteSize, right.byteSize);
    else primary = kindRank(left) - kindRank(right);
    if ($fieldJson !== 'modified' && $fieldJson !== 'size' && $descendingJson) primary = -primary;
    return primary || natural(left.name, right.name) || ordinal(left.path, right.path);
  });
  const actualPaths = actual.map((item) => item.path);
  const expectedPaths = expected.map((item) => item.path);
  const matches = JSON.stringify(actualPaths) === JSON.stringify(expectedPaths);
  const descending = finalDirection.dataset.sortDescending === 'true';
  return {
    ok: actual.length === 127 && new Set(actualPaths).size === 127 &&
      selectionFocused && matches && select.value === $fieldJson &&
      descending === $descendingJson,
    count: actual.length,
    unique: new Set(actualPaths).size,
    selectionFocused,
    matches,
    firstMismatch: actualPaths.findIndex((path, index) => path !== expectedPaths[index]),
    field: select.value,
    descending,
    expectedField: $fieldJson,
    expectedDescending: $descendingJson,
    fieldMatches: select.value === $fieldJson,
    directionMatches: descending === $descendingJson,
    actualHead: actual.slice(0, 5),
    expectedHead: expected.slice(0, 5),
  };
})()
"@
    if (-not $result.ok) {
        throw "Catalog sort oracle failed: $($result | ConvertTo-Json -Compress)"
    }
}

function Start-Product([string]$DataRoot = $appData) {
    $script:testStage = "product start"
    $attemptErrors = [Collections.Generic.List[string]]::new()
    foreach ($attempt in 1..2) {
        $script:port = Get-FreeTcpPort
        $env:LOCALAPPDATA = $DataRoot
        $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$port"
        $process = Start-Process -FilePath $executable -PassThru
        $script:activeProduct = $process
        try {
            $timeout = if ($attempt -eq 1) { 10 } else { 20 }
            Connect-Cdp -TimeoutSeconds $timeout
            return $process
        } catch {
            $attemptErrors.Add("attempt=$attempt port=$port error=$($_.Exception.Message)")
            try { Stop-Product $process -Force } catch {
                $attemptErrors.Add("attempt=$attempt cleanup=$($_.Exception.Message)")
            }
            if ($attempt -eq 2) {
                throw "Product start failed after 2 bounded attempts: $($attemptErrors -join '; ')"
            }
        }
    }
}

if (-not ("ComicExplorerWindowInterop" -as [type])) {
    Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class ComicExplorerWindowInterop
{
    [StructLayout(LayoutKind.Sequential)]
    public struct Rect
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MonitorInfo
    {
        public int Size;
        public Rect Monitor;
        public Rect Work;
        public uint Flags;
    }

    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr hWnd, out Rect rect);

    [DllImport("user32.dll")]
    private static extern IntPtr MonitorFromWindow(IntPtr hWnd, uint flags);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern bool GetMonitorInfo(
        IntPtr monitor,
        ref MonitorInfo info
    );

    public static Rect WindowRect(IntPtr hWnd)
    {
        Rect rect;
        if (!GetWindowRect(hWnd, out rect))
            throw new InvalidOperationException("GetWindowRect failed.");
        return rect;
    }

    public static Rect MonitorRect(IntPtr hWnd)
    {
        var monitor = MonitorFromWindow(hWnd, 2);
        if (monitor == IntPtr.Zero)
            throw new InvalidOperationException("MonitorFromWindow failed.");
        var info = new MonitorInfo { Size = Marshal.SizeOf(typeof(MonitorInfo)) };
        if (!GetMonitorInfo(monitor, ref info))
            throw new InvalidOperationException("GetMonitorInfo failed.");
        return info.Monitor;
    }
}
"@
}

function Get-ProductWindowBounds($Process) {
    $Process.Refresh()
    if ($Process.MainWindowHandle -eq [IntPtr]::Zero) {
        throw "Product main window handle is not available."
    }
    $window = [ComicExplorerWindowInterop]::WindowRect($Process.MainWindowHandle)
    $monitor = [ComicExplorerWindowInterop]::MonitorRect($Process.MainWindowHandle)
    [pscustomobject]@{
        left = $window.Left
        top = $window.Top
        right = $window.Right
        bottom = $window.Bottom
        monitorLeft = $monitor.Left
        monitorTop = $monitor.Top
        monitorRight = $monitor.Right
        monitorBottom = $monitor.Bottom
    }
}

function Test-SameBounds($Left, $Right, [int]$Tolerance = 2) {
    return (
        [Math]::Abs($Left.left - $Right.left) -le $Tolerance -and
        [Math]::Abs($Left.top - $Right.top) -le $Tolerance -and
        [Math]::Abs($Left.right - $Right.right) -le $Tolerance -and
        [Math]::Abs($Left.bottom - $Right.bottom) -le $Tolerance
    )
}

function Test-MonitorFullscreenBounds($Bounds, [int]$Tolerance = 2) {
    return (
        [Math]::Abs($Bounds.left - $Bounds.monitorLeft) -le $Tolerance -and
        [Math]::Abs($Bounds.top - $Bounds.monitorTop) -le $Tolerance -and
        [Math]::Abs($Bounds.right - $Bounds.monitorRight) -le $Tolerance -and
        [Math]::Abs($Bounds.bottom - $Bounds.monitorBottom) -le $Tolerance
    )
}

function Wait-ProductWindowBounds(
    $Process,
    [scriptblock]$Predicate,
    [string]$Description
) {
    $deadline = [DateTime]::UtcNow.AddSeconds(10)
    do {
        $bounds = Get-ProductWindowBounds $Process
        if (& $Predicate $bounds) { return $bounds }
        Start-Sleep -Milliseconds 100
    } while ([DateTime]::UtcNow -lt $deadline)
    $last = Get-ProductWindowBounds $Process
    throw ("Timed out waiting for " + $Description + ": " +
        ($last | ConvertTo-Json -Compress))
}

function Get-DescendantProcessIds([int]$RootId) {
    $all = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
    $pending = [Collections.Generic.Queue[int]]::new()
    $result = [Collections.Generic.List[int]]::new()
    $pending.Enqueue($RootId)
    while ($pending.Count -gt 0) {
        $parentId = $pending.Dequeue()
        foreach ($child in $all | Where-Object { $_.ParentProcessId -eq $parentId }) {
            if (!$result.Contains([int]$child.ProcessId)) {
                $result.Add([int]$child.ProcessId)
                $pending.Enqueue([int]$child.ProcessId)
            }
        }
    }
    return @($result)
}

function Stop-HarnessDescendants([int[]]$ProcessIds) {
    $deadline = [DateTime]::UtcNow.AddSeconds(2)
    do {
        $remaining = @($ProcessIds | Where-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue })
        if ($remaining.Count -eq 0) { return }
        foreach ($processId in $remaining) {
            Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
        }
        Start-Sleep -Milliseconds 100
    } while ([DateTime]::UtcNow -lt $deadline)
    # WebView2 helpers can retain the harness console handle and disappear only
    # after this PowerShell process exits. The parent runner audits them from a
    # separate process after the harness has returned.
}

function Wait-ProcessIdReleased([int]$ProcessId, [int]$TimeoutSeconds = 5) {
    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    do {
        if (!(Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)) { return }
        Start-Sleep -Milliseconds 100
    } while ([DateTime]::UtcNow -lt $deadline)
    throw "Product process $ProcessId did not exit within $TimeoutSeconds seconds."
}

function Wait-CdpPortReleased([int]$Port) {
    $deadline = [DateTime]::UtcNow.AddSeconds(5)
    do {
        $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        if (!$listener) { return }
        Start-Sleep -Milliseconds 100
    } while ([DateTime]::UtcNow -lt $deadline)
    throw "WebView2 CDP port $Port remained in LISTEN state after cleanup."
}

function Stop-Product($Process, [switch]$Force) {
    $descendants = @(Get-DescendantProcessIds $Process.Id)
    $processPort = $port
    if ($script:socket) {
        $script:socket.Dispose()
        $script:socket = $null
    }
    $Process.Refresh()
    if ($Process.HasExited) {
        if ($script:activeProduct -and $script:activeProduct.Id -eq $Process.Id) {
            $script:activeProduct = $null
        }
        Stop-HarnessDescendants $descendants
        Wait-CdpPortReleased $processPort
        return
    }
    if ($Force) {
        Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
        Wait-ProcessIdReleased $Process.Id
        if ($script:activeProduct -and $script:activeProduct.Id -eq $Process.Id) {
            $script:activeProduct = $null
        }
        Stop-HarnessDescendants $descendants
        Wait-CdpPortReleased $processPort
        return
    }
    if (-not $Process.CloseMainWindow()) {
        throw "Product main window could not be closed normally."
    }
    try {
        Wait-ProcessIdReleased $Process.Id 10
    } catch {
        Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
        throw "Product did not exit within 10 seconds after a normal window close."
    }
    $Process.WaitForExit(0) | Out-Null
    if ($Process.ExitCode -ne 0) {
        throw "Product normal exit returned code $($Process.ExitCode)."
    }
    if ($script:activeProduct -and $script:activeProduct.Id -eq $Process.Id) {
        $script:activeProduct = $null
    }
    Stop-HarnessDescendants $descendants
    Wait-CdpPortReleased $processPort
}

function Remove-HarnessEvidence {
    if (!(Test-Path -LiteralPath $evidenceRoot)) { return }
    $deadline = [DateTime]::UtcNow.AddSeconds(5)
    do {
        Remove-Item $evidenceRoot -Recurse -Force -ErrorAction SilentlyContinue
        if (!(Test-Path -LiteralPath $evidenceRoot)) { return }
        Start-Sleep -Milliseconds 100
    } while ([DateTime]::UtcNow -lt $deadline)
    throw "Harness evidence could not be removed within 5 seconds; a SQLite/file lock remains: $evidenceRoot"
}

Remove-HarnessEvidence
New-Item $library -ItemType Directory -Force | Out-Null
Copy-Item (
    Join-Path $projectRoot "tests\fixtures\generated\FIX-ZIP-001\standard.cbz"
) (Join-Path $library "1-valid.cbz")
Copy-Item (
    Join-Path $projectRoot "tests\fixtures\generated\FIX-ZIP-ERROR-001\corrupt.zip"
) (Join-Path $library "2-corrupt.zip")
New-Item (Join-Path $library "folder-a\child\deep") -ItemType Directory -Force |
    Out-Null
New-Item (Join-Path $library "folder-a\acl-denied") -ItemType Directory -Force |
    Out-Null
New-Item (Join-Path $library "folder-a\still-readable") -ItemType Directory -Force |
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
New-Item (Join-Path $library "a-error-comic") -ItemType Directory -Force |
    Out-Null
Copy-Item (
    Join-Path $projectRoot "tests\fixtures\generated\FIX-IMAGE-001\portrait.png"
) (Join-Path $library "a-error-comic\1.png")
Copy-Item (
    Join-Path $projectRoot "tests\fixtures\generated\FIX-IMAGE-ERROR-001\corrupt.png"
) (Join-Path $library "a-error-comic\2-corrupt.png")
Copy-Item (
    Join-Path $projectRoot "tests\fixtures\generated\FIX-IMAGE-001\square.png"
) (Join-Path $library "a-error-comic\3.png")
New-Item (Join-Path $library "z-next-comic") -ItemType Directory -Force |
    Out-Null
Copy-Item (
    Join-Path $projectRoot "tests\fixtures\generated\FIX-IMAGE-001\portrait.png"
) (Join-Path $library "z-next-comic\1.png")
Copy-Item (
    Join-Path $projectRoot "tests\fixtures\generated\FIX-IMAGE-001\square.png"
) (Join-Path $library "z-next-comic\2.png")
Copy-Item (
    Join-Path $projectRoot "tests\fixtures\generated\FIX-IMAGE-001\wide.png"
) (Join-Path $library "z-next-comic\3.png")
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
    (Join-Path $library "comic-folder\3.png"),
    (Join-Path $library "a-error-comic\1.png"),
    (Join-Path $library "a-error-comic\2-corrupt.png"),
    (Join-Path $library "a-error-comic\3.png"),
    (Join-Path $library "z-next-comic\1.png"),
    (Join-Path $library "z-next-comic\2.png"),
    (Join-Path $library "z-next-comic\3.png")
)
$before = $sourceFiles | ForEach-Object { (Get-FileHash $_ -Algorithm SHA256).Hash }
$beforeTree = Get-ChildItem $library -File -Recurse | Sort-Object FullName |
    ForEach-Object {
        "$($_.FullName.Substring($library.Length)):$((Get-FileHash $_.FullName -Algorithm SHA256).Hash)"
    }

$cold = $null
$warm = $null
$viewerRestart = $null
$rootRecovery = $null
$appDataRecovery = $null
$keyboardProduct = $null
$deniedPath = Join-Path $library "folder-a\acl-denied"
$deniedRule = $null
try {
    $cold = Start-Product
    Wait-Evaluate "document.querySelector('#library-root') !== null" "setup UI"
    $libraryJson = $library | ConvertTo-Json -Compress
    $missingLibraryJson = $missingLibrary | ConvertTo-Json -Compress
    Invoke-Evaluate @"
(() => {
  const input = document.querySelector('#library-root');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(input, $missingLibraryJson);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  document.querySelector('button[type=submit]').click();
  return true;
})()
"@ | Out-Null
    Wait-Evaluate (
        "document.querySelector('[role=alert]') !== null && " +
        "document.querySelector('#library-root').value.endsWith('\\library-missing') && " +
        "document.querySelector('button[type=submit]') !== null && " +
        "document.querySelector('.picker-button') !== null"
    ) "invalid root rejection and reselection actions"
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
        "document.querySelector('.status-bar span')?.textContent.startsWith('127') && " +
        "document.querySelector('#address').value.endsWith('\\library') && " +
        "[...document.querySelectorAll('[role=treeitem]')].some((node) => " +
        "node.textContent === 'library' && node.getAttribute('aria-selected') === 'true')"
    ) "all catalog entries"
    Wait-Evaluate (
        "document.querySelectorAll('.thumbnail[data-cache-hit=false] img').length === 3 && " +
        "document.querySelectorAll('.thumbnail[data-thumbnail-state=error]').length === 1"
    ) "cold thumbnail success and error"
    Wait-Evaluate (
        "[...document.querySelectorAll('.thumbnail[data-cache-hit=false] img')]" +
        ".every((image) => image.complete && image.naturalWidth > 0)"
    ) "cold thumbnail image decode"
    if ($MemoOnly) {
        Invoke-Evaluate (
            "(() => { const item = [...document.querySelectorAll('.catalog-item')]" +
            ".find((node) => node.dataset.relativePath === 'comic-folder'); " +
            "if (!item) return false; item.click(); " +
            "item.closest('.catalog-cell')?.querySelector('.read-action')?.click(); return true; })()"
        ) | Out-Null
        Wait-Evaluate (
            "document.querySelector('.viewer') !== null && " +
            "document.querySelector('[data-product-id=item-metadata-panel]')?.dataset.memoSaveState === 'idle' && " +
            "document.querySelector('[data-product-id=item-memo-input]') !== null"
        ) "memo viewer setup"
        Invoke-Evaluate @"
(() => {
  const input = document.querySelector('[data-product-id=item-memo-input]');
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
  setter.call(input, 'memo-one');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()
"@ | Out-Null
        Wait-Evaluate (
            "document.querySelector('[data-product-id=item-memo-input]')?.value === 'memo-one' && " +
            "document.querySelector('[data-product-id=item-metadata-panel]')?.dataset.memoSaveState === 'idle'"
        ) "memo first edit"
        Invoke-Evaluate "document.querySelector('[data-product-id=item-memo-save]')?.click(); true" |
            Out-Null
        Wait-Evaluate (
            "document.querySelector('[data-product-id=item-metadata-panel]')?.dataset.memoSaveState === 'saved' && " +
            "document.querySelector('[data-product-id=item-memo-input]')?.value === 'memo-one' && " +
            "document.querySelector('[data-product-id=item-memo-save]')?.disabled === false && " +
            "document.querySelector('[data-product-id=item-memo-clear]')?.disabled === false"
        ) "memo first save"
        Invoke-Evaluate "document.querySelector('[data-product-id=viewer-close]')?.click(); true" | Out-Null
        Wait-Evaluate "document.querySelector('.viewer') === null" "memo first viewer close"
        Invoke-Evaluate (
            "(() => { const item = [...document.querySelectorAll('.catalog-item')]" +
            ".find((node) => node.dataset.relativePath === 'comic-folder'); " +
            "if (!item) return false; item.click(); " +
            "item.closest('.catalog-cell')?.querySelector('.read-action')?.click(); return true; })()"
        ) | Out-Null
        Wait-Evaluate (
            "document.querySelector('[data-product-id=item-memo-input]')?.value === 'memo-one' && " +
            "document.querySelector('[data-product-id=item-metadata-panel]')?.dataset.memoSaveState === 'idle'"
        ) "memo reopen persistence"
        Invoke-Evaluate @"
(() => {
  const input = document.querySelector('[data-product-id=item-memo-input]');
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
  setter.call(input, 'memo-two');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()
"@ | Out-Null
        Wait-Evaluate (
            "document.querySelector('[data-product-id=item-memo-input]')?.value === 'memo-two' && " +
            "document.querySelector('[data-product-id=item-metadata-panel]')?.dataset.memoSaveState === 'idle'"
        ) "memo second edit"
        Invoke-Evaluate "document.querySelector('[data-product-id=item-memo-save]')?.click(); true" |
            Out-Null
        Wait-Evaluate (
            "document.querySelector('[data-product-id=item-metadata-panel]')?.dataset.memoSaveState === 'saved' && " +
            "document.querySelector('[data-product-id=item-memo-input]')?.value === 'memo-two' && " +
            "document.querySelector('[data-product-id=item-memo-save]')?.disabled === false && " +
            "document.querySelector('[data-product-id=item-memo-clear]')?.disabled === false"
        ) "memo second save"
        Stop-Product $cold
        $cold = Start-Product
        Wait-Evaluate (
            "document.querySelector('.status-bar span')?.textContent.startsWith('127')"
        ) "memo restart catalog"
        Invoke-Evaluate (
            "(() => { const item = [...document.querySelectorAll('.catalog-item')]" +
            ".find((node) => node.dataset.relativePath === 'comic-folder'); " +
            "if (!item) return false; item.click(); " +
            "item.closest('.catalog-cell')?.querySelector('.read-action')?.click(); return true; })()"
        ) | Out-Null
        Wait-Evaluate (
            "document.querySelector('[data-product-id=item-memo-input]')?.value === 'memo-two' && " +
            "document.querySelector('[data-product-id=item-metadata-panel]')?.dataset.memoSaveState === 'idle'"
        ) "memo restart persistence"
        Invoke-Evaluate "document.querySelector('[data-product-id=item-memo-clear]')?.click(); true" |
            Out-Null
        Wait-Evaluate (
            "document.querySelector('[data-product-id=item-metadata-panel]')?.dataset.memoSaveState === 'saved' && " +
            "document.querySelector('[data-product-id=item-memo-input]')?.value === '' && " +
            "document.querySelector('[data-product-id=item-memo-save]')?.disabled === false && " +
            "document.querySelector('[data-product-id=item-memo-clear]')?.disabled === false"
        ) "memo clear"
        Invoke-Evaluate "document.querySelector('[data-product-id=viewer-close]')?.click(); true" | Out-Null
        Wait-Evaluate "document.querySelector('.viewer') === null" "memo clear viewer close"
        Invoke-Evaluate (
            "(() => { const item = [...document.querySelectorAll('.catalog-item')]" +
            ".find((node) => node.dataset.relativePath === 'comic-folder'); " +
            "if (!item) return false; item.click(); " +
            "item.closest('.catalog-cell')?.querySelector('.read-action')?.click(); return true; })()"
        ) | Out-Null
        Wait-Evaluate (
            "document.querySelector('[data-product-id=item-memo-input]')?.value === '' && " +
            "document.querySelector('[data-product-id=item-metadata-panel]')?.dataset.memoSaveState === 'idle'"
        ) "memo clear reopen persistence"
        $after = $sourceFiles | ForEach-Object { (Get-FileHash $_ -Algorithm SHA256).Hash }
        if (Compare-Object $before $after) {
            throw "Memo product harness changed source archives."
        }
        $afterTree = Get-ChildItem $library -File -Recurse | Sort-Object FullName |
            ForEach-Object {
                "$($_.FullName.Substring($library.Length)):$((Get-FileHash $_.FullName -Algorithm SHA256).Hash)"
            }
        if (Compare-Object $beforeTree $afterTree) {
            throw "Memo product harness changed the source tree or created adjacent files."
        }
        Stop-Product $cold
        $cold = $null
        @{
            status = "ok"
            test = "FT-B07-006"
            saved = $true
            reopened = $true
            restartPersisted = $true
            cleared = $true
            sourceDifferenceCount = 0
        } | ConvertTo-Json -Compress
        return
    }
    if ($TagsOnly) {
        Invoke-Evaluate (
            "(() => { const item = [...document.querySelectorAll('.catalog-item')]" +
            ".find((node) => node.dataset.relativePath === 'comic-folder'); " +
            "if (!item) return false; item.click(); return true; })()"
        ) | Out-Null
        Wait-Evaluate (
            "document.querySelector('.catalog-item[data-selected=true]')?.dataset.relativePath === " +
            "'comic-folder'"
        ) "tag item selection"
        Invoke-Evaluate (
            "document.querySelector('[aria-controls=library-menu]')?.click(); true"
        ) | Out-Null
        Wait-Evaluate "document.querySelector('#library-menu') !== null" "tag library menu"
        Invoke-Evaluate (
            "(() => { const action = document.querySelector(" +
            "'[data-product-id=tag-manager-menu-item]'); if (!action) return false; " +
            "action.click(); return true; })()"
        ) | Out-Null
        Wait-Evaluate (
            "document.querySelector('.tag-manager-dialog') !== null && " +
            "document.querySelector('.tag-manager-dialog > p')?.textContent.endsWith('comic-folder')"
        ) "tag manager setup"
        Invoke-Evaluate @"
(() => {
  const input = document.querySelector('#tag-name');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(input, '\uFF26\uFF21\uFF36\uFF2F\uFF32\uFF29\uFF34\uFF25');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.closest('form').querySelector('button[type=submit]').click();
  return true;
})()
"@ | Out-Null
        Wait-Evaluate (
            "document.querySelector('[data-item-tag-id]')?.textContent.includes('favorite') && " +
            "document.querySelector('[data-tag-id]')?.textContent.includes('favorite')"
        ) "tag assignment"
        Invoke-Evaluate @"
(() => {
  const input = document.querySelector('#tag-name');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(input, 'other');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.closest('form').querySelector('button[type=submit]').click();
  return true;
})()
"@ | Out-Null
        Wait-Evaluate (
            "document.querySelectorAll('[data-item-tag-id]').length === 2 && " +
            "document.querySelectorAll('[data-tag-id]').length === 2 && " +
            "[...document.querySelectorAll('[data-tag-id]')].some((node) => " +
            "node.textContent.includes('favorite')) && " +
            "[...document.querySelectorAll('[data-tag-id]')].some((node) => " +
            "node.textContent.includes('other'))"
        ) "nonmatching tag seed"
        Invoke-Evaluate @"
(() => {
  const input = document.querySelector('#tag-query');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(input, '\uFF26\uFF21\uFF36');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()
"@ | Out-Null
        Wait-Evaluate (
            "document.querySelector('#tag-query').value === '\uFF26\uFF21\uFF36' && " +
            "document.querySelectorAll('[data-tag-id]').length === 1 && " +
            "document.querySelector('[data-tag-id]')?.textContent.includes('favorite') && " +
            "!document.querySelector('[data-tag-id]')?.textContent.includes('other')"
        ) "normalized tag query"
        Invoke-Evaluate @"
(() => {
  const input = document.querySelector('#tag-query');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(input, '');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()
"@ | Out-Null
        Wait-Evaluate (
            "document.querySelector('#tag-query').value === '' && " +
            "document.querySelectorAll('[data-tag-id]').length === 2 && " +
            "[...document.querySelectorAll('[data-tag-id]')].some((node) => " +
            "node.textContent.includes('favorite')) && " +
            "[...document.querySelectorAll('[data-tag-id]')].some((node) => " +
            "node.textContent.includes('other'))"
        ) "tag rename setup"
        Invoke-Evaluate @"
(() => {
  const row = [...document.querySelectorAll('[data-tag-id]')]
    .find((node) => node.querySelector('span')?.textContent === 'favorite');
  if (!row) return false;
  const input = row.querySelector('input');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(input, 'reading');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  row.querySelector('button').click();
  return true;
})()
"@ | Out-Null
        Wait-Evaluate (
            "[...document.querySelectorAll('[data-item-tag-id]')].some((node) => " +
            "node.textContent.includes('reading')) && " +
            "[...document.querySelectorAll('[data-item-tag-id]')].some((node) => " +
            "node.textContent.includes('other')) && " +
            "[...document.querySelectorAll('[data-tag-id]')].some((node) => " +
            "node.textContent.includes('reading'))"
        ) "tag rename"
        Stop-Product $cold
        $cold = Start-Product
        Wait-Evaluate (
            "document.querySelector('.status-bar span')?.textContent.startsWith('127')"
        ) "tag restart catalog"
        Invoke-Evaluate (
            "(() => { const item = [...document.querySelectorAll('.catalog-item')]" +
            ".find((node) => node.dataset.relativePath === 'comic-folder'); " +
            "if (!item) return false; item.click(); return true; })()"
        ) | Out-Null
        Wait-Evaluate (
            "document.querySelector('.catalog-item[data-selected=true]')?.dataset.relativePath === " +
            "'comic-folder'"
        ) "tag restart item selection"
        Invoke-Evaluate (
            "document.querySelector('[aria-controls=library-menu]')?.click(); true"
        ) | Out-Null
        Wait-Evaluate "document.querySelector('#library-menu') !== null" "tag restart library menu"
        Invoke-Evaluate (
            "(() => { const action = document.querySelector(" +
            "'[data-product-id=tag-manager-menu-item]'); if (!action) return false; " +
            "action.click(); return true; })()"
        ) | Out-Null
        Wait-Evaluate (
            "[...document.querySelectorAll('[data-item-tag-id]')].some((node) => " +
            "node.textContent.includes('reading')) && " +
            "[...document.querySelectorAll('[data-item-tag-id]')].some((node) => " +
            "node.textContent.includes('other')) && " +
            "[...document.querySelectorAll('[data-tag-id]')].some((node) => " +
            "node.textContent.includes('reading'))"
        ) "tag restart persistence"
        Invoke-Evaluate @"
(() => {
  const row = [...document.querySelectorAll('[data-item-tag-id]')]
    .find((node) => node.textContent.includes('reading'));
  if (!row) return false;
  row.querySelector('button').click();
  return true;
})()
"@ | Out-Null
        Wait-Evaluate (
            "![...document.querySelectorAll('[data-item-tag-id]')].some((node) => " +
            "node.textContent.includes('reading')) && " +
            "[...document.querySelectorAll('[data-item-tag-id]')].some((node) => " +
            "node.textContent.includes('other')) && " +
            "[...document.querySelectorAll('[data-tag-id]')].some((node) => " +
            "node.querySelector('span')?.textContent === 'reading' && " +
            "node.querySelectorAll('span')[1]?.textContent.startsWith('0'))"
        ) "tag removal"
        $after = $sourceFiles | ForEach-Object { (Get-FileHash $_ -Algorithm SHA256).Hash }
        if (Compare-Object $before $after) {
            throw "Tag product harness changed source archives."
        }
        $afterTree = Get-ChildItem $library -File -Recurse | Sort-Object FullName |
            ForEach-Object {
                "$($_.FullName.Substring($library.Length)):$((Get-FileHash $_.FullName -Algorithm SHA256).Hash)"
            }
        if (Compare-Object $beforeTree $afterTree) {
            throw "Tag product harness changed the source tree or created adjacent files."
        }
        Stop-Product $cold
        $cold = $null
        @{
            status = "ok"
            test = "FT-B10-005"
            assigned = $true
            queried = $true
            renamed = $true
            restartPersisted = $true
            removed = $true
            sourceDifferenceCount = 0
        } | ConvertTo-Json -Compress
        return
    }
    if ($ShortcutOnly) {
        Invoke-Evaluate (
            "document.querySelector('[data-product-id=help-menu-trigger]').click(); true"
        ) | Out-Null
        Wait-Evaluate "document.querySelector('#help-menu') !== null" "shortcut help menu"
        Invoke-Evaluate (
            "document.querySelector('[data-product-id=shortcut-help-menu-item]').click(); true"
        ) | Out-Null
        Wait-Evaluate (
            "document.querySelector('[data-product-id=shortcut-dialog]') !== null && " +
            "document.querySelector('#shortcut-nextPage').value === 'PageDown'"
        ) "shortcut dialog defaults"
        Invoke-Evaluate (
            "document.querySelector('#shortcut-nextPage').dispatchEvent(" +
            "new KeyboardEvent('keydown', {key:'N', bubbles:true})); true"
        ) | Out-Null
        Wait-Evaluate (
            "document.querySelector('#shortcut-nextPage').value === 'N' && " +
            "document.querySelector('[data-shortcut-save-status=saved]') !== null"
        ) "shortcut remap backend save completion"
        Invoke-Evaluate (
            "document.querySelector('#shortcut-previousPage').dispatchEvent(" +
            "new KeyboardEvent('keydown', {key:'N', bubbles:true})); true"
        ) | Out-Null
        Wait-Evaluate (
            "document.querySelector('[role=alert]')?.textContent.includes(" +
            "'\u6b21\u30da\u30fc\u30b8') && " +
            "document.querySelector('#shortcut-previousPage').value === 'PageUp'"
        ) "shortcut conflict rejection"
        Invoke-Evaluate (
            "document.querySelector('[data-product-id=shortcut-dialog-close]').click(); true"
        ) | Out-Null
        Wait-Evaluate "document.querySelector('[data-product-id=shortcut-dialog]') === null" "shortcut dialog close"
        Invoke-Evaluate (
            "(() => { const item = [...document.querySelectorAll('.catalog-item')]" +
            ".find((node) => node.dataset.relativePath === 'comic-folder'); item.click(); " +
            "item.closest('.catalog-cell').querySelector('.read-action').click(); return true; })()"
        ) | Out-Null
        Wait-Evaluate "document.querySelector('.viewer') !== null" "custom shortcut viewer setup"
        $customStart = Get-ViewerPagePosition
        $customExpected = [Math]::Min($customStart.count, $customStart.page + 1)
        if ($customExpected -eq $customStart.page) {
            throw "Custom shortcut relative navigation started on the final page."
        }
        Invoke-Evaluate (
            "window.dispatchEvent(new KeyboardEvent('keydown', {key:'N', bubbles:true})); true"
        ) | Out-Null
        Wait-ViewerPage $customExpected "custom shortcut viewer relative navigation"
        $customAfter = Get-ViewerPagePosition
        Invoke-Evaluate (
            "window.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true})); true"
        ) | Out-Null
        Wait-Evaluate "document.querySelector('.viewer') === null" "custom shortcut viewer close"
        Stop-Product $cold
        $port = Get-FreeTcpPort
        $cold = Start-Product
        Wait-Evaluate (
            "document.querySelector('.status-bar span')?.textContent.startsWith('127')"
        ) "shortcut restart catalog"
        Invoke-Evaluate (
            "document.querySelector('[data-product-id=help-menu-trigger]').click(); true"
        ) | Out-Null
        Wait-Evaluate "document.querySelector('#help-menu') !== null" "restart shortcut help menu"
        Invoke-Evaluate (
            "document.querySelector('[data-product-id=shortcut-help-menu-item]').click(); true"
        ) | Out-Null
        Wait-Evaluate (
            "document.querySelector('#shortcut-nextPage').value === 'N'"
        ) "shortcut restart restoration"
        Invoke-Evaluate (
            "[...document.querySelectorAll('[data-product-id=shortcut-dialog] button')]" +
            ".find((node) => node.textContent === '\u3059\u3079\u3066\u65e2\u5b9a\u306b\u623b\u3059').click(); true"
        ) | Out-Null
        Wait-Evaluate (
            "document.querySelector('#shortcut-nextPage').value === 'PageDown' && " +
            "document.querySelector('[data-shortcut-save-status=saved]') !== null"
        ) "shortcut reset backend save completion"
        Invoke-Evaluate (
            "document.querySelector('[data-product-id=shortcut-dialog-close]').click(); true"
        ) | Out-Null
        Wait-Evaluate "document.querySelector('[data-product-id=shortcut-dialog]') === null" "reset dialog close"
        Invoke-Evaluate (
            "(() => { const item = [...document.querySelectorAll('.catalog-item')]" +
            ".find((node) => node.dataset.relativePath === 'comic-folder'); item.click(); " +
            "item.closest('.catalog-cell').querySelector('.read-action').click(); return true; })()"
        ) | Out-Null
        Wait-Evaluate "document.querySelector('.viewer') !== null" "reset shortcut viewer setup"
        $resetStart = Get-ViewerPagePosition
        if ($resetStart.page -ne $customAfter.page) {
            throw "Reading position was not restored relatively: expected $($customAfter.page), got $($resetStart.page)."
        }
        if ($resetStart.page -lt $resetStart.count) {
            $resetKey = "PageDown"
            $resetExpected = $resetStart.page + 1
        } else {
            $resetKey = "PageUp"
            $resetExpected = $resetStart.page - 1
        }
        Invoke-Evaluate (
            "window.dispatchEvent(new KeyboardEvent('keydown', {key:'$resetKey', bubbles:true})); true"
        ) | Out-Null
        Wait-ViewerPage $resetExpected "reset default shortcut relative navigation"
        $after = $sourceFiles | ForEach-Object { (Get-FileHash $_ -Algorithm SHA256).Hash }
        if (Compare-Object $before $after) {
            throw "Shortcut product harness changed source archives."
        }
        $afterTree = Get-ChildItem $library -File -Recurse | Sort-Object FullName |
            ForEach-Object {
                "$($_.FullName.Substring($library.Length)):$((Get-FileHash $_.FullName -Algorithm SHA256).Hash)"
            }
        if (Compare-Object $beforeTree $afterTree) {
            throw "Shortcut product harness changed the source tree or created adjacent files."
        }
        Stop-Product $cold
        $cold = $null
        @{
            status = "ok"
            test = "FT-B11-006"
            remap = $true
            conflictRejected = $true
            viewerCommand = $true
            restartRestored = $true
            resetRestoredDefault = $true
            sourceDifferenceCount = 0
        } | ConvertTo-Json -Compress
        return
    }
    if ($FullscreenOnly) {
        Invoke-Evaluate (
            "(() => { const item = [...document.querySelectorAll('.catalog-item')]" +
            ".find((node) => node.title.startsWith('comic-folder ')); item.click(); " +
            "item.closest('.catalog-cell').querySelector('.read-action').click(); return true; })()"
        ) | Out-Null
        Wait-Evaluate "document.querySelector('.viewer') !== null" "fullscreen viewer setup"
        $normalFullscreenBounds = Get-ProductWindowBounds $cold
        $progressBeforeFullscreen = Invoke-Evaluate (
            "document.querySelector('.viewer-toolbar span:last-of-type').textContent"
        )
        Invoke-Evaluate (
            "[...document.querySelectorAll('.viewer-toolbar button[aria-pressed]')].at(-1).click(); true"
        ) | Out-Null
        Wait-Evaluate (
            "document.querySelector('.viewer')?.dataset.fullscreen === 'true' && " +
            "document.querySelector('.viewer-toolbar button[aria-pressed=true]') !== null"
        ) "native fullscreen DOM state"
        $fullscreenBounds = Wait-ProductWindowBounds $cold {
            param($bounds) Test-MonitorFullscreenBounds $bounds
        } "native fullscreen window bounds"
        Invoke-Evaluate (
            "window.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true})); true"
        ) | Out-Null
        $progressJson = $progressBeforeFullscreen | ConvertTo-Json -Compress
        Wait-Evaluate (
            "document.querySelector('.viewer')?.dataset.fullscreen === 'false' && " +
            "document.querySelector('.viewer-toolbar span:last-of-type').textContent === " +
            $progressJson
        ) "fullscreen Escape viewer preservation"
        $restoredFullscreenBounds = Wait-ProductWindowBounds $cold {
            param($bounds) Test-SameBounds $bounds $normalFullscreenBounds
        } "fullscreen window bounds restoration"
        Invoke-Evaluate (
            "window.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true})); true"
        ) | Out-Null
        Wait-Evaluate "document.querySelector('.viewer') === null" "normal Escape viewer close"
        $after = $sourceFiles | ForEach-Object { (Get-FileHash $_ -Algorithm SHA256).Hash }
        if (Compare-Object $before $after) {
            throw "Fullscreen product harness changed source archives."
        }
        $afterTree = Get-ChildItem $library -File -Recurse | Sort-Object FullName |
            ForEach-Object {
                "$($_.FullName.Substring($library.Length)):$((Get-FileHash $_.FullName -Algorithm SHA256).Hash)"
            }
        if (Compare-Object $beforeTree $afterTree) {
            throw "Fullscreen product harness changed the source tree or created adjacent files."
        }
        Stop-Product $cold
        $cold = $null
        @{
            status = "ok"
            test = "FT-B04-006"
            fullscreenNativeWindow = $true
            fullscreenEscPreservedViewer = $true
            fullscreenBoundsRestored = $true
            sourceDifferenceCount = 0
        } | ConvertTo-Json -Compress
        return
    }
    Invoke-Evaluate (
        "(() => { const item = [...document.querySelectorAll('.catalog-item')]" +
        ".find((node) => node.title.startsWith('comic-folder ')); item.click(); item.focus(); " +
        "return true; })()"
    ) | Out-Null
    Wait-Evaluate (
        "document.querySelector('.catalog-item[data-selected=true]')?.dataset.relativePath === " +
        "'comic-folder' && document.activeElement?.dataset.relativePath === 'comic-folder'"
    ) "sort selection baseline"
    foreach ($field in @("name", "modified", "size", "kind")) {
        Assert-CatalogSort -Field $field -Direction "ascending"
        Assert-CatalogSort -Field $field -Direction "descending"
    }
    Invoke-Evaluate (
        "(async () => { const scroll = document.querySelector('.catalog-scroll'); " +
        "scroll.scrollTop = 0; scroll.dispatchEvent(new Event('scroll')); " +
        "await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 20))); " +
        "return true; })()"
    ) | Out-Null
    Wait-Evaluate (
        "[...document.querySelectorAll('.catalog-item')].some((node) => " +
        "node.title.startsWith('0-very-long-comic-folder-name-'))"
    ) "catalog return after sort oracle"
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
        "(() => { const item = [...document.querySelectorAll('.catalog-item')]" +
        ".find((node) => node.title.startsWith('scroll-folder-120 ')); item.focus(); " +
        "item.dispatchEvent(new KeyboardEvent('keydown', {key:'Home', bubbles:true})); " +
        "return true; })()"
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
        "[...document.querySelectorAll('.catalog-item')].some((node) => " +
        "node.title.startsWith('child '))"
    ) "folder child catalog"
    Wait-Evaluate (
        "[...document.querySelectorAll('[role=treeitem]')].some((node) => " +
        "node.textContent === 'folder-a' && node.getAttribute('aria-selected') === 'true')"
    ) "tree/address/list synchronization"
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $deniedRule = [Security.AccessControl.FileSystemAccessRule]::new(
        $identity.User,
        [Security.AccessControl.FileSystemRights]"ListDirectory,ReadData",
        [Security.AccessControl.InheritanceFlags]::None,
        [Security.AccessControl.PropagationFlags]::None,
        [Security.AccessControl.AccessControlType]::Deny
    )
    $deniedAcl = Get-Acl $deniedPath
    $deniedAcl.AddAccessRule($deniedRule) | Out-Null
    Set-Acl $deniedPath $deniedAcl
    Invoke-Evaluate @"
(() => {
  const item = [...document.querySelectorAll('.catalog-item')]
    .find((node) => node.title.startsWith('acl-denied '));
  item.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  return true;
})()
"@ | Out-Null
    Wait-Evaluate (
        "document.querySelector('.error-panel[role=alert]')?.textContent.includes('acl-denied') && " +
        "document.querySelector('.error-panel').textContent.includes(" +
        "'\u30a2\u30af\u30bb\u30b9\u3067\u304d\u307e\u305b\u3093') && " +
        "!/os error|Cannot read|stack/i.test(document.querySelector('.error-panel').textContent) && " +
        "document.querySelector('.error-panel button:nth-of-type(1)') !== null && " +
        "document.querySelector('.error-panel button:nth-of-type(2)') !== null"
    ) "local ACL error"
    Invoke-Evaluate "document.querySelector('.error-panel button:nth-of-type(3)').click(); true" |
        Out-Null
    Wait-Evaluate (
        "document.querySelector('.error-panel') === null && " +
        "document.querySelector('#address').value.endsWith('\\folder-a') && " +
        "[...document.querySelectorAll('.catalog-item')].some((node) => " +
        "node.title.startsWith('still-readable ')) && " +
        "[...document.querySelectorAll('.catalog-item')].some((node) => " +
        "node.dataset.relativePath === 'folder-a/child')"
    ) "other folders remain usable after local ACL error"
    $deniedAcl = Get-Acl $deniedPath
    $deniedAcl.RemoveAccessRuleSpecific($deniedRule)
    Set-Acl $deniedPath $deniedAcl
    $deniedRule = $null
    Invoke-Evaluate @"
(() => {
  const item = document.querySelector('.catalog-item[data-relative-path="folder-a/child"]');
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
  await new Promise((resolve) => setTimeout(resolve, 100));
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
  await new Promise((resolve) => setTimeout(resolve, 100));
  input.form.requestSubmit();
  return true;
})()
"@ | Out-Null
    Wait-Evaluate "document.querySelector('[role=alert]') !== null" "root escape rejection"
    Stop-Product $cold
    $cold = $null

    $warm = Start-Product
    Wait-Evaluate (
        "document.querySelector('.status-bar span')?.textContent.startsWith('127')"
    ) "restored catalog"
    Wait-Evaluate (
        "document.querySelector('.toolbar select').value === 'kind' && " +
        "document.querySelectorAll('.thumbnail[data-cache-hit=true] img').length === 4 && " +
        "document.querySelectorAll('.thumbnail[data-thumbnail-state=error]').length === 1"
    ) "restored kind sort, cache hit and negative placeholder"
    Wait-Evaluate (
        "[...document.querySelectorAll('.catalog-item')].some((node) => " +
        "node.title.startsWith('z-next-comic '))"
    ) "next comic mounted by restored kind sort"
    Wait-Evaluate (
        "document.querySelectorAll('.thumbnail[data-cache-hit=true] img').length === 4 && " +
        "document.querySelector('.catalog-item[title^=""z-next-comic ""] " +
        ".thumbnail[data-cache-hit=true] img') !== null"
    ) "next comic thumbnail cache hit"
    Invoke-Evaluate (
        "new Promise((resolve) => setTimeout(() => resolve(true), 500))"
    ) | Out-Null
    Invoke-Evaluate (
        "(() => { const item = [...document.querySelectorAll('.catalog-item')]" +
        ".find((node) => node.title.startsWith('z-next-comic ')); item.click(); " +
        "item.closest('[role=gridcell]').querySelector('.read-action').click(); return true; })()"
    ) | Out-Null
    Wait-Evaluate (
        "document.querySelector('.viewer-toolbar strong')?.textContent === 'z-next-comic' && " +
        "document.querySelector('.viewer-toolbar span:last-of-type').textContent.startsWith('1 / 3')"
    ) "next comic initial page"
    Invoke-Evaluate (
        "window.dispatchEvent(new KeyboardEvent('keydown', {key:'PageDown', bubbles:true})); true"
    ) | Out-Null
    Wait-Evaluate (
        "document.querySelector('.viewer-toolbar span:last-of-type').textContent.startsWith('2 / 3')"
    ) "next comic saved page"
    Invoke-Evaluate (
        "window.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true})); true"
    ) | Out-Null
    Wait-Evaluate "document.querySelector('.viewer') === null" "next comic setup close"
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
    Invoke-Evaluate "[...document.querySelectorAll('.viewer-toolbar button')][3].click(); true" |
        Out-Null
    Wait-Evaluate (
        "document.querySelectorAll('.page-spread img:not(.prefetch-page)').length === 1"
    ) "landscape page alone in spread mode"
    Invoke-Evaluate (
        "window.dispatchEvent(new KeyboardEvent('keydown', {key:' ', bubbles:true})); true"
    ) | Out-Null
    Wait-Evaluate (
        "document.querySelector('.viewer-toolbar strong')?.textContent === 'comic-folder' && " +
        "document.querySelector('.viewer-toolbar span:last-of-type').textContent.startsWith('3 / 3')"
    ) "current comic final page before transition"
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
    Invoke-Evaluate "[...document.querySelectorAll('.viewer-toolbar button')][4].click(); true" |
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
        "window.dispatchEvent(new KeyboardEvent('keydown', {key:' ', bubbles:true})); true"
    ) | Out-Null
    Wait-Evaluate (
        "document.querySelector('.viewer-toolbar strong')?.textContent === 'z-next-comic' && " +
        "document.querySelector('.viewer-toolbar span:last-of-type').textContent.startsWith('2-3 / 3')"
    ) "next comic restores saved page"
    Invoke-Evaluate (
        "window.dispatchEvent(new KeyboardEvent('keydown', {key:'1', bubbles:true})); true"
    ) | Out-Null
    Wait-Evaluate (
        "document.querySelector('.viewer-toolbar span:last-of-type').textContent.startsWith('2 / 3')"
    ) "next comic single-page leading page"
    Invoke-Evaluate (
        "window.dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowRight', bubbles:true})); true"
    ) | Out-Null
    Wait-Evaluate (
        "document.querySelector('.viewer-toolbar span:last-of-type').textContent.startsWith('3 / 3')"
    ) "next comic final page"
    Invoke-Evaluate (
        "window.dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowRight', bubbles:true})); true"
    ) | Out-Null
    Wait-Evaluate (
        "document.querySelector('.viewer-toolbar strong')?.textContent === 'z-next-comic' && " +
        "document.querySelector('.viewer-toolbar span:last-of-type').textContent.startsWith('3 / 3')"
    ) "final comic edge stays"
    Invoke-Evaluate (
        "window.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true})); true"
    ) | Out-Null
    Wait-Evaluate (
        "document.querySelector('.viewer') === null && " +
        "[...document.querySelectorAll('.status-bar span')].some((node) => " +
        "node.textContent.includes('comic-folder')) && " +
        "document.activeElement?.title?.startsWith('comic-folder ')"
    ) "viewer context restoration"
    Invoke-Evaluate (
        "(() => { const item = [...document.querySelectorAll('.catalog-item')]" +
        ".find((node) => node.title.startsWith('comic-folder ')); item.click(); " +
        "item.closest('.catalog-cell').querySelector('.read-action').click(); return true; })()"
    ) | Out-Null
    Wait-Evaluate "document.querySelector('.viewer') !== null" "fullscreen viewer setup"
    $normalFullscreenBounds = Get-ProductWindowBounds $warm
    $progressBeforeFullscreen = Invoke-Evaluate (
        "document.querySelector('.viewer-toolbar span:last-of-type').textContent"
    )
    Invoke-Evaluate (
        "[...document.querySelectorAll('.viewer-toolbar button[aria-pressed]')].at(-1).click(); true"
    ) | Out-Null
    Wait-Evaluate (
        "document.querySelector('.viewer')?.dataset.fullscreen === 'true' && " +
        "document.querySelector('.viewer-toolbar button[aria-pressed=true]') !== null"
    ) "native fullscreen DOM state"
    $fullscreenBounds = Wait-ProductWindowBounds $warm {
        param($bounds) Test-MonitorFullscreenBounds $bounds
    } "native fullscreen window bounds"
    Invoke-Evaluate (
        "window.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true})); true"
    ) | Out-Null
    $progressJson = $progressBeforeFullscreen | ConvertTo-Json -Compress
    Wait-Evaluate (
        "document.querySelector('.viewer')?.dataset.fullscreen === 'false' && " +
        "document.querySelector('.viewer-toolbar span:last-of-type').textContent === " +
        $progressJson
    ) "fullscreen Escape viewer preservation"
    $restoredFullscreenBounds = Wait-ProductWindowBounds $warm {
        param($bounds) Test-SameBounds $bounds $normalFullscreenBounds
    } "fullscreen window bounds restoration"
    Invoke-Evaluate (
        "window.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true})); true"
    ) | Out-Null
    Wait-Evaluate "document.querySelector('.viewer') === null" "normal Escape viewer close"
    Stop-Product $warm
    $warm = $null

    $viewerRestart = Start-Product
    Wait-Evaluate (
        "document.querySelector('.status-bar span')?.textContent.startsWith('127')"
    ) "viewer-settings restart catalog"
    Wait-Evaluate (
        "document.querySelectorAll('.thumbnail[data-cache-hit=true] img').length === 4 && " +
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
        "document.querySelector('.status-bar span')?.textContent.startsWith('127')"
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
        ".find((node) => node.title.startsWith('a-error-comic ')); item.click(); " +
        "item.closest('.catalog-cell').querySelector('.read-action').click(); return true; })()"
    ) | Out-Null
    Wait-Evaluate (
        "document.querySelector('.viewer-toolbar strong')?.textContent === 'a-error-comic' && " +
        "document.querySelector('.viewer-toolbar span:last-of-type').textContent.startsWith('1 / 3') && " +
        "document.querySelector('.page-spread img:not(.prefetch-page)')?.naturalWidth > 0"
    ) "corrupt-page comic first page"
    Invoke-Evaluate (
        "window.dispatchEvent(new KeyboardEvent('keydown', {key:'PageDown', bubbles:true})); true"
    ) | Out-Null
    Wait-Evaluate (
        "document.querySelector('.page-error[role=alert]')?.textContent.includes('2-corrupt.png') && " +
        "document.querySelectorAll('.page-error button').length === 3"
    ) "targeted corrupt page error"
    Invoke-Evaluate "document.querySelector('.page-error button:nth-of-type(1)').click(); true" |
        Out-Null
    Wait-Evaluate (
        "document.querySelector('.page-error') === null && " +
        "document.querySelector('.viewer-toolbar span:last-of-type').textContent.startsWith('1 / 3')"
    ) "corrupt page previous recovery"
    Invoke-Evaluate (
        "window.dispatchEvent(new KeyboardEvent('keydown', {key:'PageDown', bubbles:true})); true"
    ) | Out-Null
    Wait-Evaluate "document.querySelector('.page-error') !== null" "corrupt page revisit"
    Invoke-Evaluate "document.querySelector('.page-error button:nth-of-type(2)').click(); true" |
        Out-Null
    Wait-Evaluate (
        "document.querySelector('.page-error') === null && " +
        "document.querySelector('.viewer-toolbar span:last-of-type').textContent.startsWith('3 / 3') && " +
        "document.querySelector('.page-spread img:not(.prefetch-page)')?.naturalWidth > 0"
    ) "corrupt page next recovery"
    Invoke-Evaluate (
        "window.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true})); true"
    ) | Out-Null
    Wait-Evaluate "document.querySelector('.viewer') === null" "corrupt-page viewer close"
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
        "document.querySelector('[role=alert]').textContent.includes(" +
        "'\u30c7\u30fc\u30bf\u304c\u7834\u640d\u3057\u3066\u3044\u307e\u3059') && " +
        "!/stack|os error/i.test(document.querySelector('[role=alert]').textContent) && " +
        "document.querySelector('[role=alert] button:nth-of-type(2)') !== null"
    ) "corrupt archive error and recovery actions"
    Invoke-Evaluate "document.querySelector('[role=alert] button:nth-of-type(2)').click(); true" |
        Out-Null
    Wait-Evaluate (
        "document.querySelector('[role=alert]') === null && " +
        "document.querySelector('.status-bar span')?.textContent.startsWith('127')"
    ) "corrupt archive list recovery"
    Stop-Product $viewerRestart
    $viewerRestart = $null
    Move-Item $library $missingLibrary
    $rootRecovery = Start-Product
    Wait-Evaluate (
        "document.querySelector('.error-panel[role=alert]')?.textContent.includes(" +
        "'library') && document.querySelector('.error-panel button:nth-of-type(1)') !== null && " +
        "document.querySelector('.error-panel button:nth-of-type(2)') !== null"
    ) "stored root disappearance and recovery actions"
    Move-Item $missingLibrary $library
    Invoke-Evaluate "document.querySelector('.error-panel button:nth-of-type(1)').click(); true" |
        Out-Null
    Wait-Evaluate (
        "document.querySelector('.error-panel') === null && " +
        "document.querySelector('.status-bar span')?.textContent.startsWith('127') && " +
        "document.querySelector('#address').value.endsWith('\\library')"
    ) "stored root retry recovery"
    Stop-Product $rootRecovery
    $rootRecovery = $null
    $recoveryStateRoot = Join-Path $recoveryAppData "ComicExplorer"
    New-Item $recoveryStateRoot -ItemType Directory -Force | Out-Null
    [IO.File]::WriteAllBytes(
        (Join-Path $recoveryStateRoot "state.sqlite3"),
        [Text.Encoding]::UTF8.GetBytes("not a sqlite database")
    )
    $appDataRecovery = Start-Product -DataRoot $recoveryAppData
    Wait-Evaluate (
        "document.querySelector('[role=status]')?.textContent.includes(" +
        "'\u30a2\u30d7\u30ea\u30c7\u30fc\u30bf\u3092\u518d\u521d\u671f\u5316\u3057\u307e\u3057\u305f') && " +
        "document.querySelector('[role=status]').textContent.includes(" +
        "'\u6f2b\u753b\u30d5\u30a1\u30a4\u30eb\u306f\u5909\u66f4\u3057\u3066\u3044\u307e\u305b\u3093') && " +
        "!/sqlite|recovery|stack/i.test(document.querySelector('[role=status]').textContent)"
    ) "app-data recovery notice"
    if (-not (Get-ChildItem (Join-Path $recoveryStateRoot "recovery") -File |
        Where-Object { $_.Name -like "state-*.sqlite3" })) {
        throw "Corrupt app database was not isolated in recovery."
    }
    Stop-Product $appDataRecovery
    $appDataRecovery = $null
    $keyboardProduct = Start-Product -DataRoot $keyboardAppData
    Wait-Evaluate "document.querySelector('#library-root') !== null" "keyboard setup UI"
    Invoke-Evaluate "document.querySelector('#library-root').focus(); true" | Out-Null
    Invoke-Cdp "Input.insertText" @{ text = $library } | Out-Null
    Wait-Evaluate (
        "document.querySelector('#library-root').value.endsWith('\\library')"
    ) "keyboard root text input"
    Invoke-OsKeys $keyboardProduct "{TAB}"
    Wait-Evaluate (
        "document.activeElement === document.querySelector('button[type=submit]')"
    ) "keyboard submit focus"
    Invoke-OsKeys $keyboardProduct "{ENTER}"
    Wait-Evaluate (
        "document.querySelector('.status-bar span')?.textContent.startsWith('127') && " +
        "document.querySelector('#address').value.endsWith('\\library')"
    ) "keyboard root registration"
    $keyboardLibraryRoot = Invoke-Evaluate "document.querySelector('#address').value"
    Invoke-Evaluate "document.querySelector('#address').focus(); true" | Out-Null
    Invoke-OsKeys $keyboardProduct "^a"
    Invoke-Cdp "Input.insertText" @{
        text = "$keyboardLibraryRoot\folder-a"
    } | Out-Null
    Invoke-OsKeys $keyboardProduct "{TAB}"
    Invoke-OsKeys $keyboardProduct "{ENTER}"
    Wait-Evaluate (
        "document.querySelector('#address').value.endsWith('\\folder-a') && " +
        "[...document.querySelectorAll('.catalog-item')].some((node) => " +
        "node.dataset.relativePath === 'folder-a/child')"
    ) "keyboard address navigation"
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $deniedRule = [Security.AccessControl.FileSystemAccessRule]::new(
        $identity.User,
        [Security.AccessControl.FileSystemRights]"ListDirectory,ReadData",
        [Security.AccessControl.InheritanceFlags]::None,
        [Security.AccessControl.PropagationFlags]::None,
        [Security.AccessControl.AccessControlType]::Deny
    )
    $deniedAcl = Get-Acl $deniedPath
    $deniedAcl.AddAccessRule($deniedRule) | Out-Null
    Set-Acl $deniedPath $deniedAcl
    Invoke-Evaluate "document.querySelector('#address').focus(); true" | Out-Null
    Invoke-OsKeys $keyboardProduct "^a"
    Invoke-Cdp "Input.insertText" @{
        text = "$keyboardLibraryRoot\folder-a\acl-denied"
    } | Out-Null
    Invoke-OsKeys $keyboardProduct "{TAB}"
    Invoke-OsKeys $keyboardProduct "{ENTER}"
    Wait-Evaluate (
        "document.querySelector('.error-panel[role=alert]') !== null && " +
        "document.querySelector('.error-panel button:nth-of-type(3)') !== null"
    ) "keyboard error route"
    Invoke-Evaluate (
        "document.querySelector('.error-panel button:nth-of-type(3)').focus(); true"
    ) | Out-Null
    Invoke-OsKeys $keyboardProduct "{ENTER}"
    Wait-Evaluate (
        "document.querySelector('.error-panel') === null && " +
        "document.querySelector('#address').value.endsWith('\\folder-a')"
    ) "keyboard error recovery"
    $deniedAcl = Get-Acl $deniedPath
    $deniedAcl.RemoveAccessRuleSpecific($deniedRule)
    Set-Acl $deniedPath $deniedAcl
    $deniedRule = $null
    Invoke-Evaluate "document.querySelector('.menu-bar button:nth-of-type(3)').focus(); true" |
        Out-Null
    Invoke-OsKeys $keyboardProduct "{ENTER}"
    Wait-Evaluate "document.querySelector('[role=dialog]') !== null" "keyboard help open"
    Invoke-OsKeys $keyboardProduct "{ESC}"
    Wait-Evaluate (
        "document.querySelector('[role=dialog]') === null && " +
        "document.activeElement === document.querySelector('.menu-bar button:nth-of-type(3)')"
    ) "keyboard help focus restore"
    Invoke-Evaluate "document.querySelector('#address').focus(); true" | Out-Null
    Invoke-OsKeys $keyboardProduct "^a"
    Invoke-Cdp "Input.insertText" @{ text = $keyboardLibraryRoot } | Out-Null
    Invoke-OsKeys $keyboardProduct "{TAB}"
    Invoke-OsKeys $keyboardProduct "{ENTER}"
    Wait-Evaluate (
        "document.querySelector('#address').value.endsWith('\\library') && " +
        "[...document.querySelectorAll('.catalog-item')].some((node) => " +
        "node.dataset.relativePath === 'comic-folder')"
    ) "keyboard return to catalog"
    if (-not (Invoke-Evaluate (
        "(() => { const item = [...document.querySelectorAll('.catalog-item')]" +
        ".find((node) => node.dataset.relativePath === 'comic-folder'); item.focus(); " +
        "return item.matches(':focus-visible'); })()"
    ))) { throw "Keyboard-focused catalog item did not expose :focus-visible." }
    Invoke-OsKeys $keyboardProduct "^~"
    Wait-Evaluate "document.querySelector('.viewer') !== null" "keyboard viewer open"
    Invoke-OsKeys $keyboardProduct "{PGDN}"
    Wait-Evaluate (
        "document.querySelector('.viewer-toolbar')?.textContent.includes('2 / 3')"
    ) "keyboard viewer page movement"
    Invoke-OsKeys $keyboardProduct "{ESC}"
    Wait-Evaluate (
        "document.querySelector('.viewer') === null && " +
        "document.activeElement?.dataset.relativePath === 'comic-folder'"
    ) "keyboard viewer close focus restore"
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
        invalidRootRejected = $true
        disappearedRootRecovered = $true
        localAclErrorRecovered = $true
        normalExitRestart = $true
        appDataRecoveryNotice = $true
        keyboardOnlyRoute = $true
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
        fullscreenNativeWindow = $true
        fullscreenEscPreservedViewer = $true
        fullscreenBoundsRestored = $true
        sourceDifferenceCount = 0
    } | ConvertTo-Json -Compress
} finally {
    $cleanupErrors = [Collections.Generic.List[string]]::new()
    if ($deniedRule -and (Test-Path $deniedPath)) {
        $deniedAcl = Get-Acl $deniedPath
        $deniedAcl.RemoveAccessRuleSpecific($deniedRule)
        Set-Acl $deniedPath $deniedAcl
    }
    foreach ($product in @($cold, $warm, $viewerRestart, $rootRecovery, $appDataRecovery, $keyboardProduct)) {
        if ($product) {
            try { Stop-Product $product -Force } catch { $cleanupErrors.Add($_.Exception.Message) }
        }
    }
    if ((Test-Path $missingLibrary) -and -not (Test-Path $library)) {
        Move-Item $missingLibrary $library
    }
    try { Remove-HarnessEvidence } catch { $cleanupErrors.Add($_.Exception.Message) }
    if ($cleanupErrors.Count -gt 0) {
        throw "Product harness cleanup failed: $($cleanupErrors -join '; ')"
    }
}
