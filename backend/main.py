"""FastAPI application entry point."""
import sys
from pathlib import Path

# Add backend directory to path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from api import workspace, papers, files, pdf, llm, graph, export, settings, search, writing

app = FastAPI(
    title="文献调研管理系统",
    description="Literature Review Management System",
    version="0.1.0",
)

# CORS for frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(workspace.router)
app.include_router(papers.router)
app.include_router(files.router)
app.include_router(pdf.router)
app.include_router(llm.router)
app.include_router(graph.router)
app.include_router(export.router)
app.include_router(settings.router)
app.include_router(search.router)
app.include_router(writing.router)


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "version": "0.1.0"}


# Serve frontend static files in production
frontend_dist = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend")
