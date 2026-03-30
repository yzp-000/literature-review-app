"""Markdown service — read/write markdown files."""
from pathlib import Path

from services.workspace_service import get_workspace_path


def read_markdown(workspace: str, relative_path: str) -> str | None:
    """Read a markdown file from a workspace."""
    ws_path = get_workspace_path(workspace)
    file_path = ws_path / relative_path
    # Security: ensure the path is within the workspace
    try:
        file_path.resolve().relative_to(ws_path.resolve())
    except ValueError:
        return None
    if not file_path.exists():
        return None
    return file_path.read_text(encoding="utf-8")


def write_markdown(workspace: str, relative_path: str, content: str) -> bool:
    """Write content to a markdown file in a workspace."""
    ws_path = get_workspace_path(workspace)
    file_path = ws_path / relative_path
    # Security: ensure the path is within the workspace
    try:
        file_path.resolve().relative_to(ws_path.resolve())
    except ValueError:
        return False
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_text(content, encoding="utf-8")
    return True


def list_markdown_files(workspace: str) -> list[dict]:
    """List all markdown files in a workspace."""
    ws_path = get_workspace_path(workspace)
    if not ws_path.exists():
        return []
    files = []
    for md_file in sorted(ws_path.rglob("*.md")):
        rel = str(md_file.relative_to(ws_path))
        stat = md_file.stat()
        files.append(
            {
                "path": rel,
                "name": md_file.name,
                "size": stat.st_size,
                "modified_at": stat.st_mtime,
            }
        )
    return files
