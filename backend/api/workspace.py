"""Workspace API routes."""
from fastapi import APIRouter, HTTPException

from models import WorkspaceCreate
from services import workspace_service

router = APIRouter(prefix="/api/workspaces", tags=["workspaces"])


@router.get("")
async def list_workspaces():
    return workspace_service.list_workspaces()


@router.post("")
async def create_workspace(body: WorkspaceCreate):
    try:
        return workspace_service.create_workspace(body.name)
    except FileExistsError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.get("/{name}")
async def get_workspace(name: str):
    ws = workspace_service.get_workspace(name)
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return ws


@router.delete("/{name}")
async def delete_workspace(name: str):
    ok = workspace_service.delete_workspace(name)
    if not ok:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return {"ok": True}
