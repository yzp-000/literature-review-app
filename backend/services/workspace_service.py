"""Workspace service — manages topics/workspaces."""
import json
import os
from datetime import datetime
from pathlib import Path

from config import get_base_dir

WORKSPACE_SUFFIX = "_文献调研"


def list_workspaces() -> list[dict]:
    """Scan base_dir for workspace directories."""
    base_dir = get_base_dir()
    workspaces = []
    if not base_dir.exists():
        return workspaces
    for entry in sorted(base_dir.iterdir()):
        if entry.is_dir() and entry.name.endswith(WORKSPACE_SUFFIX):
            topic_name = entry.name[: -len(WORKSPACE_SUFFIX)]
            papers_file = entry / "papers.json"
            paper_count = 0
            if papers_file.exists():
                try:
                    data = json.loads(papers_file.read_text(encoding="utf-8"))
                    paper_count = len(data.get("papers", []))
                except (json.JSONDecodeError, KeyError):
                    pass
            stat = entry.stat()
            workspaces.append(
                {
                    "name": topic_name,
                    "path": str(entry),
                    "paper_count": paper_count,
                    "created_at": datetime.fromtimestamp(stat.st_ctime).isoformat(),
                }
            )
    return workspaces


def create_workspace(name: str) -> dict:
    """Create a new workspace directory with standard sub-folders."""
    base_dir = get_base_dir()
    ws_dir = base_dir / f"{name}{WORKSPACE_SUFFIX}"
    if ws_dir.exists():
        raise FileExistsError(f"Workspace '{name}' already exists")
    ws_dir.mkdir(parents=True)
    (ws_dir / "pdfs").mkdir()
    (ws_dir / "00_总览总结").mkdir()
    (ws_dir / "01_单篇论文").mkdir()
    (ws_dir / "02_关键技术总结").mkdir()

    # Initialize papers.json
    papers_data = {"papers": [], "categories": []}
    (ws_dir / "papers.json").write_text(
        json.dumps(papers_data, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    # Initialize overview markdown
    overview_dir = ws_dir / "00_总览总结"
    (overview_dir / "总览总结.md").write_text(
        f"# {name} — 文献调研总览\n\n> 自动生成文档，可手动编辑补充。\n\n## 研究概述\n\n（待填写）\n\n## 论文列表\n\n（待生成）\n",
        encoding="utf-8",
    )

    stat = ws_dir.stat()
    return {
        "name": name,
        "path": str(ws_dir),
        "paper_count": 0,
        "created_at": datetime.fromtimestamp(stat.st_ctime).isoformat(),
    }


def get_workspace(name: str) -> dict | None:
    """Get a specific workspace by name."""
    base_dir = get_base_dir()
    ws_dir = base_dir / f"{name}{WORKSPACE_SUFFIX}"
    if not ws_dir.exists():
        return None
    papers_file = ws_dir / "papers.json"
    paper_count = 0
    if papers_file.exists():
        try:
            data = json.loads(papers_file.read_text(encoding="utf-8"))
            paper_count = len(data.get("papers", []))
        except (json.JSONDecodeError, KeyError):
            pass
    stat = ws_dir.stat()
    return {
        "name": name,
        "path": str(ws_dir),
        "paper_count": paper_count,
        "created_at": datetime.fromtimestamp(stat.st_ctime).isoformat(),
    }


def delete_workspace(name: str) -> bool:
    """Delete a workspace (move to trash or remove)."""
    import shutil

    base_dir = get_base_dir()
    ws_dir = base_dir / f"{name}{WORKSPACE_SUFFIX}"
    if not ws_dir.exists():
        return False
    shutil.rmtree(ws_dir)
    return True


def get_workspace_path(name: str) -> Path:
    """Return the Path object for a workspace."""
    base_dir = get_base_dir()
    return base_dir / f"{name}{WORKSPACE_SUFFIX}"
