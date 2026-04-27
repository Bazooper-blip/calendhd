@echo off
echo Starting PocketBase server...
echo.
echo Admin UI: http://127.0.0.1:8090/_/
echo API:      http://127.0.0.1:8090/api/
echo.
echo Press Ctrl+C to stop the server
echo.
pocketbase.exe serve --http=127.0.0.1:8090
