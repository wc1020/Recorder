@echo off
setlocal
set VBS=%~dp0service-hidden.vbs
cd /d "%~dp0.."
set ROOT=%CD%

if /i "%~1"=="stop" goto stop
if /i "%~1"=="install" goto install
if /i "%~1"=="start" goto start
if /i "%~1"=="" goto start
echo usage: service.cmd [start^|stop^|install]
exit /b 1

:install
powershell -NoProfile -Command ^
  "$startup = [Environment]::GetFolderPath('Startup');" ^
  "$lnkPath = Join-Path $startup 'projectM.lnk';" ^
  "$ws = New-Object -ComObject WScript.Shell;" ^
  "$lnk = $ws.CreateShortcut($lnkPath);" ^
  "$lnk.TargetPath = 'wscript.exe';" ^
  "$lnk.Arguments = '//B \"' + $env:VBS + '\"';" ^
  "$lnk.WorkingDirectory = $env:ROOT;" ^
  "$lnk.WindowStyle = 7;" ^
  "$lnk.Save();" ^
  "Write-Host ('startup shortcut ' + $lnkPath)"
if errorlevel 1 (
  echo failed to create startup shortcut.
  exit /b 1
)
echo starts at logon, no window
goto start

:start
powershell -NoProfile -Command ^
  "$n = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue;" ^
  "if ($n) { Write-Host 'already running  http://localhost:3000'; exit 0 }"
echo starting http://localhost:3000
wscript.exe //B "%VBS%"
exit /b 0

:stop
powershell -NoProfile -Command ^
  "$owners = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique;" ^
  "if (-not $owners) { Write-Host 'not running'; exit 0 }" ^
  "foreach ($procId in $owners) { Write-Host \"stop pid=$procId\"; & taskkill.exe /T /F /PID $procId }"
exit /b 0
