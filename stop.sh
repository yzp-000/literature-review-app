#!/bin/bash
# Stop the Literature Review Management App
# Usage: ./stop.sh

echo "============================================"
echo "  停止文献调研管理系统"
echo "============================================"
echo ""

FOUND=0

# Kill by port: backend (8000)
if command -v fuser >/dev/null 2>&1; then
    if fuser 8000/tcp 2>/dev/null | grep -q .; then
        fuser -k 8000/tcp 2>/dev/null
        FOUND=1
        echo "  [OK] 后端服务已停止 (port 8000)"
    fi
    if fuser 5173/tcp 2>/dev/null | grep -q .; then
        fuser -k 5173/tcp 2>/dev/null
        FOUND=1
        echo "  [OK] 前端服务已停止 (port 5173)"
    fi
else
    # Fallback: use ss + kill
    for port in 8000 5173; do
        pids=$(ss -tlnp "sport = :$port" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | sort -u)
        if [ -n "$pids" ]; then
            for pid in $pids; do
                pkill -P "$pid" 2>/dev/null
                kill "$pid" 2>/dev/null
            done
            FOUND=1
            echo "  [OK] 端口 $port 上的服务已停止"
        fi
    done
fi

if [ "$FOUND" = "0" ]; then
    echo "  未检测到正在运行的服务。"
fi

echo ""
echo "  完成。"
