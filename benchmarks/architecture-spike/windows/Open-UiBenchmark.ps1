$ErrorActionPreference = "Stop"
$html = [IO.Path]::GetFullPath(
    [IO.Path]::Combine($PSScriptRoot, "..", "ui-benchmark.html")
)
if (-not [IO.File]::Exists($html)) { throw "UI benchmark not found: $html" }
$edge = [IO.Path]::Combine(
    ${env:ProgramFiles(x86)}, "Microsoft", "Edge", "Application", "msedge.exe"
)
if (-not [IO.File]::Exists($edge)) {
    $edge = [IO.Path]::Combine(
        $env:ProgramFiles, "Microsoft", "Edge", "Application", "msedge.exe"
    )
}
if (-not [IO.File]::Exists($edge)) { throw "Microsoft Edge not found" }
$uri = [uri]::new($html).AbsoluteUri
Start-Process -FilePath $edge -ArgumentList "--app=$uri", "--start-maximized"

