"""Paper service — CRUD operations on papers.json."""
import json
import uuid
from datetime import datetime
from pathlib import Path

from models import Paper, PaperCreate, PaperUpdate
from services.workspace_service import get_workspace_path
from config import load_config, DEFAULT_NOTE_TEMPLATE


def _papers_file(workspace: str) -> Path:
    return get_workspace_path(workspace) / "papers.json"


def _load_papers(workspace: str) -> dict:
    pf = _papers_file(workspace)
    if not pf.exists():
        return {"papers": [], "categories": []}
    return json.loads(pf.read_text(encoding="utf-8"))


def _save_papers(workspace: str, data: dict):
    pf = _papers_file(workspace)
    pf.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def list_papers(workspace: str, status: str | None = None, keyword: str | None = None) -> list[dict]:
    data = _load_papers(workspace)
    papers = data.get("papers", [])
    if status:
        papers = [p for p in papers if p.get("status") == status]
    if keyword:
        kw = keyword.lower()
        papers = [
            p
            for p in papers
            if kw in p.get("title_zh", "").lower()
            or kw in p.get("title_en", "").lower()
            or kw in " ".join(p.get("keywords", [])).lower()
            or kw in " ".join(p.get("authors", [])).lower()
        ]
    return papers


def get_paper(workspace: str, paper_id: str) -> dict | None:
    data = _load_papers(workspace)
    for p in data.get("papers", []):
        if p["id"] == paper_id:
            return p
    return None


def create_paper(workspace: str, paper_in: PaperCreate) -> dict:
    data = _load_papers(workspace)
    papers = data.get("papers", [])

    # Determine next number
    max_num = 0
    for p in papers:
        if p.get("number", 0) > max_num:
            max_num = p["number"]
    next_num = max_num + 1

    title = paper_in.title_zh or paper_in.title_en or "未命名"
    md_filename = f"{next_num:02d}_{title}.md"
    md_path = f"01_单篇论文/{md_filename}"

    paper = Paper(
        id=str(uuid.uuid4())[:8],
        number=next_num,
        markdown_path=md_path,
        **paper_in.model_dump(),
    )
    paper_dict = paper.model_dump()
    papers.append(paper_dict)
    data["papers"] = papers
    _save_papers(workspace, data)

    # Create markdown file from template
    ws_path = get_workspace_path(workspace)
    md_full_path = ws_path / md_path
    md_full_path.parent.mkdir(parents=True, exist_ok=True)
    if not md_full_path.exists():
        md_content = _generate_paper_note_template(paper_dict)
        md_full_path.write_text(md_content, encoding="utf-8")

    return paper_dict


def update_paper(workspace: str, paper_id: str, update: PaperUpdate) -> dict | None:
    data = _load_papers(workspace)
    papers = data.get("papers", [])
    for i, p in enumerate(papers):
        if p["id"] == paper_id:
            update_data = update.model_dump(exclude_none=True)
            # Handle relations serialization
            if "relations" in update_data:
                update_data["relations"] = [
                    r.model_dump() if hasattr(r, "model_dump") else r
                    for r in update_data["relations"]
                ]
            p.update(update_data)
            p["updated_at"] = datetime.now().isoformat()
            papers[i] = p
            data["papers"] = papers
            _save_papers(workspace, data)
            return p
    return None


def delete_paper(workspace: str, paper_id: str) -> bool:
    data = _load_papers(workspace)
    papers = data.get("papers", [])
    new_papers = [p for p in papers if p["id"] != paper_id]
    if len(new_papers) == len(papers):
        return False
    data["papers"] = new_papers
    _save_papers(workspace, data)
    return True


def _generate_paper_note_template(paper: dict) -> str:
    """Generate a paper note from the configured template (or default 7-section template)."""
    config = load_config()
    template = config.get("note_template", "").strip() or DEFAULT_NOTE_TEMPLATE

    title = paper.get("title_zh") or paper.get("title_en") or "未命名"
    authors = ", ".join(paper.get("authors", []))
    year = str(paper.get("year") or "")
    journal = paper.get("journal") or ""
    doi = paper.get("doi") or ""
    keywords = ", ".join(paper.get("keywords") or [])

    result = template
    result = result.replace("{{title}}", title)
    result = result.replace("{{title_zh}}", paper.get("title_zh") or "")
    result = result.replace("{{title_en}}", paper.get("title_en") or "")
    result = result.replace("{{authors}}", authors)
    result = result.replace("{{year}}", year)
    result = result.replace("{{journal}}", journal)
    result = result.replace("{{doi}}", doi)
    result = result.replace("{{keywords}}", keywords)

    return result
