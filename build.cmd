@echo off
REM Build script that works around the Windows subst drive path issue
REM This runs the build from the actual C: drive path

pushd C:\resources\j\calendhd
npm run build
popd
