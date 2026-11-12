@echo off
setlocal
cd /d "%~dp0"
if not exist node_modules call npm install
start "Dream Carousel Vite" cmd /k npm run dev
timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:5173/"
