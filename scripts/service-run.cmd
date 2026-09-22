@echo off
cd /d "%~dp0.."
if exist "%ProgramFiles%\nodejs\npm.cmd" set "PATH=%ProgramFiles%\nodejs;%PATH%"
if exist "C:\Tools\nodejs\npm.cmd" set "PATH=C:\Tools\nodejs;%PATH%"
if not exist "local" mkdir local
set NODE_ENV=production
call npm.cmd start >> "local\service.log" 2>&1
