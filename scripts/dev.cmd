@echo off
setlocal
call "%~dp0_setup.cmd"
if errorlevel 1 goto fail

echo.
echo Dev mode  http://localhost:3000
echo Keep this window open. Stop: Ctrl+C
echo.
call npm.cmd run dev
if errorlevel 1 goto fail
exit /b 0

:fail
echo.
pause
exit /b 1
