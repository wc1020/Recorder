@echo off
setlocal
call "%~dp0_setup.cmd"
if errorlevel 1 goto fail

echo.
echo [prod] next build
call npm.cmd run build
if errorlevel 1 goto fail

echo.
echo Prod mode  http://localhost:3000
echo Keep this window open. Stop: Ctrl+C
echo Rebuild after code changes.
echo.
call npm.cmd start
if errorlevel 1 goto fail
exit /b 0

:fail
echo.
pause
exit /b 1
