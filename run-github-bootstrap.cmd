@echo off
setlocal
cd /d "%~dp0"
call github-bootstrap.cmd
set "RC=%ERRORLEVEL%"
echo.
if not "%RC%"=="0" echo [ERROR] Bootstrap stopped with exit code %RC%.
pause
exit /b %RC%
