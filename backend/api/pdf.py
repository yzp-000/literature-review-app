"""PDF API routes."""
from fastapi import APIRouter, HTTPException, UploadFile, File, Query
from fastapi.responses import FileResponse
from typing import Optional

from services import pdf_service
from services.workspace_service import get_workspace_path
from models import PaperUpdate

router = APIRouter(prefix="/api/workspaces/{workspace}/pdf", tags=["pdf"])


@router.post("/upload")
async def upload_pdf(workspace: str, file: UploadFile = File(...), paper_id: Optional[str] = Query(None)):
    """Upload a PDF, extract metadata, optionally link to an existing paper."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    content = await file.read()
    rel_path = pdf_service.save_pdf(workspace, file.filename, content)

    # Deep metadata extraction
    ws_path = get_workspace_path(workspace)
    full_path = ws_path / rel_path
    metadata = pdf_service.extract_metadata(full_path)
    metadata["pdf_path"] = rel_path

    # If paper_id provided, link PDF to that paper
    if paper_id:
        from services.paper_service import _load_papers, _save_papers
        data = _load_papers(workspace)
        for p in data["papers"]:
            if p["id"] == paper_id:
                p["pdf_path"] = rel_path
                break
        _save_papers(workspace, data)

    return {"path": rel_path, "metadata": metadata}


@router.get("/view")
async def view_pdf(workspace: str, path: str):
    """Serve a PDF file for viewing."""
    file_path = pdf_service.get_pdf_path(workspace, path)
    if not file_path:
        raise HTTPException(status_code=404, detail="PDF not found")
    return FileResponse(file_path, media_type="application/pdf")


@router.get("/extract_text")
async def extract_text(workspace: str, path: str, max_pages: int = Query(default=0)):
    """Extract text content from a PDF. max_pages=0 means all pages."""
    file_path = pdf_service.get_pdf_path(workspace, path)
    if not file_path:
        raise HTTPException(status_code=404, detail="PDF not found")
    text = pdf_service.extract_text(file_path, max_pages=max_pages)
    return {"text": text, "length": len(text)}
