@echo off
setlocal

set "VCVARS=%ProgramFiles(x86)%\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
call "%VCVARS%" >nul
if errorlevel 1 exit /b %errorlevel%

where cargo >nul 2>nul
if errorlevel 1 set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"

pushd "%~dp0..\src-tauri"
cargo build --release --locked --features tauri/custom-protocol
set "RESULT=%ERRORLEVEL%"
popd
exit /b %RESULT%
