@echo off
setlocal

set "VCVARS=%ProgramFiles(x86)%\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
if not exist "%VCVARS%" (
  echo MSVC Build Tools 2022 was not found. 1>&2
  exit /b 1
)

call "%VCVARS%" >nul
if errorlevel 1 exit /b %errorlevel%

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

if not exist "%~dp0..\dist" mkdir "%~dp0..\dist"
pushd "%~dp0..\src-tauri"
"%CARGO%" metadata --locked --format-version 1 > "%~dp0..\dist\cargo-metadata.json"
if errorlevel 1 exit /b %errorlevel%

popd
pushd "%~dp0.."
"%PYTHON%" scripts\generate-sbom.py
if errorlevel 1 exit /b %errorlevel%
popd
pushd "%~dp0..\src-tauri"

"%CARGO%" fmt --check
if errorlevel 1 exit /b %errorlevel%

"%CARGO%" check --locked
if errorlevel 1 exit /b %errorlevel%

"%CARGO%" test --locked
if errorlevel 1 exit /b %errorlevel%

popd
