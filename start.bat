@echo off
chcp 65001 >nul 2>&1
title 文献调研管理系统

echo ============================================
echo   文献调研管理系统 — Literature Review App
echo ============================================
echo.

set "SCRIPT_DIR=%~dp0"

:: ---- Detect already running ----
set "ALREADY_RUNNING=0"
for /f "tokens=2" %%a in ('netstat -aon 2^>nul ^| findstr "127.0.0.1:8000.*LISTENING"') do (
    set "ALREADY_RUNNING=1"
)
if "%ALREADY_RUNNING%"=="1" (
    echo   [!] 检测到服务已在运行（端口 8000 已被占用）
    echo   [!] 正在打开浏览器...
    echo.
    start http://127.0.0.1:5173
    timeout /t 3 /nobreak >nul
    exit /b 0
)

:: ---- Start backend ----
echo [1/2] Starting backend (FastAPI)...
cd /d "%SCRIPT_DIR%backend"
start "LitReview-Backend" /min cmd /c "uvicorn main:app --host 127.0.0.1 --port 8000 --reload"

:: ---- Start frontend dev server ----
echo [2/2] Starting frontend (Vite)...
cd /d "%SCRIPT_DIR%frontend"
start "LitReview-Frontend" /min cmd /c "npx vite --host 127.0.0.1 --port 5173"

echo.
echo ============================================
echo   Backend:  http://127.0.0.1:8000
echo   Frontend: http://127.0.0.1:5173
echo   API Docs: http://127.0.0.1:8000/docs
echo ============================================
echo   按任意键停止所有服务并退出。
echo   也可直接运行 stop.bat 停止服务。
echo ============================================
echo.

:: Wait a moment then open browser
timeout /t 3 /nobreak >nul
start http://127.0.0.1:5173

:: ---- Wait for user to press a key, then stop all ----
pause >nul

echo.
echo   正在停止服务...

:: Kill backend (uvicorn / python on port 8000)
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr "127.0.0.1:8000.*LISTENING"') do (
    taskkill /f /pid %%a >nul 2>&1
)

:: Kill frontend (node/vite on port 5173)
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr "127.0.0.1:5173.*LISTENING"') do (
    taskkill /f /pid %%a >nul 2>&1
)

:: Also kill by window title as fallback
taskkill /fi "WINDOWTITLE eq LitReview-Backend" /f >nul 2>&1
taskkill /fi "WINDOWTITLE eq LitReview-Frontend" /f >nul 2>&1

echo   服务已停止。
timeout /t 2 /nobreak >nul
