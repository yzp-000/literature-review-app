#!/bin/bash
# Start the Literature Review Management App
# Usage: ./start.sh
# Backend: http://localhost:8000
# Frontend: http://localhost:5173

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "============================================"
echo "  文献调研管理系统 — Literature Review App"
echo "============================================"

# ---- Detect already running ----
if ss -tlnp 2>/dev/null | grep -q '127.0.0.1:8000'; then
    echo ""
    echo "  [!] 检测到服务已在运行（端口 8000 已被占用）"
    echo "  [!] 如需重启，请先运行 ./stop.sh"
    echo ""
    xdg-open http://127.0.0.1:5173 2>/dev/null || open http://127.0.0.1:5173 2>/dev/null || true
    exit 0
fi

# ---- Cleanup function ----
cleanup() {
    echo ""
    echo "  Stopping..."
    # Kill direct PIDs
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    sleep 1
    # Kill their child processes (uvicorn workers, node, etc.)
    pkill -P $BACKEND_PID 2>/dev/null
    pkill -P $FRONTEND_PID 2>/dev/null
    # Fallback: kill anything still on the ports
    if command -v fuser >/dev/null 2>&1; then
        fuser -k 8000/tcp 2>/dev/null
        fuser -k 5173/tcp 2>/dev/null
    fi
    echo "  服务已停止。"
    exit 0
}

trap cleanup INT TERM

# ---- Start backend ----
echo "[1/2] Starting backend (FastAPI)..."
cd "$SCRIPT_DIR/backend"
uvicorn main:app --host 127.0.0.1 --port 8000 --reload &
BACKEND_PID=$!

# ---- Start frontend dev server ----
echo "[2/2] Starting frontend (Vite)..."
cd "$SCRIPT_DIR/frontend"
npx vite --host 127.0.0.1 --port 5173 &
FRONTEND_PID=$!

echo ""
echo "============================================"
echo "  Backend:  http://127.0.0.1:8000"
echo "  Frontend: http://127.0.0.1:5173"
echo "  API Docs: http://127.0.0.1:8000/docs"
echo "============================================"
echo "  Press Ctrl+C to stop both servers"
echo "  也可运行 ./stop.sh 停止服务"
echo "============================================"

# Open browser after short delay
sleep 3
xdg-open http://127.0.0.1:5173 2>/dev/null || open http://127.0.0.1:5173 2>/dev/null || true

wait
