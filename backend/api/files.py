"""Markdown file API routes."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services import markdown_service

router = APIRouter(prefix="/api/workspaces/{workspace}/files", tags=["files"])


class FileWriteRequest(BaseModel):
    content: str


@router.get("")
async def list_files(workspace: str):
    return markdown_service.list_markdown_files(workspace)


@router.get("/read")
async def read_file(workspace: str, path: str):
    content = markdown_service.read_markdown(workspace, path)
    if content is None:
        raise HTTPException(status_code=404, detail="File not found")
    return {"path": path, "content": content}


@router.post("/write")
async def write_file(workspace: str, path: str, body: FileWriteRequest):
    ok = markdown_service.write_markdown(workspace, path, body.content)
    if not ok:
        raise HTTPException(status_code=400, detail="Invalid path")
    return {"ok": True}
