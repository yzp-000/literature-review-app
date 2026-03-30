"""Search service — LLM-powered literature search, auto-import, PDF download."""
import json
import logging
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import AsyncIterator

import httpx

from models import PaperCreate
from services import llm_service, paper_service, pdf_service
from services.workspace_service import get_workspace_path

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Search history persistence
# ---------------------------------------------------------------------------

def _history_file(workspace: str) -> Path:
    return get_workspace_path(workspace) / "search_history.json"


def _load_history(workspace: str) -> list[dict]:
    hf = _history_file(workspace)
    if hf.exists():
        try:
            return json.loads(hf.read_text(encoding="utf-8"))
        except Exception:
            return []
    return []


def _save_history(workspace: str, history: list[dict]):
    hf = _history_file(workspace)
    hf.write_text(json.dumps(history, ensure_ascii=False, indent=2), encoding="utf-8")


def list_history(workspace: str) -> list[dict]:
    return _load_history(workspace)


def get_history(workspace: str, search_id: str) -> dict | None:
    for h in _load_history(workspace):
        if h["id"] == search_id:
            return h
    return None


def delete_history(workspace: str, search_id: str) -> bool:
    history = _load_history(workspace)
    new_history = [h for h in history if h["id"] != search_id]
    if len(new_history) == len(history):
        return False
    _save_history(workspace, new_history)
    return True


def _append_history(workspace: str, record: dict):
    history = _load_history(workspace)
    history.insert(0, record)
    # Keep at most 50 records
    if len(history) > 50:
        history = history[:50]
    _save_history(workspace, history)


def _update_history(workspace: str, search_id: str, updates: dict):
    history = _load_history(workspace)
    for h in history:
        if h["id"] == search_id:
            h.update(updates)
            break
    _save_history(workspace, history)


# ---------------------------------------------------------------------------
# PDF download helpers
# ---------------------------------------------------------------------------

async def _try_download_pdf(doi: str, arxiv_id: str, workspace: str) -> str | None:
    """Try to download a PDF. Returns the relative path if successful, None otherwise."""
    ws_path = get_workspace_path(workspace)
    pdfs_dir = ws_path / "pdfs"
    pdfs_dir.mkdir(parents=True, exist_ok=True)

    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        # 1) Try arXiv if we have an arXiv ID
        if arxiv_id:
            aid = arxiv_id.strip()
            # normalise: remove "arXiv:" prefix if present
            if aid.lower().startswith("arxiv:"):
                aid = aid[6:]
            pdf_url = f"https://arxiv.org/pdf/{aid}.pdf"
            try:
                resp = await client.get(pdf_url)
                if resp.status_code == 200 and len(resp.content) > 10000:
                    fname = f"{aid.replace('/', '_')}.pdf"
                    dest = pdfs_dir / fname
                    dest.write_bytes(resp.content)
                    logger.info("Downloaded arXiv PDF: %s", fname)
                    return f"pdfs/{fname}"
            except Exception as e:
                logger.warning("arXiv download failed for %s: %s", aid, e)

        # 2) Try Unpaywall (free open-access lookup by DOI)
        if doi:
            try:
                unpaywall_url = f"https://api.unpaywall.org/v2/{doi}?email=litreview@example.com"
                resp = await client.get(unpaywall_url)
                if resp.status_code == 200:
                    data = resp.json()
                    oa_url = None
                    best = data.get("best_oa_location")
                    if best:
                        oa_url = best.get("url_for_pdf") or best.get("url")
                    if oa_url:
                        pdf_resp = await client.get(oa_url)
                        if pdf_resp.status_code == 200 and len(pdf_resp.content) > 10000:
                            safe_doi = re.sub(r'[^\w\-.]', '_', doi)
                            fname = f"{safe_doi}.pdf"
                            dest = pdfs_dir / fname
                            dest.write_bytes(pdf_resp.content)
                            logger.info("Downloaded OA PDF via Unpaywall: %s", fname)
                            return f"pdfs/{fname}"
            except Exception as e:
                logger.warning("Unpaywall download failed for DOI %s: %s", doi, e)

    return None


