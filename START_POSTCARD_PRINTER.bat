@echo off
title Postcard Printer
echo ========================================
echo       POSTCARD PRINTER
echo ========================================
echo.

set /p APPDIR=Enter the full path of the postcard-printer folder:

if not exist "%APPDIR%\server.js" (
    echo ERROR: server.js not found.
    pause
    exit /b 1
)

cd /d "%APPDIR%"

echo Starting Postcard Printer...
echo.

rem Wait for the server to be ready before opening the browser
timeout /t 2 /nobreak >nul

start "" http://127.0.0.1:5173/

node server.js

echo.
echo Postcard Printer has stopped.
pause
