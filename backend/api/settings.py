"""Settings API routes."""
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from config import load_config, save_config, get_base_dir, DEFAULT_NOTE_TEMPLATE
from models import LLMProviderCreate

router = APIRouter(prefix="/api/settings", tags=["settings"])


# ---- Directory browsing ----

@router.get("/browse")
async def browse_directory(path: Optional[str] = Query(None)):
    """List sub-directories of a given path for the folder picker.

    Returns parent path, current resolved path and its immediate child
    directories (only directories, no files, no hidden entries).
    """
    if not path or not path.strip():
        p = Path.home()
    else:
        p = Path(path).expanduser().resolve()

    if not p.exists():
        raise HTTPException(status_code=400, detail=f"路径不存在: {p}")
    if not p.is_dir():
        raise HTTPException(status_code=400, detail="路径不是目录")

    children: list[dict] = []
    try:
        for entry in sorted(p.iterdir(), key=lambda e: e.name.lower()):
            if entry.name.startswith("."):
                continue
            if not entry.is_dir():
                continue
            children.append({
                "name": entry.name,
                "path": str(entry),
            })
    except PermissionError:
        raise HTTPException(status_code=403, detail="没有权限访问此目录")

    return {
        "current": str(p),
        "parent": str(p.parent) if p != p.parent else None,
        "children": children,
    }


class MkdirRequest(BaseModel):
    path: str


@router.post("/mkdir")
async def make_directory(body: MkdirRequest):
    """Create a new directory. Used by the folder picker's 'new folder' button."""
    p = Path(body.path).expanduser().resolve()
    if p.exists():
        raise HTTPException(status_code=409, detail="目录已存在")
    try:
        p.mkdir(parents=True, exist_ok=False)
    except OSError as e:
        raise HTTPException(status_code=400, detail=f"创建失败: {e}")
    return {"path": str(p)}


# ---- Base directory ----

class BaseDirUpdate(BaseModel):
    base_dir: str


@router.get("/base_dir")
async def get_base_dir_setting():
    config = load_config()
    current = get_base_dir()
    return {
        "base_dir": str(current),
        "configured": config.get("base_dir", ""),
        "exists": current.exists(),
        "is_dir": current.is_dir() if current.exists() else False,
    }


@router.put("/base_dir")
async def set_base_dir(body: BaseDirUpdate):
    raw = body.base_dir.strip()
    if not raw:
        # Clear custom setting, revert to default
        config = load_config()
        config["base_dir"] = ""
        save_config(config)
        current = get_base_dir()
        return {"base_dir": str(current), "exists": current.exists()}

    p = Path(raw).expanduser().resolve()
    if not p.exists():
        try:
            p.mkdir(parents=True, exist_ok=True)
        except OSError as e:
            raise HTTPException(status_code=400, detail=f"无法创建目录: {e}")
    if not p.is_dir():
        raise HTTPException(status_code=400, detail="路径不是一个目录")

    config = load_config()
    config["base_dir"] = str(p)
    save_config(config)
    return {"base_dir": str(p), "exists": True}


# ---- General settings ----

@router.get("")
async def get_settings():
    config = load_config()
    # Mask API keys for security
    safe_providers = []
    for p in config.get("llm_providers", []):
        safe_p = {**p}
        if safe_p.get("api_key"):
            key = safe_p["api_key"]
            safe_p["api_key"] = key[:8] + "..." + key[-4:] if len(key) > 12 else "***"
        safe_providers.append(safe_p)
    return {
        "base_dir": str(get_base_dir()),
        "llm_providers": safe_providers,
        "ui_preferences": config.get("ui_preferences", {}),
    }


# ---- LLM providers ----

@router.get("/providers")
async def list_providers():
    config = load_config()
    providers = config.get("llm_providers", [])
    # Mask API keys
    for p in providers:
        if p.get("api_key"):
            key = p["api_key"]
            p["api_key"] = key[:8] + "..." + key[-4:] if len(key) > 12 else "***"
    return providers


@router.post("/providers")
async def add_provider(body: LLMProviderCreate):
    config = load_config()
    providers = config.get("llm_providers", [])
    new_provider = {
        "id": f"provider_{uuid.uuid4().hex[:6]}",
        **body.model_dump(),
    }
    # If this is the first or marked as default, unset others
    if body.is_default or not providers:
        for p in providers:
            p["is_default"] = False
        new_provider["is_default"] = True
    providers.append(new_provider)
    config["llm_providers"] = providers
    save_config(config)
    return new_provider


@router.put("/providers/{provider_id}")
async def update_provider(provider_id: str, body: LLMProviderCreate):
    config = load_config()
    providers = config.get("llm_providers", [])
    found = False
    for i, p in enumerate(providers):
        if p["id"] == provider_id:
            # Preserve id
            updated = {"id": provider_id, **body.model_dump()}
            # If api_key is empty, keep the existing key
            if not updated["api_key"] or not updated["api_key"].strip():
                updated["api_key"] = p.get("api_key", "")
            if body.is_default:
                for pp in providers:
                    pp["is_default"] = False
            providers[i] = updated
            found = True
            break
    if not found:
        raise HTTPException(status_code=404, detail="Provider not found")
    config["llm_providers"] = providers
    save_config(config)
    return providers


@router.delete("/providers/{provider_id}")
async def delete_provider(provider_id: str):
    config = load_config()
    providers = config.get("llm_providers", [])
    config["llm_providers"] = [p for p in providers if p["id"] != provider_id]
    save_config(config)
    return {"ok": True}


# ---- Note template ----

class NoteTemplateUpdate(BaseModel):
    template: str


@router.get("/note_template")
async def get_note_template():
    config = load_config()
    custom = config.get("note_template", "")
    return {
        "template": custom if custom else DEFAULT_NOTE_TEMPLATE,
        "is_custom": bool(custom),
    }


@router.put("/note_template")
async def set_note_template(body: NoteTemplateUpdate):
    """Save a custom note template. Empty content is rejected."""
    template = body.template.strip()
    if not template:
        raise HTTPException(status_code=400, detail="模板内容不能为空，如需恢复默认请使用重置功能")
    config = load_config()
    config["note_template"] = body.template
    save_config(config)
    return {"template": body.template, "is_custom": True}


@router.delete("/note_template")
async def reset_note_template():
    config = load_config()
    config["note_template"] = ""
    save_config(config)
    return {"template": DEFAULT_NOTE_TEMPLATE, "is_custom": False}