# ---------------------------------------------------------------------------
# CrossRef metadata verification
# ---------------------------------------------------------------------------

async def _crossref_search(title: str) -> dict | None:
    """Search CrossRef by title to get verified metadata."""
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                "https://api.crossref.org/works",
                params={"query.title": title, "rows": 1},
            )
            if resp.status_code != 200:
                return None
            data = resp.json()
            items = data.get("message", {}).get("items", [])
            if not items:
                return None
            item = items[0]
            # Extract metadata
            result = {}
            titles = item.get("title", [])
            if titles:
                result["title_en"] = titles[0]
            authors_raw = item.get("author", [])
            result["authors"] = [
                f"{a.get('given', '')} {a.get('family', '')}".strip()
                for a in authors_raw
            ]
            doi = item.get("DOI", "")
            result["doi"] = doi
            # Year
            issued = item.get("issued", {}).get("date-parts", [[]])
            if issued and issued[0]:
                result["year"] = issued[0][0]
            # Journal
            containers = item.get("container-title", [])
            if containers:
                result["journal"] = containers[0]
            return result
    except Exception as e:
        logger.warning("CrossRef search failed: %s", e)
        return None


# ---------------------------------------------------------------------------
# Core search flow (SSE streaming)
# ---------------------------------------------------------------------------

