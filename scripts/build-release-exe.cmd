@echo off
setlocal

set "VCVARS=%ProgramFiles(x86)%\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
call "%VCVARS%"
if errorlevel 1 exit /b %errorlevel%

rem Keep the SDK import libraries explicit for shells launched through WSL.
if defined VCToolsInstallDir set "LIB=%VCToolsInstallDir%lib\x64;%LIB%"
set "SDK_LIB_VERSION="
for /f "delims=" %%D in ('dir "%ProgramFiles(x86)%\Windows Kits\10\Lib" /b /ad /o-n 2^>nul') do if not defined SDK_LIB_VERSION set "SDK_LIB_VERSION=%%D"
if defined SDK_LIB_VERSION set "LIB=%ProgramFiles(x86)%\Windows Kits\10\Lib\%SDK_LIB_VERSION%\um\x64;%ProgramFiles(x86)%\Windows Kits\10\Lib\%SDK_LIB_VERSION%\ucrt\x64;%LIB%"

set "CARGO=cargo"
where cargo >nul 2>nul
if errorlevel 1 set "CARGO=%USERPROFILE%\.cargo\bin\cargo.exe"
set "PYTHON=python"
where python >nul 2>nul
if errorlevel 1 for /d %%D in ("%USERPROFILE%\AppData\Local\Programs\Python\Python*") do if exist "%%~fD\python.exe" set "PYTHON=%%~fD\python.exe"
set "NODE=%USERPROFILE%\AppData\Local\Programs\nodejs\node.exe"

pushd "%~dp0.."
"%NODE%" node_modules\typescript\bin\tsc --noEmit
if errorlevel 1 exit /b %errorlevel%
"%NODE%" node_modules\vite\bin\vite.js build
if errorlevel 1 exit /b %errorlevel%
if not exist dist mkdir dist
"%CARGO%" metadata --manifest-path src-tauri\Cargo.toml --locked --format-version 1 > dist\cargo-metadata.json
if errorlevel 1 exit /b %errorlevel%
"%PYTHON%" scripts\generate-sbom.py
if errorlevel 1 exit /b %errorlevel%
popd

pushd "%~dp0..\src-tauri"
"%CARGO%" build --release --locked --features tauri/custom-protocol
set "RESULT=%ERRORLEVEL%"
popd
exit /b %RESULT%
