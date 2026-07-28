param(
    [Parameter(Mandatory = $true)]
    [string] $OutputDirectory,
    [switch] $Force
)

$ErrorActionPreference = "Stop"
$root = [IO.Path]::GetFullPath($OutputDirectory)
if ([IO.Directory]::Exists($root)) {
    if (-not $Force) { throw "$root already exists; pass -Force to replace it" }
    [IO.Directory]::Delete($root, $true)
}
[IO.Directory]::CreateDirectory($root) | Out-Null

foreach ($count in @(1000, 10000)) {
    $directory = [IO.Path]::Combine($root, "items-$count")
    [IO.Directory]::CreateDirectory($directory) | Out-Null
    for ($index = 0; $index -lt $count; $index++) {
        $extension = if ($index % 4 -eq 0) { ".cbz" } else { "" }
        [IO.File]::WriteAllBytes(
            [IO.Path]::Combine($directory, "作品_$($index.ToString('00000'))$extension"),
            [byte[]]::new(0)
        )
    }
}

Add-Type -AssemblyName System.Drawing
$images = [IO.Path]::Combine($root, "images-300")
[IO.Directory]::CreateDirectory($images) | Out-Null
$jpegCodec = [Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
    Where-Object { $_.MimeType -eq "image/jpeg" }
$quality = [Drawing.Imaging.EncoderParameters]::new(1)
$quality.Param[0] = [Drawing.Imaging.EncoderParameter]::new(
    [Drawing.Imaging.Encoder]::Quality, [long]85
)

for ($index = 0; $index -lt 300; $index++) {
    $bitmap = [Drawing.Bitmap]::new(1200, 1800)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    try {
        $background = [Drawing.Color]::FromArgb(
            255, ($index * 17) % 256, ($index * 37) % 256, ($index * 67) % 256
        )
        $graphics.Clear($background)
        $graphics.DrawString(
            "Generated page $($index + 1)",
            [Drawing.Font]::new("Segoe UI", 48),
            [Drawing.Brushes]::White,
            80,
            80
        )
        if ($index % 2 -eq 0) {
            $bitmap.Save(
                [IO.Path]::Combine($images, "page_$($index + 1).jpg"),
                $jpegCodec,
                $quality
            )
        } else {
            $bitmap.Save(
                [IO.Path]::Combine($images, "page_$($index + 1).png"),
                [Drawing.Imaging.ImageFormat]::Png
            )
        }
    } finally {
        $graphics.Dispose()
        $bitmap.Dispose()
    }
}
$quality.Dispose()

function New-SpecialImage([string] $Name, [int] $Width, [int] $Height) {
    $bitmap = [Drawing.Bitmap]::new($Width, $Height)
    try {
        $bitmap.SetPixel(0, 0, [Drawing.Color]::Magenta)
        $bitmap.Save([IO.Path]::Combine($images, $Name), [Drawing.Imaging.ImageFormat]::Png)
    } finally {
        $bitmap.Dispose()
    }
}
New-SpecialImage "wide.png" 3600 1800
New-SpecialImage "high-resolution.png" 8000 12000
[IO.File]::WriteAllBytes(
    [IO.Path]::Combine($images, "corrupt.jpg"),
    [Text.Encoding]::ASCII.GetBytes("not-a-jpeg")
)

Add-Type -AssemblyName System.IO.Compression.FileSystem
foreach ($archiveName in @("pages.zip", "pages.cbz")) {
    $archivePath = [IO.Path]::Combine($root, $archiveName)
    $archive = [IO.Compression.ZipFile]::Open(
        $archivePath, [IO.Compression.ZipArchiveMode]::Create
    )
    try {
        Get-ChildItem $images -File |
            Where-Object { $_.Name -like "page_*" } |
            ForEach-Object {
                [IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                    $archive, $_.FullName, "日本語/章1/$($_.Name)",
                    [IO.Compression.CompressionLevel]::Optimal
                ) | Out-Null
            }
    } finally {
        $archive.Dispose()
    }
}
$valid = [IO.File]::ReadAllBytes([IO.Path]::Combine($root, "pages.cbz"))
[IO.File]::WriteAllBytes(
    [IO.Path]::Combine($root, "corrupt.cbz"),
    $valid[0..([Math]::Max(31, [int]($valid.Length / 3)))]
)
[IO.Directory]::CreateDirectory([IO.Path]::Combine($root, "cache-empty")) | Out-Null
[IO.Directory]::CreateDirectory([IO.Path]::Combine($root, "cache-warm")) | Out-Null

@{
    schemaVersion = 1
    generator = "Generate-Dataset.ps1"
    items = @(1000, 10000)
    pages = 300
    inputFormats = @("JPEG", "PNG")
    specialCases = @("wide", "high-resolution", "corrupt-image", "corrupt-zip")
} | ConvertTo-Json -Depth 4 | Set-Content `
    -LiteralPath ([IO.Path]::Combine($root, "manifest.json")) -Encoding utf8

Write-Output $root

