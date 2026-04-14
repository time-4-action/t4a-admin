@echo off
setlocal

set IMAGE=etiamsi/t4a-admin
set TAG=latest

echo [build-and-push] Reading .env.local for NEXT_PUBLIC_ build args...

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
  "$eurUsd    = $env['NEXT_PUBLIC_EUR_USD_RATE'];" ^
  "Write-Host \"[build-and-push] Building %IMAGE%:%TAG%...\";" ^
  "docker build" ^
  "  --build-arg NEXT_PUBLIC_APP_NAME=$appName" ^
  "  --build-arg NEXT_PUBLIC_COMPANY_COLOR=$color" ^
  "  --build-arg NEXT_PUBLIC_DEEPGRAM_API_KEY=$deepgram" ^
  "  --build-arg NEXT_PUBLIC_AI_ROLE_NAME=$aiRole" ^
  "  --build-arg NEXT_PUBLIC_EUR_USD_RATE=$eurUsd" ^
  "  -t %IMAGE%:%TAG% .;" ^
  "if ($LASTEXITCODE -ne 0) { Write-Error 'Build failed'; exit 1 };" ^
  "Write-Host \"[build-and-push] Pushing %IMAGE%:%TAG%...\";" ^
  "docker push %IMAGE%:%TAG%;" ^
  "if ($LASTEXITCODE -ne 0) { Write-Error 'Push failed'; exit 1 };" ^
  "Write-Host \"[build-and-push] Done.\""

endlocal
