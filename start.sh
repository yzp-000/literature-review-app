#!/bin/bash
# Start the Literature Review Management App
# Usage: ./start.sh
# Backend: http://localhost:8000
# Frontend: http://localhost:5173

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "============================================"
echo "  文献调研管理系统 — Literature Review App"
echo "============================================"

# Start backend
echo "[1/2] Starting backend (FastAPI)..."
cd "$SCRIPT_DIR/backend"
uvicorn main:app --host 127.0.0.1 --port 8000 --reload &
BACKEND_PID=$!

# Start frontend dev server
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
echo "============================================"

# Trap Ctrl+C to stop both
trap "echo 'Stopping...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM
wait
