@echo off
setlocal enabledelayedexpansion

set IMAGE=time4action/t4a-admin

:: Always generate a date tag
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set DATETAG=%%i

:: Parse optional alias tag
set ALIASTAG=
if "%~1"=="--latest" set ALIASTAG=latest
if "%~1"=="--dev" set ALIASTAG=dev

echo [build] Reading .env.local for NEXT_PUBLIC_ build args...

:: Build with date tag
powershell -NoProfile -Command ^
  "$env = @{};" ^
  "Get-Content '.env.local' | Where-Object { $_ -match '^\s*[A-Za-z]' } | ForEach-Object {" ^
  "  $parts = $_ -split '=', 2;" ^
  "  if ($parts.Count -eq 2) { $env[$parts[0].Trim()] = $parts[1].Trim() }" ^
  "};" ^
  "$color     = $env['NEXT_PUBLIC_COMPANY_COLOR'];" ^
  "$deepgram  = $env['NEXT_PUBLIC_DEEPGRAM_API_KEY'];" ^
  "$aiRole    = $env['NEXT_PUBLIC_AI_ROLE_NAME'];" ^
  "$devRole   = $env['NEXT_PUBLIC_DEV_ROLE_NAME'];" ^
  "$eurUsd    = $env['NEXT_PUBLIC_EUR_USD_RATE'];" ^
  "Write-Host '[build] Building %IMAGE%:%DATETAG%...';" ^
  "docker build" ^
  "  --build-arg NEXT_PUBLIC_COMPANY_COLOR=$color" ^
  "  --build-arg NEXT_PUBLIC_DEEPGRAM_API_KEY=$deepgram" ^
  "  --build-arg NEXT_PUBLIC_AI_ROLE_NAME=$aiRole" ^
  "  --build-arg NEXT_PUBLIC_DEV_ROLE_NAME=$devRole" ^
  "  --build-arg NEXT_PUBLIC_EUR_USD_RATE=$eurUsd" ^
  "  -t %IMAGE%:%DATETAG% .;" ^
  "if ($LASTEXITCODE -ne 0) { Write-Error 'Build failed'; exit 1 };" ^
  "Write-Host '[build] Done: %IMAGE%:%DATETAG%'"

if %ERRORLEVEL% neq 0 exit /b 1

:: Also tag with alias if specified
if not "%ALIASTAG%"=="" (
    echo [build] Tagging %IMAGE%:%DATETAG% as %IMAGE%:%ALIASTAG%...
    docker tag %IMAGE%:%DATETAG% %IMAGE%:%ALIASTAG%
    if %ERRORLEVEL% neq 0 (
        echo [build] Tagging failed.
        exit /b 1
    )
    echo [build] Done: %IMAGE%:%ALIASTAG%
)

endlocal
