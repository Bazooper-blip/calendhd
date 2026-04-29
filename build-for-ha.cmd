@echo off
setlocal
REM Builds the frontend and syncs hooks/migrations/push-service into ha-addon/calendhd/
REM Mirrors build-for-ha.sh, plus keeps a legacy ha-deploy/ staging dir for manual Samba copy.

cd /d "%~dp0"
set "ROOT=%CD%"
set "ADDON=%ROOT%\ha-addon\calendhd"

echo.
echo ==========================================
echo calenDHD Addon Build (Windows)
echo ==========================================
echo.

if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    if errorlevel 1 goto :fail_install
)

echo.
echo Building frontend...
call npm run build
if errorlevel 1 goto :fail_build

echo.
echo Syncing frontend into addon rootfs...
if exist "%ADDON%\rootfs\opt\calendhd\public" rmdir /s /q "%ADDON%\rootfs\opt\calendhd\public"
mkdir "%ADDON%\rootfs\opt\calendhd\public"
xcopy /s /e /y "build\*" "%ADDON%\rootfs\opt\calendhd\public\" > nul
if errorlevel 1 goto :fail_copy

echo Syncing PocketBase hooks...
if exist "%ADDON%\pb_hooks" rmdir /s /q "%ADDON%\pb_hooks"
mkdir "%ADDON%\pb_hooks"
xcopy /s /e /y "pocketbase\pb_hooks\*" "%ADDON%\pb_hooks\" > nul
if errorlevel 1 goto :fail_copy

echo Syncing PocketBase migrations...
if exist "%ADDON%\pb_migrations" rmdir /s /q "%ADDON%\pb_migrations"
mkdir "%ADDON%\pb_migrations"
xcopy /s /e /y "pocketbase\pb_migrations\*" "%ADDON%\pb_migrations\" > nul
if errorlevel 1 goto :fail_copy

echo Syncing push-service...
if exist "%ADDON%\push-service" rmdir /s /q "%ADDON%\push-service"
mkdir "%ADDON%\push-service"
copy /y "push-service\package.json" "%ADDON%\push-service\" > nul
if exist "push-service\package-lock.json" copy /y "push-service\package-lock.json" "%ADDON%\push-service\" > nul
copy /y "push-service\index.js" "%ADDON%\push-service\" > nul
if exist "push-service\generate-vapid.js" copy /y "push-service\generate-vapid.js" "%ADDON%\push-service\" > nul

echo.
echo Staging legacy ha-deploy\ for manual Samba copy...
if not exist "ha-deploy" mkdir ha-deploy
if exist "ha-deploy\public" rmdir /s /q "ha-deploy\public"
mkdir "ha-deploy\public"
xcopy /s /e /y "build\*" "ha-deploy\public\" > nul
if exist "ha-deploy\pb_migrations" rmdir /s /q "ha-deploy\pb_migrations"
mkdir "ha-deploy\pb_migrations"
xcopy /s /e /y "pocketbase\pb_migrations\*" "ha-deploy\pb_migrations\" > nul

REM Read version from config.yaml
for /f "tokens=2 delims==" %%v in ('findstr /b /c:"version:" "%ADDON%\config.yaml"') do set "VERSION=%%v"
set "VERSION=%VERSION:"=%"
set "VERSION=%VERSION: =%"

echo.
echo ==========================================
echo Build complete (addon version: %VERSION%)
echo ==========================================
echo.
echo Next steps:
echo   1. git status                    (review changes under ha-addon\)
echo   2. Bump version in ha-addon\calendhd\config.yaml if not already
echo   3. git add repository.yaml ha-addon\
echo   4. git commit -m "release: calendhd addon %VERSION%"
echo   5. git push
echo.
echo Legacy Samba copy (only if not using HA addon update):
echo   FROM: ha-deploy\public\*  TO: \\homeassistant\config\calendhd\pb_public\
echo.
pause
exit /b 0

:fail_install
echo.
echo ERROR: npm install failed
pause
exit /b 1

:fail_build
echo.
echo ERROR: npm run build failed
pause
exit /b 1

:fail_copy
echo.
echo ERROR: file copy failed
pause
exit /b 1
