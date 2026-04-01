"""Pydantic data models."""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class PaperStatus(str, Enum):
    unread = "unread"
    reading = "reading"
    completed = "completed"


class RelationType(str, Enum):
    cites = "cites"
    cited_by = "cited_by"
    related_to = "related_to"
    contrasts_with = "contrasts_with"
    extends = "extends"


class Relation(BaseModel):
    target_id: str
    type: RelationType


class LLMRecord(BaseModel):
    summary: Optional[str] = None
    key_contribution: Optional[str] = None
    method_tags: list[str] = Field(default_factory=list)
    generated_at: Optional[str] = None
    provider: Optional[str] = None


class Paper(BaseModel):
    id: str
    number: int
    title_zh: str = ""
    title_en: str = ""
    authors: list[str] = Field(default_factory=list)
    year: Optional[int] = None
    journal: str = ""
    doi: str = ""
    keywords: list[str] = Field(default_factory=list)
    category_id: str = ""
    tags: list[str] = Field(default_factory=list)
    status: PaperStatus = PaperStatus.unread
    pdf_path: str = ""
    markdown_path: str = ""
    relations: list[Relation] = Field(default_factory=list)
    llm_record: Optional[LLMRecord] = None
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now().isoformat())


class PaperCreate(BaseModel):
    title_zh: str = ""
    title_en: str = ""
    authors: list[str] = Field(default_factory=list)
    year: Optional[int] = None
    journal: str = ""
    doi: str = ""
    keywords: list[str] = Field(default_factory=list)
    category_id: str = ""
    tags: list[str] = Field(default_factory=list)
    status: PaperStatus = PaperStatus.unread
    pdf_path: str = ""


class PaperUpdate(BaseModel):
    title_zh: Optional[str] = None
    title_en: Optional[str] = None
    authors: Optional[list[str]] = None
    year: Optional[int] = None
    journal: Optional[str] = None
    doi: Optional[str] = None
    keywords: Optional[list[str]] = None
    category_id: Optional[str] = None
    tags: Optional[list[str]] = None
    status: Optional[PaperStatus] = None
    relations: Optional[list[Relation]] = None


class Workspace(BaseModel):
    name: str
    path: str
    paper_count: int = 0
    created_at: str = ""


class WorkspaceCreate(BaseModel):
    name: str


class LLMProvider(BaseModel):
    id: str
    name: str
    base_url: str
    api_key: str
    model: str
    is_default: bool = False
    max_tokens: int = 4096
    temperature: float = 0.7


class LLMProviderCreate(BaseModel):
    name: str
    base_url: str
    api_key: str
    model: str
    is_default: bool = False
    max_tokens: int = 4096
    temperature: float = 0.7


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    provider_id: Optional[str] = None
    stream: bool = True


class ExportRequest(BaseModel):
    paper_ids: list[str] = Field(default_factory=list)
    include_cover: bool = True
    include_toc: bool = True
    ai_summary: str = ""


# ============ Writing ============

class WritingProjectCreate(BaseModel):
    name: str
    template: str = "default"  # "default" | "blank"


class WritingFileWrite(BaseModel):
    content: str


class WritingAIContinueRequest(BaseModel):
    project: str
    context_before: str
    context_after: str = ""
    provider_id: Optional[str] = None


class WritingAIPolishRequest(BaseModel):
    project: str
    selected_text: str
    instruction: str = ""
    provider_id: Optional[str] = None


class WritingAIGenerateSectionRequest(BaseModel):
    project: str
    section_title: str
    notes: str = ""
    existing_content: str = ""
    provider_id: Optional[str] = None


class WritingAIChatRequest(BaseModel):
    project: str
    messages: list[ChatMessage]
    paper_context: str = ""
    provider_id: Optional[str] = None
