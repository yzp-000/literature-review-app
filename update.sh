#!/bin/bash
# Update the Literature Review App to the latest version
# Usage: ./update.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "============================================"
echo "  文献调研管理系统 — 版本更新"
echo "============================================"
echo ""

# Check if git repo
if [ ! -d ".git" ]; then
    echo "[错误] 当前目录不是 Git 仓库，无法自动更新。"
    echo "请手动下载最新版本：https://github.com/yzp-000/literature-review-app"
    exit 1
fi

# Check for local uncommitted changes
if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
    echo "[警告] 检测到本地有未提交的修改："
    git status --short
    echo ""
    read -p "是否暂存本地修改并继续更新？(y/N) " confirm
    if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
        git stash
        STASHED=1
        echo "[✓] 本地修改已暂存（git stash）"
    else
        echo "[取消] 更新已取消。请先处理本地修改。"
        exit 0
    fi
fi

# Pull latest code
echo ""
echo "[1/3] 拉取最新代码..."
BEFORE=$(git rev-parse HEAD)
git pull origin main
AFTER=$(git rev-parse HEAD)

if [ "$BEFORE" = "$AFTER" ]; then
    echo "[✓] 已是最新版本，无需更新。"
    # Restore stash if we stashed
    if [ "${STASHED:-0}" = "1" ]; then
        git stash pop
        echo "[✓] 本地修改已恢复"
    fi
    exit 0
fi

# Show what changed
echo ""
echo "更新内容："
git log --oneline "$BEFORE".."$AFTER"
echo ""

# Update backend dependencies
echo "[2/3] 更新后端依赖..."
cd "$SCRIPT_DIR/backend"
pip install -r requirements.txt --quiet 2>&1 | tail -3
echo "[✓] 后端依赖已更新"

# Update frontend dependencies
echo ""
echo "[3/3] 更新前端依赖..."
cd "$SCRIPT_DIR/frontend"
npm install --silent 2>&1 | tail -3
echo "[✓] 前端依赖已更新"

# Restore stash if we stashed
if [ "${STASHED:-0}" = "1" ]; then
    echo ""
    git stash pop && echo "[✓] 本地修改已恢复" || echo "[警告] 恢复本地修改时有冲突，请手动处理：git stash pop"
fi

echo ""
echo "============================================"
echo "  [✓] 更新完成！"
echo "  运行 ./start.sh 启动应用"
echo "============================================"
