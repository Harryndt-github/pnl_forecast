@echo off
chcp 65001 >nul 2>&1
title PNL Forecast Server

echo ===================================================
echo   PNL FORECAST -- Windows Startup
echo ===================================================
echo.

REM --- Check Python ---
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found in PATH. Install Python 3.10+ first.
    pause
    exit /b 1
)

REM --- Install/update dependencies ---
echo [1/3] Checking dependencies...
pip install -r requirements.txt --quiet
if errorlevel 1 (
    echo [WARN] Some dependencies may have failed to install.
)
echo      Done.
echo.

REM --- Choose mode ---
set MODE=%1
if "%MODE%"=="" set MODE=dev

if /i "%MODE%"=="prod" goto :production

:development
echo [2/3] Starting in DEVELOPMENT mode (Flask dev server)...
echo       Press Ctrl+C to stop.
echo.
set FLASK_DEBUG=true
python app.py
goto :eof

:production
echo [2/3] Starting in PRODUCTION mode (Waitress WSGI)...
echo       Press Ctrl+C to stop.
echo.
set FLASK_DEBUG=false
python -c "from waitress import serve; from app import app; import os; port=int(os.getenv('FLASK_PORT','5050')); print(f'Waitress serving on http://0.0.0.0:{port}'); serve(app, host='0.0.0.0', port=port, threads=4)"
goto :eof
