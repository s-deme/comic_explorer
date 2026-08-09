Set-StrictMode -Version Latest

function Get-ReleaseInputFiles {
    param([Parameter(Mandatory = $true)][string]$ProjectRoot)

    $files = [Collections.Generic.List[IO.FileInfo]]::new()
    foreach ($relativeRoot in @("src", "src-tauri\src", "src-tauri\capabilities", "src-tauri\icons")) {
        $root = Join-Path $ProjectRoot $relativeRoot
        if (Test-Path -LiteralPath $root -PathType Container) {
            foreach ($file in Get-ChildItem -LiteralPath $root -File -Recurse) {
                if ($relativeRoot -eq "src" -and $file.Name -match "\.test\.(ts|tsx)$") {
                    continue
                }
                $files.Add($file)
            }
        }
    }
    foreach ($relativePath in @(
        "index.html", "package.json", "package-lock.json", "tsconfig.json", "tsconfig.app.json",
        "tsconfig.node.json", "vite.config.ts", "src-tauri\Cargo.toml", "src-tauri\Cargo.lock",
        "src-tauri\build.rs", "src-tauri\tauri.conf.json", "scripts\generate-sbom.py",
        "scripts\windows-toolchain.ps1", "scripts\release-freshness.ps1",
        "scripts\invoke-windows-toolchain.ps1", "scripts\build-release-exe.cmd"
    )) {
        $path = Join-Path $ProjectRoot $relativePath
        if (Test-Path -LiteralPath $path -PathType Leaf) {
            $files.Add((Get-Item -LiteralPath $path))
        }
    }
    return @($files | Sort-Object FullName -Unique)
}

function Get-ReleaseInputFingerprint {
    param([Parameter(Mandatory = $true)][string]$ProjectRoot)

    $rootPath = (Resolve-Path $ProjectRoot).Path.TrimEnd("\")
    $lines = [Collections.Generic.List[string]]::new()
    foreach ($file in Get-ReleaseInputFiles -ProjectRoot $rootPath) {
        $relative = $file.FullName.Substring($rootPath.Length + 1).Replace("\", "/")
        $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        $lines.Add("$relative`t$hash")
    }
    $payload = [Text.Encoding]::UTF8.GetBytes(($lines -join "`n") + "`n")
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
        $fingerprint = ([BitConverter]::ToString($sha.ComputeHash($payload))).Replace("-", "").ToLowerInvariant()
    } finally {
        $sha.Dispose()
    }
    return [pscustomobject]@{ Hash = $fingerprint; FileCount = $lines.Count; Entries = @($lines) }
}

function Get-ReleaseManifestPath {
    param([Parameter(Mandatory = $true)][string]$ProjectRoot)
    return Join-Path $ProjectRoot "src-tauri\target\release\comic-explorer.inputs.json"
}

function Get-ReleaseExecutablePath {
    param([Parameter(Mandatory = $true)][string]$ProjectRoot)
    return Join-Path $ProjectRoot "src-tauri\target\release\comic-explorer.exe"
}

function Test-ReleaseFreshness {
    param([Parameter(Mandatory = $true)][string]$ProjectRoot)

    $executable = Get-ReleaseExecutablePath -ProjectRoot $ProjectRoot
    $manifestPath = Get-ReleaseManifestPath -ProjectRoot $ProjectRoot
    $fingerprint = Get-ReleaseInputFingerprint -ProjectRoot $ProjectRoot
    if (!(Test-Path -LiteralPath $executable -PathType Leaf)) {
        return [pscustomobject]@{ Fresh = $false; Reason = "release executable is missing"; InputHash = $fingerprint.Hash; ManifestPath = $manifestPath; Executable = $executable }
    }
    if (!(Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
        return [pscustomobject]@{ Fresh = $false; Reason = "release input manifest is missing"; InputHash = $fingerprint.Hash; ManifestPath = $manifestPath; Executable = $executable }
    }
    try { $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json } catch {
        return [pscustomobject]@{ Fresh = $false; Reason = "release input manifest is unreadable: $($_.Exception.Message)"; InputHash = $fingerprint.Hash; ManifestPath = $manifestPath; Executable = $executable }
    }
    if ($manifest.inputHash -ne $fingerprint.Hash) {
        return [pscustomobject]@{ Fresh = $false; Reason = "release inputs changed"; InputHash = $fingerprint.Hash; ManifestPath = $manifestPath; Executable = $executable }
    }
    $executableHash = (Get-FileHash -LiteralPath $executable -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($manifest.executableHash -ne $executableHash) {
        return [pscustomobject]@{ Fresh = $false; Reason = "release executable hash does not match its manifest"; InputHash = $fingerprint.Hash; ManifestPath = $manifestPath; Executable = $executable }
    }
    return [pscustomobject]@{ Fresh = $true; Reason = "release executable matches input manifest"; InputHash = $fingerprint.Hash; ManifestPath = $manifestPath; Executable = $executable }
}

function Write-ReleaseFreshnessManifest {
    param([Parameter(Mandatory = $true)][string]$ProjectRoot)

    $executable = Get-ReleaseExecutablePath -ProjectRoot $ProjectRoot
    if (!(Test-Path -LiteralPath $executable -PathType Leaf)) {
        throw "Cannot bind release inputs because the executable is missing: $executable"
    }
    $fingerprint = Get-ReleaseInputFingerprint -ProjectRoot $ProjectRoot
    $manifestPath = Get-ReleaseManifestPath -ProjectRoot $ProjectRoot
    $manifest = [pscustomobject][ordered]@{
        schemaVersion = 1
        generatedAt = [DateTimeOffset]::UtcNow.ToString("o")
        algorithm = "SHA-256"
        inputHash = $fingerprint.Hash
        inputFileCount = $fingerprint.FileCount
        executableHash = (Get-FileHash -LiteralPath $executable -Algorithm SHA256).Hash.ToLowerInvariant()
        executable = "src-tauri/target/release/comic-explorer.exe"
    }
    $encoding = [Text.UTF8Encoding]::new($false)
    [IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json -Depth 4) + "`n", $encoding)
    return $manifest
}
