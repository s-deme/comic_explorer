@echo off
setlocal

set "VCVARS=%ProgramFiles(x86)%\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
if not exist "%VCVARS%" (
  echo MSVC Build Tools 2022 was not found. 1>&2
  exit /b 1
)

call "%VCVARS%" >nul
if errorlevel 1 exit /b %errorlevel%

where cargo >nul 2>nul
if errorlevel 1 set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"

if not exist "%~dp0..\dist" mkdir "%~dp0..\dist"
pushd "%~dp0..\src-tauri"
cargo metadata --locked --format-version 1 > "%~dp0..\dist\cargo-metadata.json"
if errorlevel 1 exit /b %errorlevel%

cargo fmt --check
if errorlevel 1 exit /b %errorlevel%

cargo check --locked
if errorlevel 1 exit /b %errorlevel%

cargo test --locked
if errorlevel 1 exit /b %errorlevel%

popd
