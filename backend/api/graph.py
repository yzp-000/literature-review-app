"""Graph API routes."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services import graph_service

router = APIRouter(prefix="/api/workspaces/{workspace}/graph", tags=["graph"])


class RelationRequest(BaseModel):
    source_id: str
    target_id: str
    relation_type: str


@router.get("")
async def get_graph(workspace: str):
    return graph_service.get_graph_data(workspace)


@router.get("/papers/{paper_id}/relations")
async def get_paper_relations(workspace: str, paper_id: str):
    return graph_service.get_paper_relations(workspace, paper_id)


@router.post("/relations")
async def add_relation(workspace: str, req: RelationRequest):
    try:
        return graph_service.add_relation(workspace, req.source_id, req.target_id, req.relation_type)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/relations")
async def remove_relation(workspace: str, req: RelationRequest):
    return graph_service.remove_relation(workspace, req.source_id, req.target_id, req.relation_type)
