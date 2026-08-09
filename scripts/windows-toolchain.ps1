Set-StrictMode -Version Latest
$utf8NoBom = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = $utf8NoBom
$global:OutputEncoding = $utf8NoBom
$pathExtensions = [Collections.Generic.List[string]]::new()
foreach ($extension in @(".COM", ".EXE", ".BAT", ".CMD") + @($env:PATHEXT -split ";")) {
    if ([string]::IsNullOrWhiteSpace($extension)) { continue }
    if (!$pathExtensions.Contains($extension.ToUpperInvariant())) {
        $pathExtensions.Add($extension.ToUpperInvariant())
    }
}
$env:PATHEXT = $pathExtensions -join ";"

function ConvertTo-NativeArgument {
    param([AllowEmptyString()][string]$Value)
    if ($Value.Length -eq 0) { return '""' }
    if ($Value -notmatch '[\s"]') { return $Value }
    $escaped = $Value -replace '(\\*)"', '$1$1\"'
    $escaped = $escaped -replace '(\\+)$', '$1$1'
    return '"' + $escaped + '"'
}

function Invoke-TrackedNative {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [string[]]$Arguments = @(),
        [string]$RawArguments = "",
        [string]$WorkingDirectory = (Get-Location).Path,
        [int]$TimeoutSeconds = 7200
    )
    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $FilePath
    $startInfo.Arguments = if ([string]::IsNullOrEmpty($RawArguments)) {
        (($Arguments | ForEach-Object { ConvertTo-NativeArgument $_ }) -join " ")
    } else {
        $RawArguments
    }
    $startInfo.WorkingDirectory = $WorkingDirectory
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    if (!$process.Start()) { throw "Failed to start native process: $FilePath" }
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    if (!$process.WaitForExit($TimeoutSeconds * 1000)) {
        $taskkillInfo = [Diagnostics.ProcessStartInfo]::new()
        $taskkillInfo.FileName = "taskkill.exe"
        $taskkillInfo.Arguments = "/PID $($process.Id) /T /F"
        $taskkillInfo.UseShellExecute = $false
        $taskkillInfo.CreateNoWindow = $true
        $taskkill = [Diagnostics.Process]::Start($taskkillInfo)
        $taskkill.WaitForExit(5000) | Out-Null
        throw "Native process timed out after $TimeoutSeconds seconds: $FilePath $($startInfo.Arguments)"
    }
    $process.WaitForExit()
    return [pscustomobject]@{
        ExitCode = $process.ExitCode
        ProcessId = $process.Id
        StandardOutput = $stdoutTask.GetAwaiter().GetResult()
        StandardError = $stderrTask.GetAwaiter().GetResult()
    }
}

function Resolve-ExecutablePath {
    param(
        [Parameter(Mandatory = $true)][string]$ToolName,
        [string[]]$CommandNames = @(),
        [string[]]$CandidatePaths = @()
    )

    $searched = [Collections.Generic.List[string]]::new()
    foreach ($commandName in $CommandNames) {
        $searched.Add("PATH:$commandName")
        $command = Get-Command $commandName -CommandType Application -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if ($command -and (Test-Path -LiteralPath $command.Source -PathType Leaf)) {
            return [pscustomobject]@{ Path = $command.Source; Searched = @($searched) }
        }
    }
    foreach ($candidate in $CandidatePaths) {
        if ([string]::IsNullOrWhiteSpace($candidate)) { continue }
        $searched.Add($candidate)
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            return [pscustomobject]@{ Path = (Resolve-Path $candidate).Path; Searched = @($searched) }
        }
    }
    throw "$ToolName was not found. Searched: $($searched -join '; ')"
}

function Resolve-ProjectWindowsPython {
    param([Parameter(Mandatory = $true)][string]$ProjectRoot)
    return (Resolve-ExecutablePath -ToolName "Windows Python virtual environment" `
        -CandidatePaths @(
            (Join-Path $ProjectRoot ".venv-windows\Scripts\python.exe"),
            $(if ($env:VIRTUAL_ENV) { Join-Path $env:VIRTUAL_ENV "Scripts\python.exe" })
        )).Path
}

function Resolve-WindowsNode {
    return (Resolve-ExecutablePath -ToolName "Node.js" -CommandNames @("node.exe", "node") `
        -CandidatePaths @(
            $(if ($env:ProgramFiles) { Join-Path $env:ProgramFiles "nodejs\node.exe" }),
            $(if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA "Programs\nodejs\node.exe" })
        )).Path
}

