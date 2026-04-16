@echo off
setlocal enabledelayedexpansion

set IMAGE=time4action/t4a-admin

:: Parse tag argument
set TAG=
if "%~1"=="--latest" set TAG=latest
if "%~1"=="--dev" set TAG=dev
if "%TAG%"=="" (
    for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set TAG=%%i
)

echo [push] Pushing %IMAGE%:%TAG%...

docker push %IMAGE%:%TAG%
if %ERRORLEVEL% neq 0 (
    echo [push] Push failed.
    exit /b 1
)

echo [push] Done: %IMAGE%:%TAG%

endlocal
