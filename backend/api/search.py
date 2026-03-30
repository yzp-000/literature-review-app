"""Search API routes — literature search with SSE streaming."""
import json
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from services import search_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/search", tags=["search"])


class SearchRequest(BaseModel):
    workspace: str
    direction: str
    paper_count: int = 10
    year_start: Optional[int] = None
    year_end: Optional[int] = None
    extra_requirements: str = ""
    provider_id: Optional[str] = None
    auto_import: bool = True
    auto_generate_notes: bool = False


@router.post("/start")
async def start_search(body: SearchRequest):
    """Start a literature search. Returns SSE stream with progress updates."""

    async def event_generator():
        try:
            async for update in search_service.search_literature(
                workspace=body.workspace,
                direction=body.direction,
                paper_count=body.paper_count,
                year_start=body.year_start,
                year_end=body.year_end,
                extra_requirements=body.extra_requirements,
                provider_id=body.provider_id,
                auto_import=body.auto_import,
                auto_generate_notes=body.auto_generate_notes,
            ):
                yield {"event": "message", "data": json.dumps(update, ensure_ascii=False)}
        except Exception as e:
            logger.error("Search failed: %s", e)
            yield {"event": "message", "data": json.dumps({"stage": "error", "message": str(e)})}

    return EventSourceResponse(event_generator())


@router.get("/history")
async def get_history(workspace: str = Query(...)):
    """Get search history for a workspace."""
    return search_service.list_history(workspace)


@router.get("/history/{search_id}")
async def get_history_detail(search_id: str, workspace: str = Query(...)):
    """Get a single search history record."""
    record = search_service.get_history(workspace, search_id)
    if not record:
        raise HTTPException(status_code=404, detail="搜索记录不存在")
    return record


@router.delete("/history/{search_id}")
async def delete_history_record(search_id: str, workspace: str = Query(...)):
    """Delete a single search history record."""
    if search_service.delete_history(workspace, search_id):
        return {"ok": True}
    raise HTTPException(status_code=404, detail="记录不存在")
