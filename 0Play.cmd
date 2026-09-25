@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 relay_moth_server.py
) else (
  python relay_moth_server.py
)
if errorlevel 1 (
  echo.
  echo Relay Moth Forest could not start.
  echo Confirm Python 3 and a current WebGL2 browser are installed.
  pause
)
endlocal
