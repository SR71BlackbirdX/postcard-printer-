@echo off
title Postcard Printer - Installation
echo ========================================
echo     POSTCARD PRINTER INSTALLER
echo ========================================
echo.

echo Checking for Node.js...

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Installing Node.js LTS...
    winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
    if %errorlevel% neq 0 (
        echo.
        echo Installation failed.
        echo Please install Node.js from https://nodejs.org
        pause
        exit /b 1
    )
)

echo.
echo Node.js is installed.
echo.

set /p APPDIR=Enter the full path of the postcard-printer folder:

if not exist "%APPDIR%\server.js" (
    echo.
    echo ERROR: server.js was not found in that folder.
    pause
    exit /b 1
)

cd /d "%APPDIR%"

if exist package.json (
    echo Installing project dependencies...
    call npm install
    if errorlevel 1 (
        echo Dependency installation failed.
        pause
        exit /b 1
    )
)

echo.
echo ========================================
echo INSTALLATION COMPLETED!
echo ========================================
echo You can now use START_POSTCARD_PRINTER.bat
pause
