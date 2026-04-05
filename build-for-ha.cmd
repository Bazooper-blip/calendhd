@echo off
REM Build script for calenDHD Home Assistant deployment
REM Builds the frontend and prepares files for copying to HA Green

echo.
echo ==========================================
echo calenDHD Build for Home Assistant
echo ==========================================
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo ERROR: npm install failed
        exit /b 1
    )
)

REM Build the frontend
echo.
echo Building frontend...
call npm run build
if errorlevel 1 (
    echo ERROR: Build failed
    exit /b 1
)

REM Create output directory
if not exist "ha-deploy" mkdir ha-deploy
if exist "ha-deploy\public" rmdir /s /q "ha-deploy\public"
mkdir ha-deploy\public

REM Copy built files
echo.
echo Copying built files to ha-deploy\public...
xcopy /s /e /y "build\*" "ha-deploy\public\" > nul

REM Copy PocketBase migrations
if not exist "ha-deploy\pb_migrations" mkdir ha-deploy\pb_migrations
echo Copying PocketBase migrations...
xcopy /s /e /y "pocketbase\pb_migrations\*" "ha-deploy\pb_migrations\" > nul

REM Copy push-service into ha-addon build context (needed by Dockerfile COPY)
echo Copying push-service to HA addon build context...
if exist "ha-addon\calendhd\push-service" rmdir /s /q "ha-addon\calendhd\push-service"
mkdir ha-addon\calendhd\push-service
copy /y "push-service\package.json" "ha-addon\calendhd\push-service\" > nul
copy /y "push-service\package-lock.json" "ha-addon\calendhd\push-service\" > nul 2>&1
copy /y "push-service\index.js" "ha-addon\calendhd\push-service\" > nul

REM Copy PB hooks from root to HA addon
echo Copying PocketBase hooks to HA addon...
xcopy /s /e /y "pocketbase\pb_hooks\*" "ha-addon\calendhd\pb_hooks\" > nul

echo.
echo ==========================================
echo Build complete!
echo ==========================================
echo.
echo Files ready in: ha-deploy\
echo.
echo To deploy to Home Assistant Green:
echo.
echo 1. Access your HA via Samba share or SSH
echo.
echo 2. Copy frontend files:
echo    FROM: ha-deploy\public\*
echo    TO:   \\homeassistant\config\calendhd\pb_public\
echo.
echo 3. Copy migrations (first time only):
echo    FROM: ha-deploy\pb_migrations\*
echo    TO:   \\homeassistant\config\calendhd\pb_migrations\
echo.
echo 4. Restart the calenDHD addon in Home Assistant
echo.
pause
