@echo off
chcp 65001 >nul 2>&1
title 停止文献调研管理系统

echo ============================================
echo   停止文献调研管理系统
echo ============================================
echo.

set "FOUND=0"

:: Kill backend (uvicorn / python on port 8000)
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr "127.0.0.1:8000.*LISTENING"') do (
    taskkill /f /pid %%a >nul 2>&1
    set "FOUND=1"
    echo   [OK] 后端服务已停止
)

:: Kill frontend (node/vite on port 5173)
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr "127.0.0.1:5173.*LISTENING"') do (
    taskkill /f /pid %%a >nul 2>&1
    set "FOUND=1"
    echo   [OK] 前端服务已停止
)

:: Fallback: kill by window title
taskkill /fi "WINDOWTITLE eq LitReview-Backend" /f >nul 2>&1
taskkill /fi "WINDOWTITLE eq LitReview-Frontend" /f >nul 2>&1

if "%FOUND%"=="0" (
    echo   未检测到正在运行的服务。
)

echo.
echo   完成。
timeout /t 2 /nobreak >nul