async def search_literature(
    workspace: str,
    direction: str,
    paper_count: int = 10,
    year_start: int | None = None,
    year_end: int | None = None,
    extra_requirements: str = "",
    provider_id: str | None = None,
    auto_import: bool = True,
    auto_generate_notes: bool = False,
) -> AsyncIterator[dict]:
    """
    Generator that yields SSE-friendly dicts with progress updates.

    Stages:
    1. Ask LLM to recommend papers → yield {stage: "llm", ...}
    2. Verify & enrich via CrossRef   → yield {stage: "verify", ...}
    3. Try downloading PDFs            → yield {stage: "download", ...}
    4. Auto-import into workspace      → yield {stage: "import", ...}
    5. Generate notes (optional)       → yield {stage: "generate", ...}
    6. Done                            → yield {stage: "done", ...}
    """
    search_id = str(uuid.uuid4())[:8]

    # Build year constraint string
    year_str = ""
    if year_start and year_end:
        year_str = f"发表年份限制在 {year_start}-{year_end} 年之间"
    elif year_start:
        year_str = f"发表年份不早于 {year_start} 年"
    elif year_end:
        year_str = f"发表年份不晚于 {year_end} 年"

    extra_parts = []
    if year_str:
        extra_parts.append(year_str)
    if extra_requirements.strip():
        extra_parts.append(extra_requirements.strip())
    constraints = "；".join(extra_parts) if extra_parts else "无特别要求"

    # -- Stage 1: LLM paper recommendation --
    yield {"stage": "llm", "message": "正在使用 AI 检索相关文献..."}

    system_prompt = (
        "你是一位学术文献检索助手。用户会给出研究方向和要求，你需要推荐真实存在的学术论文。\n"
        "你必须返回一个 JSON 数组，每个元素包含以下字段：\n"
        "  title_en: 英文标题 (必填)\n"
        "  title_zh: 中文标题 (如有)\n"
        "  authors: 作者列表 (数组)\n"
        "  year: 发表年份 (整数)\n"
        "  journal: 期刊或会议名称\n"
        "  doi: DOI (如果知道)\n"
        "  arxiv_id: arXiv 编号 (如果知道，如 2301.12345)\n"
        "  keywords: 关键词列表 (数组)\n"
        "  summary: 一句话摘要 (中文)\n\n"
        "注意：\n"
        "1. 只推荐你确信真实存在的论文，不要编造。\n"
        "2. 尽可能提供 DOI 或 arXiv ID，方便后续验证和下载。\n"
        "3. 严格只输出 JSON 数组，不要输出其他内容。不要用 markdown 代码块包裹。\n"
    )

    user_prompt = (
        f"研究方向：{direction}\n"
        f"需要推荐的论文数量：{paper_count} 篇\n"
        f"额外要求：{constraints}\n\n"
        f"请推荐 {paper_count} 篇相关论文，以 JSON 数组格式返回。"
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    llm_text = ""
    try:
        async for chunk in llm_service.chat_stream(messages, provider_id):
            llm_text += chunk
            yield {"stage": "llm_stream", "content": chunk}
    except Exception as e:
        yield {"stage": "error", "message": f"LLM 调用失败: {e}"}
        return

    # Parse JSON from LLM response
    papers_raw = _parse_papers_json(llm_text)
    if not papers_raw:
        yield {"stage": "error", "message": "AI 返回结果解析失败，请重试"}
        return

    yield {"stage": "llm_done", "message": f"AI 推荐了 {len(papers_raw)} 篇论文", "count": len(papers_raw)}

    # -- Stage 2: CrossRef verification & enrichment --
    yield {"stage": "verify", "message": "正在通过学术数据库验证论文信息..."}

    verified_papers = []
    for i, raw in enumerate(papers_raw):
        title = raw.get("title_en") or raw.get("title_zh") or ""
        yield {"stage": "verify_progress", "current": i + 1, "total": len(papers_raw), "title": title}

        # Try CrossRef to verify & enrich
        cr = await _crossref_search(title) if title else None
        if cr:
            # Merge: CrossRef data takes priority for doi/year/journal/authors
            if cr.get("doi"):
                raw["doi"] = cr["doi"]
            if cr.get("year"):
                raw["year"] = cr["year"]
            if cr.get("journal"):
                raw["journal"] = cr["journal"]
            if cr.get("authors") and len(cr["authors"]) > 0:
                raw["authors"] = cr["authors"]
            if cr.get("title_en"):
                raw["title_en"] = cr["title_en"]
            raw["_verified"] = True
        else:
            raw["_verified"] = False

        verified_papers.append(raw)

    yield {"stage": "verify_done", "message": f"验证完成，{sum(1 for p in verified_papers if p.get('_verified'))} 篇已通过学术数据库确认"}

    # -- Stage 3: Try downloading PDFs --
    yield {"stage": "download", "message": "正在尝试下载可获取的 PDF..."}

    for i, paper in enumerate(verified_papers):
        doi = paper.get("doi", "")
        arxiv_id = paper.get("arxiv_id", "")
        title = paper.get("title_en") or paper.get("title_zh") or ""
        yield {"stage": "download_progress", "current": i + 1, "total": len(verified_papers), "title": title}

        if doi or arxiv_id:
            pdf_path = await _try_download_pdf(doi, arxiv_id, workspace)
            paper["_pdf_path"] = pdf_path or ""
        else:
            paper["_pdf_path"] = ""

    downloaded = sum(1 for p in verified_papers if p.get("_pdf_path"))
    yield {"stage": "download_done", "message": f"PDF 下载完成：{downloaded}/{len(verified_papers)} 篇成功"}

    # -- Stage 4: Auto-import into workspace --
    if auto_import:
        yield {"stage": "import", "message": "正在将论文导入文献库..."}

        imported_papers = []
        for i, paper in enumerate(verified_papers):
            title = paper.get("title_en") or paper.get("title_zh") or "未命名"
            yield {"stage": "import_progress", "current": i + 1, "total": len(verified_papers), "title": title}

            paper_create = PaperCreate(
                title_zh=paper.get("title_zh", ""),
                title_en=paper.get("title_en", ""),
                authors=paper.get("authors", []),
                year=paper.get("year"),
                journal=paper.get("journal", ""),
                doi=paper.get("doi", ""),
                keywords=paper.get("keywords", []),
                pdf_path=paper.get("_pdf_path", ""),
                status="unread",
            )
            try:
                created = paper_service.create_paper(workspace, paper_create)
                imported_papers.append({
                    "id": created["id"],
                    "number": created["number"],
                    "title_en": paper.get("title_en", ""),
                    "title_zh": paper.get("title_zh", ""),
                    "authors": paper.get("authors", []),
                    "year": paper.get("year"),
                    "journal": paper.get("journal", ""),
                    "doi": paper.get("doi", ""),
                    "keywords": paper.get("keywords", []),
                    "summary": paper.get("summary", ""),
                    "verified": paper.get("_verified", False),
                    "has_pdf": bool(paper.get("_pdf_path")),
                })
            except Exception as e:
                logger.error("Failed to import paper %s: %s", title, e)
                imported_papers.append({
                    "title_en": paper.get("title_en", ""),
                    "title_zh": paper.get("title_zh", ""),
                    "error": str(e),
                    "verified": paper.get("_verified", False),
                    "has_pdf": False,
                })

        yield {"stage": "import_done", "message": f"已导入 {len(imported_papers)} 篇论文到文献库"}

        # -- Stage 5: Generate notes (optional) --
        if auto_generate_notes:
            papers_to_gen = [p for p in imported_papers if p.get("id")]
            yield {"stage": "generate", "message": f"正在为 {len(papers_to_gen)} 篇论文生成 AI 总结..."}

            for i, ip in enumerate(papers_to_gen):
                title = ip.get("title_en") or ip.get("title_zh") or "未命名"
                yield {"stage": "generate_progress", "current": i + 1, "total": len(papers_to_gen), "title": title}

                try:
                    note_content = await _generate_note_for_paper(
                        workspace, ip, provider_id
                    )
                    if note_content:
                        # Write generated content into the markdown file
                        paper_data = paper_service.get_paper(workspace, ip["id"])
                        if paper_data and paper_data.get("markdown_path"):
                            md_path = get_workspace_path(workspace) / paper_data["markdown_path"]
                            md_path.parent.mkdir(parents=True, exist_ok=True)
                            md_path.write_text(note_content, encoding="utf-8")
                        ip["note_generated"] = True
                    else:
                        ip["note_generated"] = False
                except Exception as e:
                    logger.error("Failed to generate note for %s: %s", title, e)
                    ip["note_generated"] = False

            gen_count = sum(1 for p in papers_to_gen if p.get("note_generated"))
            yield {"stage": "generate_done", "message": f"总结生成完成：{gen_count}/{len(papers_to_gen)} 篇成功"}
    else:
        imported_papers = []
        for paper in verified_papers:
            imported_papers.append({
                "title_en": paper.get("title_en", ""),
                "title_zh": paper.get("title_zh", ""),
                "authors": paper.get("authors", []),
                "year": paper.get("year"),
                "journal": paper.get("journal", ""),
                "doi": paper.get("doi", ""),
                "summary": paper.get("summary", ""),
                "verified": paper.get("_verified", False),
                "has_pdf": False,
            })

    # -- Save search history --
    record = {
        "id": search_id,
        "timestamp": datetime.now().isoformat(),
        "params": {
            "direction": direction,
            "paper_count": paper_count,
            "year_start": year_start,
            "year_end": year_end,
            "extra_requirements": extra_requirements,
        },
        "results": imported_papers,
        "stats": {
            "total": len(imported_papers),
            "verified": sum(1 for p in imported_papers if p.get("verified")),
            "has_pdf": sum(1 for p in imported_papers if p.get("has_pdf")),
            "notes_generated": sum(1 for p in imported_papers if p.get("note_generated")),
        },
    }
    _append_history(workspace, record)

    yield {
        "stage": "done",
        "message": "检索完成",
        "search_id": search_id,
        "results": imported_papers,
        "stats": record["stats"],
    }


def _parse_papers_json(text: str) -> list[dict] | None:
    """Parse JSON array of papers from LLM output."""
    # Strip markdown code fences if present
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        # Remove first and last lines (fences)
        start = 1
        end = len(lines)
        for i in range(len(lines) - 1, 0, -1):
            if lines[i].strip().startswith("```"):
                end = i
                break
        text = "\n".join(lines[start:end]).strip()

    # Try direct parse
    try:
        data = json.loads(text)
        if isinstance(data, list):
            return data
        if isinstance(data, dict) and "papers" in data:
            return data["papers"]
    except json.JSONDecodeError:
        pass

    # Try to find JSON array in the text
    match = re.search(r'\[[\s\S]*\]', text)
    if match:
        try:
            data = json.loads(match.group())
            if isinstance(data, list):
                return data
        except json.JSONDecodeError:
            pass

    return None


# ---------------------------------------------------------------------------
# Note generation helper
# ---------------------------------------------------------------------------

async def _generate_note_for_paper(
    workspace: str, paper_info: dict, provider_id: str | None
) -> str | None:
    """Generate a 7-section note for a paper. Returns full markdown or None."""
    title = paper_info.get("title_en") or paper_info.get("title_zh") or "未命名"
    title_zh = paper_info.get("title_zh", "")
    authors = ", ".join(paper_info.get("authors", []))
    year = paper_info.get("year", "")
    journal = paper_info.get("journal", "")
    doi = paper_info.get("doi", "")
    keywords = ", ".join(paper_info.get("keywords", []))
    summary = paper_info.get("summary", "")

    # Try to get PDF text if available
    pdf_text = ""
    paper_data = paper_service.get_paper(workspace, paper_info["id"])
    if paper_data:
        pdf_path_str = paper_data.get("pdf_path", "")
        if pdf_path_str:
            full = get_workspace_path(workspace) / pdf_path_str
            if full.exists():
                pdf_text = pdf_service.extract_text(full, max_pages=15)
                if len(pdf_text) > 30000:
                    pdf_text = pdf_text[:30000] + "\n\n[... 文本已截断 ...]"

    system_prompt = (
        "你是一位学术论文阅读助手。请根据提供的论文信息，撰写结构化的论文笔记。"
        "要求使用中文撰写，内容详实、准确。"
        "严格按照以下 Markdown 格式输出，不要添加额外章节或更改章节编号。"
    )

    if pdf_text:
        source_section = f"## 论文全文（部分）\n{pdf_text}"
        detail_hint = "根据论文全文，每一节都要详细填写（每节至少 3-5 句话）"
    else:
        source_section = f"## 已知摘要\n{summary}" if summary else ""
        detail_hint = (
            "注意：没有论文全文，请根据你对该论文的了解尽可能详细地填写各节内容。"
            "如果某些细节不确定，可以标注「（待补充 — 需阅读原文确认）」"
        )

    user_prompt = f"""请为以下论文生成 7 节结构化阅读笔记。

## 论文信息
- 标题(英): {title}
- 标题(中): {title_zh}
- 作者: {authors}
- 年份: {year}
- 期刊/会议: {journal}
- DOI: {doi}
- 关键词: {keywords}

{source_section}

---

{detail_hint}

请严格按照以下完整格式输出（包含第1节基本信息表格）：

# {title_zh or title}

> **作者**: {authors}
> **年份**: {year}
> **期刊/会议**: {journal}

---

## 1. 论文基本信息

| 项目 | 内容 |
|------|------|
| 标题(中) | {title_zh} |
| 标题(英) | {title} |
| 作者 | {authors} |
| 年份 | {year} |
| 期刊/会议 | {journal} |
| DOI | {doi} |
| 关键词 | {keywords} |

## 2. 研究背景与动机

（阐述该研究领域的背景、存在的问题、以及本文的研究动机）

## 3. 核心方法与技术路线

（详细描述论文提出的方法、算法、模型架构或技术路线）

## 4. 实验设计与结果

（描述实验设置、数据集、基线对比、主要实验结果和关键数据）

## 5. 创新点与贡献

（总结论文的主要创新点和学术贡献）

## 6. 局限性与未来工作

（分析论文的不足之处和作者提出的未来研究方向）

## 7. 个人评价与笔记

（从学术价值、方法新颖性、实验充分性等角度给出客观评价）"""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    note_text = ""
    try:
        async for chunk in llm_service.chat_stream(messages, provider_id):
            note_text += chunk
    except Exception as e:
        logger.error("Note generation LLM call failed for %s: %s", title, e)
        return None

    if not note_text.strip():
        return None

    return note_text
