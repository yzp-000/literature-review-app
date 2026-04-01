@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion
title 文献调研管理系统 — 版本更新

echo ============================================
echo   文献调研管理系统 — 版本更新
echo ============================================
echo.

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

:: Check if git repo
if not exist ".git" (
    echo [错误] 当前目录不是 Git 仓库，无法自动更新。
    echo 请手动下载最新版本：https://github.com/yzp-000/literature-review-app
    pause
    exit /b 1
)

:: Check for local uncommitted changes
set "HAS_CHANGES=0"
git diff --quiet 2>nul || set "HAS_CHANGES=1"
git diff --cached --quiet 2>nul || set "HAS_CHANGES=1"

if "!HAS_CHANGES!"=="1" (
    echo [警告] 检测到本地有未提交的修改：
    git status --short
    echo.
    set /p "CONFIRM=是否暂存本地修改并继续更新？(y/N) "
    if /i "!CONFIRM!"=="y" (
        git stash
        set "STASHED=1"
        echo [OK] 本地修改已暂存（git stash）
    ) else (
        echo [取消] 更新已取消。请先处理本地修改。
        pause
        exit /b 0
    )
)

:: Pull latest code
echo.
echo [1/3] 拉取最新代码...
for /f %%i in ('git rev-parse HEAD') do set "BEFORE=%%i"
git pull origin main
for /f %%i in ('git rev-parse HEAD') do set "AFTER=%%i"

if "!BEFORE!"=="!AFTER!" (
    echo [OK] 已是最新版本，无需更新。
    if "!STASHED!"=="1" (
        git stash pop
        echo [OK] 本地修改已恢复
    )
    pause
    exit /b 0
)

:: Show what changed
echo.
echo 更新内容：
git log --oneline !BEFORE!..!AFTER!
echo.

:: Update backend dependencies
echo [2/3] 更新后端依赖...
cd /d "%SCRIPT_DIR%backend"
pip install -r requirements.txt --quiet
echo [OK] 后端依赖已更新

:: Update frontend dependencies
echo.
echo [3/3] 更新前端依赖...
cd /d "%SCRIPT_DIR%frontend"
call npm install --silent
echo [OK] 前端依赖已更新

:: Restore stash if we stashed
if "!STASHED!"=="1" (
    echo.
    git stash pop && (
        echo [OK] 本地修改已恢复
    ) || (
        echo [警告] 恢复本地修改时有冲突，请手动处理：git stash pop
    )
)

echo.
echo ============================================
echo   [OK] 更新完成！
echo   运行 start.bat 启动应用
echo ============================================

pause
