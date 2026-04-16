@echo off
setlocal enabledelayedexpansion

set IMAGE=time4action/t4a-admin

:: Parse tag argument
set TAG=
if "%~1"=="--latest" set TAG=latest
if "%~1"=="--dev" set TAG=dev
if "%TAG%"=="" (
    for /f "tokens=1-6 delims=/:. " %%a in ("%date% %time%") do (
        set TAG=%%c%%a%%b-%%d%%e%%f
    )
    :: Fallback: use PowerShell for reliable yyyymmdd-hhmmss
    for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set TAG=%%i
)

echo [build] Image: %IMAGE%:%TAG%
echo [build] Reading .env.local for NEXT_PUBLIC_ build args...

powershell -NoProfile -Command ^
  "$env = @{};" ^
  "Get-Content '.env.local' | Where-Object { $_ -match '^\s*[A-Za-z]' } | ForEach-Object {" ^
  "  $parts = $_ -split '=', 2;" ^
  "  if ($parts.Count -eq 2) { $env[$parts[0].Trim()] = $parts[1].Trim() }" ^
  "};" ^
  "$appName   = $env['NEXT_PUBLIC_APP_NAME'];" ^
  "$color     = $env['NEXT_PUBLIC_COMPANY_COLOR'];" ^
  "$deepgram  = $env['NEXT_PUBLIC_DEEPGRAM_API_KEY'];" ^
  "$aiRole    = $env['NEXT_PUBLIC_AI_ROLE_NAME'];" ^
  "$devRole   = $env['NEXT_PUBLIC_DEV_ROLE_NAME'];" ^
  "$eurUsd    = $env['NEXT_PUBLIC_EUR_USD_RATE'];" ^
  "Write-Host '[build] Building %IMAGE%:%TAG%...';" ^
  "docker build" ^
  "  --build-arg NEXT_PUBLIC_APP_NAME=$appName" ^
  "  --build-arg NEXT_PUBLIC_COMPANY_COLOR=$color" ^
  "  --build-arg NEXT_PUBLIC_DEEPGRAM_API_KEY=$deepgram" ^
  "  --build-arg NEXT_PUBLIC_AI_ROLE_NAME=$aiRole" ^
  "  --build-arg NEXT_PUBLIC_DEV_ROLE_NAME=$devRole" ^
  "  --build-arg NEXT_PUBLIC_EUR_USD_RATE=$eurUsd" ^
  "  -t %IMAGE%:%TAG% .;" ^
  "if ($LASTEXITCODE -ne 0) { Write-Error 'Build failed'; exit 1 };" ^
  "Write-Host '[build] Done: %IMAGE%:%TAG%'"

endlocal
