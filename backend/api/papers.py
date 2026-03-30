"""Paper API routes."""
from fastapi import APIRouter, HTTPException, Query
from typing import Optional

from models import PaperCreate, PaperUpdate
from services import paper_service

router = APIRouter(prefix="/api/workspaces/{workspace}/papers", tags=["papers"])


@router.get("")
async def list_papers(
    workspace: str,
    status: Optional[str] = Query(None),
    keyword: Optional[str] = Query(None),
):
    return paper_service.list_papers(workspace, status=status, keyword=keyword)


@router.post("")
async def create_paper(workspace: str, body: PaperCreate):
    return paper_service.create_paper(workspace, body)


@router.get("/{paper_id}")
async def get_paper(workspace: str, paper_id: str):
    paper = paper_service.get_paper(workspace, paper_id)
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    return paper


@router.put("/{paper_id}")
async def update_paper(workspace: str, paper_id: str, body: PaperUpdate):
    paper = paper_service.update_paper(workspace, paper_id, body)
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    return paper


@router.delete("/{paper_id}")
async def delete_paper(workspace: str, paper_id: str):
    ok = paper_service.delete_paper(workspace, paper_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Paper not found")
    return {"ok": True}
