@echo off
setlocal
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0invoke-windows-toolchain.ps1" -Task Release
set "RESULT=%ERRORLEVEL%"
exit /b %RESULT%
