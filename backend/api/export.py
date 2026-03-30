"""Export API routes — PDF export via HTML + AI summary generation."""
import json
import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse
from typing import Optional

from models import ExportRequest
from services import export_service, llm_service, paper_service, markdown_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/workspaces/{workspace}/export", tags=["export"])


@router.post("")
async def export_papers(workspace: str, body: ExportRequest):
    """Return combined HTML for browser print-to-PDF."""
    try:
        html = export_service.export_pdf_html(
            workspace,
            paper_ids=body.paper_ids or None,
            include_cover=body.include_cover,
            include_toc=body.include_toc,
            ai_summary=body.ai_summary,
        )
        return HTMLResponse(content=html)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/single/{paper_id}")
async def export_single_paper(workspace: str, paper_id: str):
    """Return a single paper's note as HTML for printing."""
    try:
        html = export_service.export_single_paper_html(workspace, paper_id)
        return HTMLResponse(content=html)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class SummaryRequest(BaseModel):
    paper_ids: list[str] = []
    provider_id: Optional[str] = None


@router.post("/ai_summary")
async def generate_ai_summary(workspace: str, body: SummaryRequest):
    """Generate an AI comprehensive summary of selected papers. Returns SSE stream."""
    papers = paper_service.list_papers(workspace)
    if body.paper_ids:
        papers = [p for p in papers if p["id"] in body.paper_ids]
    if not papers:
        raise HTTPException(status_code=400, detail="没有可用的论文")

    papers.sort(key=lambda p: p.get("number", 0))

    # Gather each paper's key info + note excerpt
    paper_descriptions = []
    for p in papers:
        title = p.get("title_zh") or p.get("title_en") or "未命名"
        authors = ", ".join(p.get("authors", []))
        year = p.get("year", "")
        journal = p.get("journal", "")
        keywords = ", ".join(p.get("keywords", []))

        note_excerpt = ""
        md_path = p.get("markdown_path", "")
        if md_path:
            raw = markdown_service.read_markdown(workspace, md_path)
            if raw:
                # Take the note but limit each to avoid token overflow
                note_excerpt = raw[:3000]
                if len(raw) > 3000:
                    note_excerpt += "\n...(截断)"

        desc = f"""### #{p.get('number', '?')} {title}
- 作者: {authors}
- 年份: {year}
- 期刊/会议: {journal}
- 关键词: {keywords}

{note_excerpt}
"""
        paper_descriptions.append(desc)

    all_papers_text = "\n---\n".join(paper_descriptions)

    # Limit total context
    if len(all_papers_text) > 50000:
        all_papers_text = all_papers_text[:50000] + "\n\n[... 内容已截断 ...]"

    system_prompt = (
        "你是一位学术文献综述助手。请根据提供的多篇论文信息和阅读笔记，"
        "撰写一份结构化的综合文献总结。要求使用中文，内容准确，逻辑清晰。"
    )

    user_prompt = f"""请为以下 {len(papers)} 篇论文撰写一份综合文献总结，放在调研报告的最前面。

## 论文列表及笔记摘要

{all_papers_text}

---

请严格按照以下 Markdown 格式输出：

# 综合文献总结

## 一、研究领域概述

（概述这些论文所属的研究领域和背景，研究的核心问题是什么）

## 二、主要研究方向与方法分类

（将这些论文按照研究方向或方法进行分类归纳，每个类别列出对应的论文编号）

## 三、关键技术与方法对比

（对比各论文提出的核心方法、技术路线，分析各自的优缺点）

## 四、研究成果与发现

（总结各论文的主要实验结果和重要发现）

## 五、研究趋势与展望

（基于这些论文，分析该领域的研究趋势、存在的共性问题、未来可能的研究方向）

## 六、对本课题的启示

（总结这些文献对当前课题「{workspace}」的参考价值和启示）"""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    async def event_generator():
        try:
            async for chunk in llm_service.chat_stream(messages, body.provider_id):
                yield {"event": "message", "data": json.dumps({"content": chunk})}
            yield {"event": "done", "data": "{}"}
        except Exception as e:
            logger.error("AI summary generation failed: %s", e)
            yield {"event": "error", "data": json.dumps({"error": str(e)})}

    return EventSourceResponse(event_generator())
