"""Writing API routes — project CRUD, file ops, compile, AI writing."""
import json
import logging

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from sse_starlette.sse import EventSourceResponse

from models import (
    WritingProjectCreate,
    WritingFileWrite,
    WritingAIContinueRequest,
    WritingAIPolishRequest,
    WritingAIGenerateSectionRequest,
    WritingAIChatRequest,
)
from services import writing_service, llm_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/writing", tags=["writing"])


# ============ Project CRUD ============

@router.get("/projects")
async def list_projects():
    return writing_service.list_projects()


@router.post("/projects")
async def create_project(body: WritingProjectCreate):
    try:
        return writing_service.create_project(body.name, body.template)
    except FileExistsError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.get("/projects/{name}")
async def get_project(name: str):
    proj = writing_service.get_project(name)
    if not proj:
        raise HTTPException(status_code=404, detail="项目不存在")
    return proj


@router.delete("/projects/{name}")
async def delete_project(name: str):
    if not writing_service.delete_project(name):
        raise HTTPException(status_code=404, detail="项目不存在")
    return {"ok": True}


# ============ File operations ============

@router.get("/projects/{name}/files")
async def list_files(name: str):
    return writing_service.list_files(name)


@router.get("/projects/{name}/files/read")
async def read_file(name: str, path: str = Query(...)):
    try:
        content = writing_service.read_file(name, path)
        return {"content": content}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/projects/{name}/files/write")
async def write_file(name: str, body: WritingFileWrite, path: str = Query(...)):
    try:
        return writing_service.write_file(name, path, body.content)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ============ Compile ============

@router.post("/projects/{name}/compile")
async def compile_project(name: str):
    try:
        result = await writing_service.compile_latex(name)
        return result
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/projects/{name}/pdf")
async def get_pdf(name: str):
    proj_dir = writing_service.get_project_path(name)
    meta = writing_service._read_meta(proj_dir)
    main_file = meta.get("main_file", "main.tex")
    from pathlib import Path
    pdf_name = Path(main_file).stem + ".pdf"
    pdf_path = proj_dir / "output" / pdf_name
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="PDF 未生成，请先编译")
    return FileResponse(str(pdf_path), media_type="application/pdf", filename=pdf_name)


# ============ AI Writing (SSE) ============

@router.post("/ai/continue")
async def ai_continue(body: WritingAIContinueRequest):
    """AI continue writing from cursor position."""
    system_prompt = (
        "你是一个学术论文写作助手。请根据上下文续写论文内容。\n"
        "要求：\n"
        "1. 输出纯 LaTeX 代码，不要包含 ```latex 等标记\n"
        "2. 保持与上下文一致的学术风格和语言\n"
        "3. 内容连贯、逻辑清晰\n"
        "4. 适当使用 LaTeX 命令和环境"
    )
    user_prompt = f"请根据以下上下文续写论文内容：\n\n【前文】\n{body.context_before[-3000:]}\n"
    if body.context_after:
        user_prompt += f"\n【后文】\n{body.context_after[:500]}\n"
    user_prompt += "\n请从前文结束处继续写作："

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
            logger.error("ai_continue failed: %s", e)
            yield {"event": "error", "data": json.dumps({"error": str(e)})}

    return EventSourceResponse(event_generator())


@router.post("/ai/polish")
async def ai_polish(body: WritingAIPolishRequest):
    """AI polish selected text."""
    system_prompt = (
        "你是一个学术论文润色助手。请对选中的文本进行学术润色。\n"
        "要求：\n"
        "1. 输出纯 LaTeX 代码，不要包含 ```latex 等标记\n"
        "2. 保持原意不变，提升学术性和流畅度\n"
        "3. 修正语法和表达问题\n"
        "4. 保留原有的 LaTeX 命令和环境结构"
    )
    user_prompt = f"请润色以下文本：\n\n{body.selected_text}\n"
    if body.instruction:
        user_prompt += f"\n额外要求：{body.instruction}"

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
            logger.error("ai_polish failed: %s", e)
            yield {"event": "error", "data": json.dumps({"error": str(e)})}

    return EventSourceResponse(event_generator())


@router.post("/ai/generate_section")
async def ai_generate_section(body: WritingAIGenerateSectionRequest):
    """AI generate a full section."""
    system_prompt = (
        "你是一个学术论文写作助手。请根据章节标题和要求生成完整的 LaTeX 章节内容。\n"
        "要求：\n"
        "1. 输出纯 LaTeX 代码，不要包含 ```latex 等标记\n"
        "2. 不要输出 \\section 命令本身，只输出章节正文内容\n"
        "3. 内容详实、逻辑清晰、学术规范\n"
        "4. 适当使用 LaTeX 环境（如 itemize, equation 等）"
    )
    user_prompt = f"请为论文章节「{body.section_title}」生成内容。\n"
    if body.notes:
        user_prompt += f"\n写作要点：{body.notes}\n"
    if body.existing_content:
        user_prompt += f"\n已有论文内容参考：\n{body.existing_content[:3000]}\n"

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
            logger.error("ai_generate_section failed: %s", e)
            yield {"event": "error", "data": json.dumps({"error": str(e)})}

    return EventSourceResponse(event_generator())


@router.post("/ai/chat")
async def ai_chat(body: WritingAIChatRequest):
    """AI chat for writing assistance."""
    system_prompt = (
        "你是一个论文写作助手。你可以帮助用户解答论文结构、写作方法、LaTeX 语法等问题。\n"
        "当需要展示 LaTeX 代码时，请直接输出代码。\n"
        "回答要简洁实用，针对学术论文写作场景。"
    )
    if body.paper_context:
        system_prompt += f"\n\n当前论文内容参考：\n{body.paper_context[:5000]}"

    messages = [{"role": "system", "content": system_prompt}]
    messages.extend([{"role": m.role, "content": m.content} for m in body.messages])

    async def event_generator():
        try:
            async for chunk in llm_service.chat_stream(messages, body.provider_id):
                yield {"event": "message", "data": json.dumps({"content": chunk})}
            yield {"event": "done", "data": "{}"}
        except Exception as e:
            logger.error("ai_chat failed: %s", e)
            yield {"event": "error", "data": json.dumps({"error": str(e)})}

    return EventSourceResponse(event_generator())
