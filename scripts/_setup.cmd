@echo off
cd /d "%~dp0.."

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js not found. Install 20.9+ , add PATH, reopen the terminal.
  exit /b 1
)

if not exist "local" mkdir local
if not exist "local\.env" (
  copy /Y ".env.example" "local\.env" >nul
  echo Created local\.env from .env.example. Fill API keys later if you need search.
)

echo [1/3] npm install
call npm.cmd install
if errorlevel 1 (
  echo npm install failed.
  exit /b 1
)

echo [2/3] prisma generate
call npx.cmd prisma generate
if errorlevel 1 (
  echo prisma generate failed. Stop any running next process and retry.
  exit /b 1
)

echo [3/3] prisma migrate deploy
call npx.cmd prisma migrate deploy
if errorlevel 1 (
  echo prisma migrate failed. Make sure the local folder exists.
  exit /b 1
)

exit /b 0