function Resolve-VisualStudioEnvironment {
    $programFilesX86 = [Environment]::GetFolderPath("ProgramFilesX86")
    $searched = [Collections.Generic.List[string]]::new()
    $vswhereCandidates = @(
        (Join-Path $programFilesX86 "Microsoft Visual Studio\Installer\vswhere.exe")
    )
    $vswhereCommand = Get-Command vswhere.exe -CommandType Application -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($vswhereCommand) { $vswhereCandidates += $vswhereCommand.Source }

    foreach ($vswhere in ($vswhereCandidates | Select-Object -Unique)) {
        if ([string]::IsNullOrWhiteSpace($vswhere)) { continue }
        $searched.Add($vswhere)
        if (!(Test-Path -LiteralPath $vswhere -PathType Leaf)) { continue }
        $vswhereResult = Invoke-TrackedNative -FilePath $vswhere -Arguments @(
            "-latest", "-products", "*", "-requires",
            "Microsoft.VisualStudio.Component.VC.Tools.x86.x64", "-property", "installationPath"
        ) -TimeoutSeconds 30
        $installPath = @($vswhereResult.StandardOutput -split "`r?`n" |
            Where-Object { ![string]::IsNullOrWhiteSpace($_) }) | Select-Object -First 1
        if ($vswhereResult.ExitCode -ne 0 -or [string]::IsNullOrWhiteSpace($installPath)) { continue }
        $vsDevCmd = Join-Path $installPath "Common7\Tools\VsDevCmd.bat"
        $vcVars = Join-Path $installPath "VC\Auxiliary\Build\vcvars64.bat"
        $searched.Add($vsDevCmd)
        $searched.Add($vcVars)
        if (Test-Path -LiteralPath $vsDevCmd -PathType Leaf) {
            return [pscustomobject]@{ Path = $vsDevCmd; Arguments = "-arch=x64 -host_arch=x64"; Searched = @($searched) }
        }
        if (Test-Path -LiteralPath $vcVars -PathType Leaf) {
            return [pscustomobject]@{ Path = $vcVars; Arguments = ""; Searched = @($searched) }
        }
    }

    $visualStudioRoot = Join-Path $programFilesX86 "Microsoft Visual Studio"
    $searched.Add("$visualStudioRoot\**\VC\Auxiliary\Build\vcvars64.bat")
    if (Test-Path -LiteralPath $visualStudioRoot -PathType Container) {
        $fallback = Get-ChildItem -LiteralPath $visualStudioRoot -Filter vcvars64.bat `
            -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($fallback) {
            return [pscustomobject]@{ Path = $fallback.FullName; Arguments = ""; Searched = @($searched) }
        }
    }
    throw "Visual Studio C++ toolchain was not found. Searched: $($searched -join '; ')"
}

function Resolve-WindowsSdk {
    $searched = [Collections.Generic.List[string]]::new()
    $roots = [Collections.Generic.List[string]]::new()
    if ($env:WindowsSdkDir) { $roots.Add($env:WindowsSdkDir) }
    foreach ($registryPath in @(
        "HKLM:\SOFTWARE\Microsoft\Windows Kits\Installed Roots",
        "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows Kits\Installed Roots"
    )) {
        $searched.Add("$registryPath KitsRoot10")
        try {
            $root = (Get-ItemProperty -LiteralPath $registryPath -ErrorAction Stop).KitsRoot10
            if ($root) { $roots.Add($root) }
        } catch {}
    }
    $programFilesX86 = [Environment]::GetFolderPath("ProgramFilesX86")
    $roots.Add((Join-Path $programFilesX86 "Windows Kits\10"))

    foreach ($root in ($roots | Select-Object -Unique)) {
        if ([string]::IsNullOrWhiteSpace($root)) { continue }
        $libRoot = Join-Path $root "Lib"
        $searched.Add($libRoot)
        if (!(Test-Path -LiteralPath $libRoot -PathType Container)) { continue }
        $versions = Get-ChildItem -LiteralPath $libRoot -Directory -ErrorAction SilentlyContinue |
            Sort-Object { try { [Version]$_.Name } catch { [Version]"0.0" } } -Descending
        foreach ($version in $versions) {
            $um = Join-Path $version.FullName "um\x64"
            $ucrt = Join-Path $version.FullName "ucrt\x64"
            if ((Test-Path -LiteralPath $um -PathType Container) -and
                (Test-Path -LiteralPath $ucrt -PathType Container)) {
                return [pscustomobject]@{
                    Root = (Resolve-Path $root).Path
                    Version = $version.Name
                    UmLib = $um
                    UcrtLib = $ucrt
                    Searched = @($searched)
                }
            }
        }
    }
    throw "Windows SDK x64 libraries were not found. Searched: $($searched -join '; ')"
}

function Import-BatchEnvironment {
    param(
        [Parameter(Mandatory = $true)][string]$ScriptPath,
        [string]$Arguments = ""
    )
    $rawArguments = '/d /s /c ""{0}" {1} >nul && set"' -f $ScriptPath, $Arguments
    $result = Invoke-TrackedNative -FilePath $env:ComSpec -RawArguments $rawArguments -TimeoutSeconds 60
    if ($result.ExitCode -ne 0) {
        throw "Visual Studio environment initialization failed with exit code $($result.ExitCode): $ScriptPath. $($result.StandardError)"
    }
    foreach ($line in ($result.StandardOutput -split "`r?`n")) {
        $separator = $line.IndexOf("=")
        if ($separator -le 0) { continue }
        $name = $line.Substring(0, $separator)
        $value = $line.Substring($separator + 1)
        Set-Item -LiteralPath "Env:$name" -Value $value
    }
}

function Assert-ToolCommand {
    param(
        [Parameter(Mandatory = $true)][string]$ToolName,
        [Parameter(Mandatory = $true)][string]$Executable,
        [string[]]$Arguments = @("--version")
    )
    $result = Invoke-TrackedNative -FilePath $Executable -Arguments $Arguments -TimeoutSeconds 30
    if ($result.ExitCode -ne 0) {
        throw "$ToolName was found at '$Executable' but validation failed with exit code $($result.ExitCode). $($result.StandardError)"
    }
}

function Initialize-WindowsToolchain {
    param([Parameter(Mandatory = $true)][string]$ProjectRoot)

    $errors = [Collections.Generic.List[string]]::new()
    $cargo = $null
    $node = $null
    $python = $null
    $visualStudio = $null
    $sdk = $null
    try {
        $cargo = Resolve-ExecutablePath -ToolName "Cargo" -CommandNames @("cargo.exe", "cargo") `
            -CandidatePaths @(
                $(if ($env:CARGO_HOME) { Join-Path $env:CARGO_HOME "bin\cargo.exe" }),
                $(if ($env:USERPROFILE) { Join-Path $env:USERPROFILE ".cargo\bin\cargo.exe" })
            )
    } catch { $errors.Add($_.Exception.Message) }
    try {
        $node = [pscustomobject]@{ Path = (Resolve-WindowsNode) }
    } catch { $errors.Add($_.Exception.Message) }
    try {
        $python = [pscustomobject]@{ Path = (Resolve-ProjectWindowsPython -ProjectRoot $ProjectRoot) }
    } catch { $errors.Add($_.Exception.Message) }
    try { $visualStudio = Resolve-VisualStudioEnvironment } catch { $errors.Add($_.Exception.Message) }
    try { $sdk = Resolve-WindowsSdk } catch { $errors.Add($_.Exception.Message) }
    if ($errors.Count -gt 0) {
        throw "Windows toolchain bootstrap failed before verification started:`n - $($errors -join "`n - ")"
    }

    Import-BatchEnvironment -ScriptPath $visualStudio.Path -Arguments $visualStudio.Arguments
    $env:Path = "$(Split-Path $cargo.Path);$(Split-Path $node.Path);$env:Path"
    $env:LIB = "$($sdk.UmLib);$($sdk.UcrtLib);$env:LIB"
    Assert-ToolCommand -ToolName "Cargo" -Executable $cargo.Path
    Assert-ToolCommand -ToolName "Node.js" -Executable $node.Path
    Assert-ToolCommand -ToolName "Windows Python" -Executable $python.Path -Arguments @("-X", "utf8", "--version")
    $compiler = Get-Command cl.exe -CommandType Application -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if (!$compiler) {
        throw "Visual Studio environment initialized from '$($visualStudio.Path)' but cl.exe was not added to PATH."
    }

    return [pscustomobject][ordered]@{
        Cargo = $cargo.Path
        Node = $node.Path
        Python = $python.Path
        VisualStudioEnvironment = $visualStudio.Path
        Compiler = $compiler.Source
        WindowsSdkRoot = $sdk.Root
        WindowsSdkVersion = $sdk.Version
        WindowsSdkUmLib = $sdk.UmLib
        WindowsSdkUcrtLib = $sdk.UcrtLib
    }
}
