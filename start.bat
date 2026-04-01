@echo off
chcp 65001 >nul 2>&1
title 文献调研管理系统

echo ============================================
echo   文献调研管理系统 — Literature Review App
echo ============================================
echo.

set "SCRIPT_DIR=%~dp0"

:: Start backend
echo [1/2] Starting backend (FastAPI)...
cd /d "%SCRIPT_DIR%backend"
start "LitReview-Backend" cmd /c "uvicorn main:app --host 127.0.0.1 --port 8000 --reload"

:: Start frontend dev server
echo [2/2] Starting frontend (Vite)...
cd /d "%SCRIPT_DIR%frontend"
start "LitReview-Frontend" cmd /c "npx vite --host 127.0.0.1 --port 5173"

echo.
echo ============================================
echo   Backend:  http://127.0.0.1:8000
echo   Frontend: http://127.0.0.1:5173
echo   API Docs: http://127.0.0.1:8000/docs
echo ============================================
echo   关闭此窗口不会停止服务。
echo   如需停止，请关闭 LitReview-Backend 和
echo   LitReview-Frontend 两个命令行窗口。
echo ============================================
echo.

:: Wait a moment then open browser
timeout /t 3 /nobreak >nul
start http://127.0.0.1:5173

pause
