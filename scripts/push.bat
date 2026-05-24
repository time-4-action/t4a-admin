@echo off
setlocal enabledelayedexpansion

set IMAGE=time4action/t4a-admin

:: Find the latest date-tagged image (yyyyMMdd-HHmmss format, sorted descending)
for /f %%i in ('powershell -NoProfile -Command "docker images %IMAGE% --format '{{.Tag}}' | Where-Object { $_ -match '^\d{8}-\d{6}$' } | Sort-Object -Descending | Select-Object -First 1"') do set DATETAG=%%i

if "%DATETAG%"=="" (
    echo [push] No date-tagged image found for %IMAGE%. Run build.bat first.
    exit /b 1
)

:: Parse optional alias tag
set ALIASTAG=
if "%~1"=="--latest" set ALIASTAG=latest
if "%~1"=="--dev" set ALIASTAG=dev

:: Push date-tagged image
echo [push] Pushing %IMAGE%:%DATETAG%...
docker push %IMAGE%:%DATETAG%
if %ERRORLEVEL% neq 0 (
    echo [push] Push failed for %IMAGE%:%DATETAG%.
    exit /b 1
)
echo [push] Done: %IMAGE%:%DATETAG%

:: Also push alias tag if specified
if not "%ALIASTAG%"=="" (
    echo [push] Pushing %IMAGE%:%ALIASTAG%...
    docker push %IMAGE%:%ALIASTAG%
    if %ERRORLEVEL% neq 0 (
        echo [push] Push failed for %IMAGE%:%ALIASTAG%.
        exit /b 1
    )
    echo [push] Done: %IMAGE%:%ALIASTAG%
)

endlocal
