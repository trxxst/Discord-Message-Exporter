@echo off
setlocal enabledelayedexpansion

:: ================================================
:: Discord Backup (Electron) - All-In-One Build
:: ================================================
:: Usage: "setup&build.bat" [flags]
::
:: Flags:
::   --dir        Fast unpacked build only (no installer) -> release\win-unpacked
::   --portable   Build only the standalone portable .exe
::   --installer  Build only the NSIS setup installer
::   --launch     Launch the app after building
::   --dev        Skip packaging; run the app in dev mode (HMR)
::   --skip-deps  Do not run npm install
::
:: With no flags it installs deps, builds, and produces BOTH the
:: portable .exe and the setup installer in the release\ folder.
:: ================================================

:: ANSI color codes (Windows Terminal / Win10+)
for /f %%a in ('echo prompt $E ^| cmd') do set "ESC=%%a"
set "RESET=%ESC%[0m"
set "BOLD=%ESC%[1m"
set "GREEN=%ESC%[32m"
set "YELLOW=%ESC%[33m"
set "RED=%ESC%[31m"
set "CYAN=%ESC%[36m"
set "BLUE=%ESC%[34m"
set "DIM=%ESC%[2m"

set "DO_INSTALL=1"
set "DO_PACKAGE=1"
set "TARGET=both"
set "BUILD_DIR_ONLY=0"
set "LAUNCH_AFTER=0"
set "DEV_MODE=0"

:parse_args
if "%~1"=="" goto :start
if /i "%~1"=="--dir"        ( set "BUILD_DIR_ONLY=1" & shift & goto :parse_args )
if /i "%~1"=="--portable"   ( set "TARGET=portable"  & shift & goto :parse_args )
if /i "%~1"=="--installer"  ( set "TARGET=nsis"      & shift & goto :parse_args )
if /i "%~1"=="--launch"     ( set "LAUNCH_AFTER=1"   & shift & goto :parse_args )
if /i "%~1"=="--dev"        ( set "DEV_MODE=1"       & shift & goto :parse_args )
if /i "%~1"=="--skip-deps"  ( set "DO_INSTALL=0"     & shift & goto :parse_args )
shift
goto :parse_args

:start
cd /d "%~dp0"
echo.
echo %BOLD%%CYAN%================================================%RESET%
echo %BOLD%%CYAN%  Discord Backup (Electron) - Build System%RESET%
echo %BOLD%%CYAN%================================================%RESET%
echo.

:: ------------------------------------------------
:: STEP 1: Environment check
:: ------------------------------------------------
echo %BOLD%%BLUE%[1/5] Checking environment...%RESET%

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo %RED%  [ERROR] Node.js is not installed or not in PATH!%RESET%
    echo %DIM%  Download Node.js LTS from https://nodejs.org/%RESET%
    pause
    exit /b 1
)
for /f "delims=" %%v in ('node --version') do set "NODE_VER=%%v"
echo %GREEN%  [OK] Node.js %NODE_VER% found%RESET%

where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo %RED%  [ERROR] npm is not available!%RESET%
    pause
    exit /b 1
)
echo %GREEN%  [OK] npm available%RESET%
echo.

:: ------------------------------------------------
:: STEP 2: Install dependencies
:: ------------------------------------------------
echo %BOLD%%BLUE%[2/5] Installing dependencies...%RESET%
if "%DO_INSTALL%"=="0" (
    echo %DIM%  Skipped (--skip-deps)%RESET%
) else (
    call npm install
    if !errorlevel! neq 0 (
        echo %RED%  [ERROR] npm install failed!%RESET%
        pause
        exit /b 1
    )
    echo %GREEN%  [OK] Dependencies installed%RESET%
)
echo.

:: ------------------------------------------------
:: DEV MODE shortcut
:: ------------------------------------------------
if "%DEV_MODE%"=="1" (
    echo %BOLD%%GREEN%Starting dev mode (Ctrl+C to stop)...%RESET%
    echo.
    call npm run dev
    exit /b 0
)

:: ------------------------------------------------
:: STEP 3: Build (type-check + bundle)
:: ------------------------------------------------
echo %BOLD%%BLUE%[3/5] Building application (electron-vite)...%RESET%
call npm run build
if %errorlevel% neq 0 (
    echo %RED%  [ERROR] Build failed!%RESET%
    pause
    exit /b 1
)
echo %GREEN%  [OK] Bundles written to out\%RESET%
echo.

:: ------------------------------------------------
:: STEP 4: Package into .exe (electron-builder)
:: ------------------------------------------------
echo %BOLD%%BLUE%[4/5] Packaging Windows executable...%RESET%

if "%BUILD_DIR_ONLY%"=="1" (
    echo %DIM%  Unpacked build only (--dir)%RESET%
    call npx electron-builder --win --dir
) else (
    if /i "%TARGET%"=="portable" (
        echo %DIM%  Target: portable%RESET%
        call npx electron-builder --win portable
    ) else if /i "%TARGET%"=="nsis" (
        echo %DIM%  Target: installer%RESET%
        call npx electron-builder --win nsis
    ) else (
        echo %DIM%  Target: portable + installer%RESET%
        call npx electron-builder --win
    )
)
if %errorlevel% neq 0 (
    echo %RED%  [ERROR] Packaging failed!%RESET%
    pause
    exit /b 1
)
echo %GREEN%  [OK] Packaging complete%RESET%
echo.

:: ------------------------------------------------
:: STEP 5: Summary
:: ------------------------------------------------
echo %BOLD%%BLUE%[5/5] Finalizing...%RESET%
echo.
echo %BOLD%%CYAN%================================================%RESET%
echo %BOLD%%CYAN%  Build Complete!%RESET%
echo %BOLD%%CYAN%================================================%RESET%
echo.
echo %BOLD%  Output folder:%RESET% release\
if exist "release\win-unpacked\Discord Backup.exe" echo %BOLD%  Unpacked exe: %RESET% release\win-unpacked\Discord Backup.exe
for %%f in ("release\DiscordBackup-*-portable.exe") do echo %BOLD%  Portable:     %RESET% %%f
for %%f in ("release\Discord Backup-*-setup.exe")   do echo %BOLD%  Installer:    %RESET% %%f
echo.

:: ------------------------------------------------
:: Optional launch
:: ------------------------------------------------
if "%LAUNCH_AFTER%"=="1" (
    set "RUN_EXE="
    if exist "release\win-unpacked\Discord Backup.exe" set "RUN_EXE=release\win-unpacked\Discord Backup.exe"
    for %%f in ("release\DiscordBackup-*-portable.exe") do set "RUN_EXE=%%f"
    if defined RUN_EXE (
        echo %BOLD%%GREEN%Launching: !RUN_EXE!%RESET%
        start "" "!RUN_EXE!"
    ) else (
        echo %YELLOW%  [WARN] No exe found to launch.%RESET%
    )
)

echo %DIM%Run the portable .exe or the installer in release\ to use the app.%RESET%
echo.
pause
