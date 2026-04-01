"""LLM API routes with SSE streaming."""
import json
import logging

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse
from typing import Optional

from models import ChatRequest
from services import llm_service, pdf_service, paper_service, markdown_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/llm", tags=["llm"])


@router.post("/chat")
async def chat(body: ChatRequest):
    """Chat with LLM. Returns SSE stream if stream=True."""
    messages = [{"role": m.role, "content": m.content} for m in body.messages]

    if body.stream:
        async def event_generator():
            try:
                async for chunk in llm_service.chat_stream(messages, body.provider_id):
                    yield {"event": "message", "data": json.dumps({"content": chunk})}
                yield {"event": "done", "data": "{}"}
            except Exception as e:
                yield {"event": "error", "data": json.dumps({"error": str(e)})}

        return EventSourceResponse(event_generator())
    else:
        try:
            result = await llm_service.chat_completion(messages, body.provider_id)
            return {"content": result}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))


class TranslateRequest(BaseModel):
    text: str
    source_lang: str = "en"
    target_lang: str = "zh"
    provider_id: Optional[str] = None


@router.post("/translate")
async def translate(body: TranslateRequest):
    """Translate selected text via LLM. Returns SSE stream."""
    text = body.text[:3000]
    if not text.strip():
        raise HTTPException(status_code=400, detail="文本不能为空")

    system_prompt = (
        f"你是一个专业的学术翻译助手。请将以下{body.source_lang}文本翻译为{body.target_lang}。"
        "要求：翻译准确、通顺，保留学术术语的专业性。只输出翻译结果，不要添加任何解释。"
    )
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": text},
    ]

    async def event_generator():
        try:
            async for chunk in llm_service.chat_stream(messages, body.provider_id):
                yield {"event": "message", "data": json.dumps({"content": chunk})}
            yield {"event": "done", "data": "{}"}
        except Exception as e:
            logger.error("translate failed: %s", e)
            yield {"event": "error", "data": json.dumps({"error": str(e)})}

    return EventSourceResponse(event_generator())


class GenerateNoteRequest(BaseModel):
    workspace: str
    paper_id: str
    provider_id: Optional[str] = None
    max_pdf_pages: int = 10


@router.post("/generate_note")
async def generate_note(body: GenerateNoteRequest):
    """Use LLM to generate 7-section paper note from PDF text. Returns SSE stream."""
    paper = paper_service.get_paper(body.workspace, body.paper_id)
    if not paper:
        raise HTTPException(status_code=404, detail="论文不存在")

    # Get PDF text
    pdf_path_str = paper.get("pdf_path", "")
    pdf_text = ""
    if pdf_path_str:
        from services.workspace_service import get_workspace_path
        full = get_workspace_path(body.workspace) / pdf_path_str
        if full.exists():
            pdf_text = pdf_service.extract_text(full, max_pages=body.max_pdf_pages)

    if not pdf_text:
        raise HTTPException(status_code=400, detail="该论文没有可用的 PDF 文本，请先上传 PDF")

    # Truncate to avoid exceeding context window
    if len(pdf_text) > 30000:
        pdf_text = pdf_text[:30000] + "\n\n[... 文本已截断 ...]"

    title = paper.get("title_zh") or paper.get("title_en") or "未命名"
    authors = ", ".join(paper.get("authors", []))
    year = paper.get("year", "")
    journal = paper.get("journal", "")

    system_prompt = (
        "你是一位学术论文阅读助手。请根据提供的论文全文，撰写结构化的论文笔记。"
        "要求使用中文撰写，内容详实、准确，覆盖论文的核心内容。"
        "严格按照以下 Markdown 格式输出，不要添加额外章节或更改章节编号。"
    )

    user_prompt = f"""请为以下论文生成 7 节结构化阅读笔记。

## 论文信息
- 标题: {title}
- 作者: {authors}
- 年份: {year}
- 期刊/会议: {journal}

## 论文全文（部分）
{pdf_text}

---

请严格按照以下格式输出，每一节都要详细填写（每节至少 3-5 句话）：

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

    async def event_generator():
        chunk_count = 0
        try:
            async for chunk in llm_service.chat_stream(messages, body.provider_id):
                chunk_count += 1
                yield {"event": "message", "data": json.dumps({"content": chunk})}
            logger.info("generate_note completed, %d chunks sent", chunk_count)
            yield {"event": "done", "data": "{}"}
        except Exception as e:
            logger.error("generate_note failed: %s", e)
            yield {"event": "error", "data": json.dumps({"error": str(e)})}

    return EventSourceResponse(event_generator())
