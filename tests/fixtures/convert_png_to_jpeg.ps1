param(
    [Parameter(Mandatory = $true)]
    [string] $Source,
    [Parameter(Mandatory = $true)]
    [string] $Target
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
$image = [Drawing.Image]::FromFile($Source)
$codec = [Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
    Where-Object { $_.MimeType -eq "image/jpeg" }
$parameters = [Drawing.Imaging.EncoderParameters]::new(1)
$parameters.Param[0] = [Drawing.Imaging.EncoderParameter]::new(
    [Drawing.Imaging.Encoder]::Quality,
    [long] 90
)
try {
    $image.Save($Target, $codec, $parameters)
} finally {
    $parameters.Dispose()
    $image.Dispose()
}
