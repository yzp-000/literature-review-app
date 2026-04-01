# Literature Review App -- Developer Documentation

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Backend](#backend)
  - [API Endpoints](#api-endpoints)
  - [Data Models](#data-models)
  - [Services](#services)
  - [LLM Integration](#llm-integration)
  - [File Storage](#file-storage)
- [Frontend](#frontend)
  - [Routing & Pages](#routing--pages)
  - [State Management](#state-management)
  - [API Client](#api-client)
  - [Reusable Components](#reusable-components)
  - [Key Patterns](#key-patterns)
- [SSE Streaming Protocol](#sse-streaming-protocol)
- [Configuration](#configuration)
- [Development Setup](#development-setup)
- [Adding New Features Guide](#adding-new-features-guide)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (React SPA)                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │  Zustand  │ │  Axios   │ │  useSSE  │ │  react-pdf /     │   │
│  │  Stores   │ │  Client  │ │  Hook    │ │  latex.js        │   │
│  └─────┬─────┘ └────┬─────┘ └────┬─────┘ └──────────────────┘   │
│        │             │            │                               │
└────────┼─────────────┼────────────┼──────────────────────────────┘
         │       REST  │      SSE   │
         │    JSON/API  │   (stream) │
─────────┼─────────────┼────────────┼───── Vite proxy (:5173→:8000)
         │             │            │
┌────────┼─────────────┼────────────┼──────────────────────────────┐
│        ▼             ▼            ▼       FastAPI (:8000)        │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │                    API Routers (10)                       │    │
│  │  workspace │ papers │ files │ pdf │ llm │ graph │ export │    │
│  │  settings  │ search │ writing                            │    │
│  └──────────────────────┬───────────────────────────────────┘    │
│                         │                                        │
│  ┌──────────────────────▼───────────────────────────────────┐    │
│  │                    Services (9)                           │    │
│  │  workspace │ paper │ markdown │ pdf │ llm │ graph        │    │
│  │  export    │ search │ writing                            │    │
│  └──────────────────────┬───────────────────────────────────┘    │
│                         │                                        │
│  ┌──────────────────────▼───────────────────────────────────┐    │
│  │               LLM Provider (OpenAI-compatible)           │    │
│  │               httpx streaming → external API             │    │
│  └──────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────────┐
│                     File System (base_dir/)                      │
│                                                                  │
│  {topic}_文献调研/           {name}_论文写作/                     │
│    papers.json                writing.json                       │
│    search_history.json        main.tex                           │
│    pdfs/                      output/                            │
│    00_总览总结/                                                   │
│    01_单篇论文/                                                   │
│    02_关键技术总结/                                               │
│                                                                  │
│  config.json  (project root)                                     │
└──────────────────────────────────────────────────────────────────┘
```

**Tech stack:**

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite 5 + Ant Design 5 |
| State | Zustand 4 |
| HTTP | Axios 1.7 (REST), Fetch API (SSE) |
| Backend | Python 3.10+ / FastAPI / Uvicorn |
| SSE | sse-starlette |
| PDF parsing | PyMuPDF (fitz) |
| LLM | OpenAI-compatible API via httpx |
| Storage | JSON files on local filesystem |

---

## Backend

### Project Structure

```
backend/
├── main.py                    # App entry, CORS, router registration, static files
├── config.py                  # Config loading, base_dir resolution
├── requirements.txt
├── api/                       # Route handlers (thin layer)
│   ├── workspace.py
│   ├── papers.py
│   ├── files.py
│   ├── pdf.py
│   ├── llm.py
│   ├── graph.py
│   ├── export.py
│   ├── settings.py
│   ├── search.py
│   └── writing.py
├── services/                  # Business logic
│   ├── workspace_service.py
│   ├── paper_service.py
│   ├── markdown_service.py
│   ├── pdf_service.py
│   ├── llm_service.py
│   ├── graph_service.py
│   ├── export_service.py
│   ├── search_service.py
│   └── writing_service.py
├── models/
│   └── __init__.py            # All Pydantic models & enums
├── llm_providers/
│   └── openai_compatible.py   # BaseLLMProvider + OpenAICompatibleProvider
└── templates/
    └── default_paper.tex      # LaTeX template for writing projects
```

### API Endpoints

52 endpoints total across 10 routers + 1 root health check. Streaming endpoints marked with *(SSE)*.

#### Health Check

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/health` | `health_check` | Returns `{"status": "ok", "version": "0.1.0"}` |

#### Workspace -- `/api/workspaces` (4 endpoints)

| Method | Path | Handler | Parameters | Description |
|--------|------|---------|------------|-------------|
| GET | `/api/workspaces` | `list_workspaces` | -- | List all workspaces |
| POST | `/api/workspaces` | `create_workspace` | Body: `WorkspaceCreate` | Create workspace directory with sub-folders |
| GET | `/api/workspaces/{name}` | `get_workspace` | Path: `name` | Get single workspace details |
| DELETE | `/api/workspaces/{name}` | `delete_workspace` | Path: `name` | Delete workspace |

#### Papers -- `/api/workspaces/{workspace}/papers` (5 endpoints)

| Method | Path | Handler | Parameters | Description |
|--------|------|---------|------------|-------------|
| GET | `.../papers` | `list_papers` | Query: `status?`, `keyword?` | List papers, filter by status/keyword |
| POST | `.../papers` | `create_paper` | Body: `PaperCreate` | Create paper with auto-number and note template |
| GET | `.../papers/{paper_id}` | `get_paper` | Path: `paper_id` | Get single paper |
| PUT | `.../papers/{paper_id}` | `update_paper` | Body: `PaperUpdate` | Update paper fields |
| DELETE | `.../papers/{paper_id}` | `delete_paper` | Path: `paper_id` | Delete paper |

#### Files -- `/api/workspaces/{workspace}/files` (3 endpoints)

| Method | Path | Handler | Parameters | Description |
|--------|------|---------|------------|-------------|
| GET | `.../files` | `list_files` | -- | List all markdown files in workspace |
| GET | `.../files/read` | `read_file` | Query: `path` | Read markdown file content |
| POST | `.../files/write` | `write_file` | Query: `path`; Body: `FileWriteRequest` | Write content to markdown file |

#### PDF -- `/api/workspaces/{workspace}/pdf` (3 endpoints)

| Method | Path | Handler | Parameters | Description |
|--------|------|---------|------------|-------------|
| POST | `.../pdf/upload` | `upload_pdf` | File: `file` (.pdf); Query: `paper_id?` | Upload PDF, extract metadata, optionally link to paper |
| GET | `.../pdf/view` | `view_pdf` | Query: `path` | Serve PDF as `application/pdf` FileResponse |
| GET | `.../pdf/extract_text` | `extract_text` | Query: `path`, `max_pages?` (default=0/all) | Extract text from PDF via PyMuPDF |

#### LLM -- `/api/llm` (3 endpoints)

| Method | Path | Handler | Parameters | Description |
|--------|------|---------|------------|-------------|
| POST | `/api/llm/chat` | `chat` | Body: `ChatRequest` | Chat with LLM. *(SSE)* when `stream=true`, else JSON |
| POST | `/api/llm/translate` | `translate` | Body: `TranslateRequest` | Translate text via LLM *(SSE)* |
| POST | `/api/llm/generate_note` | `generate_note` | Body: `GenerateNoteRequest` | Generate 7-section reading note from PDF *(SSE)* |

#### Graph -- `/api/workspaces/{workspace}/graph` (4 endpoints)

| Method | Path | Handler | Parameters | Description |
|--------|------|---------|------------|-------------|
| GET | `.../graph` | `get_graph` | -- | Get full citation/relation graph (nodes + edges) |
| GET | `.../graph/papers/{paper_id}/relations` | `get_paper_relations` | Path: `paper_id` | Get all relations for a paper |
| POST | `.../graph/relations` | `add_relation` | Body: `RelationRequest` | Add relation (auto-adds inverse) |
| DELETE | `.../graph/relations` | `remove_relation` | Body: `RelationRequest` | Remove relation and its inverse |

#### Export -- `/api/workspaces/{workspace}/export` (3 endpoints)

| Method | Path | Handler | Parameters | Description |
|--------|------|---------|------------|-------------|
| POST | `.../export` | `export_papers` | Body: `ExportRequest` | Generate combined HTML for browser print-to-PDF |
| POST | `.../export/single/{paper_id}` | `export_single_paper` | Path: `paper_id` | Export single paper note as HTML |
| POST | `.../export/ai_summary` | `generate_ai_summary` | Body: `SummaryRequest` | AI literature review summary *(SSE)* |

#### Settings -- `/api/settings` (9 endpoints)

| Method | Path | Handler | Parameters | Description |
|--------|------|---------|------------|-------------|
| GET | `/api/settings` | `get_settings` | -- | Get all settings (base_dir, providers with masked keys, UI prefs) |
| GET | `/api/settings/base_dir` | `get_base_dir_setting` | -- | Get base directory info |
| PUT | `/api/settings/base_dir` | `set_base_dir` | Body: `BaseDirUpdate` | Set workspace root directory |
| GET | `/api/settings/browse` | `browse_directory` | Query: `path?` | List subdirectories for folder picker |
| POST | `/api/settings/mkdir` | `make_directory` | Body: `MkdirRequest` | Create new directory |
| GET | `/api/settings/providers` | `list_providers` | -- | List LLM providers (masked API keys) |
| POST | `/api/settings/providers` | `add_provider` | Body: `LLMProviderCreate` | Add LLM provider |
| PUT | `/api/settings/providers/{provider_id}` | `update_provider` | Body: `LLMProviderCreate` | Update provider |
| DELETE | `/api/settings/providers/{provider_id}` | `delete_provider` | Path: `provider_id` | Delete provider |

#### Search -- `/api/search` (4 endpoints)

| Method | Path | Handler | Parameters | Description |
|--------|------|---------|------------|-------------|
| POST | `/api/search/start` | `start_search` | Body: `SearchRequest` | Start AI literature search pipeline *(SSE)* |
| GET | `/api/search/history` | `get_history` | Query: `workspace` | Get search history for workspace |
| GET | `/api/search/history/{search_id}` | `get_history_detail` | Query: `workspace` | Get single search record |
| DELETE | `/api/search/history/{search_id}` | `delete_history_record` | Query: `workspace` | Delete search record |

#### Writing -- `/api/writing` (13 endpoints)

| Method | Path | Handler | Parameters | Description |
|--------|------|---------|------------|-------------|
| GET | `/api/writing/projects` | `list_projects` | -- | List all writing projects |
| POST | `/api/writing/projects` | `create_project` | Body: `WritingProjectCreate` | Create project (template: "default"/"blank") |
| GET | `/api/writing/projects/{name}` | `get_project` | Path: `name` | Get project details |
| DELETE | `/api/writing/projects/{name}` | `delete_project` | Path: `name` | Delete project |
| GET | `/api/writing/projects/{name}/files` | `list_files` | Path: `name` | List files in project |
| GET | `/api/writing/projects/{name}/files/read` | `read_file` | Query: `path` | Read project file |
| POST | `/api/writing/projects/{name}/files/write` | `write_file` | Query: `path`; Body: `WritingFileWrite` | Write project file |
| POST | `/api/writing/projects/{name}/compile` | `compile_project` | Path: `name` | Compile LaTeX with xelatex (2 passes, 120s timeout) |
| GET | `/api/writing/projects/{name}/pdf` | `get_pdf` | Path: `name` | Download compiled PDF |
| POST | `/api/writing/ai/continue` | `ai_continue` | Body: `WritingAIContinueRequest` | AI continue writing from cursor *(SSE)* |
| POST | `/api/writing/ai/polish` | `ai_polish` | Body: `WritingAIPolishRequest` | AI polish selected text *(SSE)* |
| POST | `/api/writing/ai/generate_section` | `ai_generate_section` | Body: `WritingAIGenerateSectionRequest` | AI generate full LaTeX section *(SSE)* |
| POST | `/api/writing/ai/chat` | `ai_chat` | Body: `WritingAIChatRequest` | AI writing assistant chat *(SSE)* |

### Data Models

All models are defined in `backend/models/__init__.py`.

#### Enums

```python
class PaperStatus(str, Enum):
    unread    = "unread"
    reading   = "reading"
    completed = "completed"

class RelationType(str, Enum):
    cites          = "cites"
    cited_by       = "cited_by"
    related_to     = "related_to"
    contrasts_with = "contrasts_with"
    extends        = "extends"
```

#### Core Models

**`Paper`**

| Field | Type | Default |
|-------|------|---------|
| `id` | `str` | *(required)* |
| `number` | `int` | *(required)* |
| `title_zh` | `str` | `""` |
| `title_en` | `str` | `""` |
| `authors` | `list[str]` | `[]` |
| `year` | `Optional[int]` | `None` |
| `journal` | `str` | `""` |
| `doi` | `str` | `""` |
| `keywords` | `list[str]` | `[]` |
| `category_id` | `str` | `""` |
| `tags` | `list[str]` | `[]` |
| `status` | `PaperStatus` | `unread` |
| `pdf_path` | `str` | `""` |
| `markdown_path` | `str` | `""` |
| `relations` | `list[Relation]` | `[]` |
| `llm_record` | `Optional[LLMRecord]` | `None` |
| `created_at` | `str` | `datetime.now().isoformat()` |
| `updated_at` | `str` | `datetime.now().isoformat()` |

**`Relation`** -- `target_id: str`, `type: RelationType`

**`LLMRecord`** -- `summary: Optional[str]`, `key_contribution: Optional[str]`, `method_tags: list[str]`, `generated_at: Optional[str]`, `provider: Optional[str]`

**`Workspace`** -- `name: str`, `path: str`, `paper_count: int = 0`, `created_at: str = ""`

**`LLMProvider`** -- `id: str`, `name: str`, `base_url: str`, `api_key: str`, `model: str`, `is_default: bool = False`, `max_tokens: int = 4096`, `temperature: float = 0.7`

**`ChatMessage`** -- `role: str` ("user" | "assistant"), `content: str`

#### Request Models

| Model | Fields |
|-------|--------|
| `WorkspaceCreate` | `name: str` |
| `PaperCreate` | `title_zh=""`, `title_en=""`, `authors=[]`, `year=None`, `journal=""`, `doi=""`, `keywords=[]`, `category_id=""`, `tags=[]`, `status=unread`, `pdf_path=""` |
| `PaperUpdate` | All of `PaperCreate` fields as `Optional` + `relations: Optional[list[Relation]]` |
| `ChatRequest` | `messages: list[ChatMessage]`, `provider_id: Optional[str]`, `stream: bool = True` |
| `TranslateRequest` | `text: str`, `source_lang: str = "en"`, `target_lang: str = "zh"`, `provider_id: Optional[str]` |
| `GenerateNoteRequest` | `workspace: str`, `paper_id: str`, `provider_id: Optional[str]`, `max_pdf_pages: int = 10` |
| `ExportRequest` | `paper_ids: list[str] = []`, `include_cover: bool = True`, `include_toc: bool = True`, `ai_summary: str = ""` |
| `SummaryRequest` | `paper_ids: list[str] = []`, `provider_id: Optional[str]` |
| `RelationRequest` | `source_id: str`, `target_id: str`, `relation_type: str` |
| `SearchRequest` | `workspace: str`, `direction: str`, `paper_count: int = 10`, `year_start: Optional[int]`, `year_end: Optional[int]`, `extra_requirements: str = ""`, `provider_id: Optional[str]`, `auto_import: bool = True`, `auto_generate_notes: bool = False` |
| `LLMProviderCreate` | `name: str`, `base_url: str`, `api_key: str`, `model: str`, `is_default: bool = False`, `max_tokens: int = 4096`, `temperature: float = 0.7` |
| `BaseDirUpdate` | `base_dir: str` |
| `MkdirRequest` | `path: str` |
| `FileWriteRequest` | `content: str` |
| `WritingProjectCreate` | `name: str`, `template: str = "default"` |
| `WritingFileWrite` | `content: str` |
| `WritingAIContinueRequest` | `project: str`, `context_before: str`, `context_after: str = ""`, `provider_id: Optional[str]` |
| `WritingAIPolishRequest` | `project: str`, `selected_text: str`, `instruction: str = ""`, `provider_id: Optional[str]` |
| `WritingAIGenerateSectionRequest` | `project: str`, `section_title: str`, `notes: str = ""`, `existing_content: str = ""`, `provider_id: Optional[str]` |
| `WritingAIChatRequest` | `project: str`, `messages: list[ChatMessage]`, `paper_context: str = ""`, `provider_id: Optional[str]` |

### Services

All services are module-level functions (no classes). Located in `backend/services/`.

#### workspace_service.py

Constant: `WORKSPACE_SUFFIX = "_文献调研"`

| Function | Signature | Description |
|----------|-----------|-------------|
| `list_workspaces` | `() -> list[dict]` | Scans base_dir for `*_文献调研` directories |
| `create_workspace` | `(name: str) -> dict` | Creates directory with `pdfs/`, `00_总览总结/`, `01_单篇论文/`, `02_关键技术总结/`; initializes `papers.json` |
| `get_workspace` | `(name: str) -> dict \| None` | Get workspace by name |
| `delete_workspace` | `(name: str) -> bool` | Deletes via `shutil.rmtree` |
| `get_workspace_path` | `(name: str) -> Path` | Returns `base_dir / "{name}_文献调研"` |

#### paper_service.py

| Function | Signature | Description |
|----------|-----------|-------------|
| `list_papers` | `(workspace, status?=None, keyword?=None) -> list[dict]` | List with optional status/keyword filter |
| `get_paper` | `(workspace, paper_id) -> dict \| None` | Lookup by ID |
| `create_paper` | `(workspace, paper_in: PaperCreate) -> dict` | Auto-assigns number, generates 8-char UUID ID, creates markdown note from 7-section template |
| `update_paper` | `(workspace, paper_id, update: PaperUpdate) -> dict \| None` | Partial update (non-None fields) |
| `delete_paper` | `(workspace, paper_id) -> bool` | Remove from papers.json |

#### llm_service.py

| Function | Signature | Description |
|----------|-----------|-------------|
| `chat_completion` | `async (messages, provider_id?=None) -> str` | Non-streaming LLM call |
| `chat_stream` | `async (messages, provider_id?=None) -> AsyncIterator[str]` | Streaming LLM call, yields chunks |

#### pdf_service.py

| Function | Signature | Description |
|----------|-----------|-------------|
| `save_pdf` | `(workspace, filename, content: bytes) -> str` | Save to `pdfs/`, returns relative path |
| `get_pdf_path` | `(workspace, relative_path) -> Path \| None` | Resolve with path-traversal check |
| `extract_text` | `(pdf_path: Path, max_pages=0) -> str` | Full text extraction via PyMuPDF |
| `extract_metadata` | `(pdf_path: Path) -> dict` | Rich metadata extraction (title, authors, year, DOI, abstract, keywords, etc.) using PDF metadata + first-page heuristics |

#### markdown_service.py

| Function | Signature | Description |
|----------|-----------|-------------|
| `read_markdown` | `(workspace, relative_path) -> str \| None` | Read with path-traversal check |
| `write_markdown` | `(workspace, relative_path, content) -> bool` | Write, creates parent dirs |
| `list_markdown_files` | `(workspace) -> list[dict]` | Recursively list `*.md` files |

#### graph_service.py

Constants: `INVERSE_RELATION` (maps each relation to its inverse), `RELATION_LABELS` (Chinese display names), `STATUS_COLORS` (hex colors per status)

| Function | Signature | Description |
|----------|-----------|-------------|
| `get_graph_data` | `(workspace) -> dict` | Build `{nodes, edges}` with deduplication |
| `add_relation` | `(workspace, source_id, target_id, relation_type) -> dict` | Add relation + auto-inverse |
| `remove_relation` | `(workspace, source_id, target_id, relation_type) -> dict` | Remove relation + inverse |
| `get_paper_relations` | `(workspace, paper_id) -> list[dict]` | Relations enriched with target info |

#### export_service.py

| Function | Signature | Description |
|----------|-----------|-------------|
| `export_pdf_html` | `(workspace, paper_ids?=None, include_cover=True, include_toc=True, ai_summary="") -> str` | Generate A4-formatted HTML from paper markdown notes |
| `export_single_paper_html` | `(workspace, paper_id) -> str` | Single paper HTML export |

#### search_service.py

| Function | Signature | Description |
|----------|-----------|-------------|
| `search_literature` | `async (workspace, direction, paper_count=10, year_start?=None, year_end?=None, extra_requirements="", provider_id?=None, auto_import=True, auto_generate_notes=False) -> AsyncIterator[dict]` | Core 6-stage pipeline: LLM recommend -> CrossRef verify -> PDF download -> import -> note generation -> done |
| `list_history` | `(workspace) -> list[dict]` | Full search history |
| `get_history` | `(workspace, search_id) -> dict \| None` | Single record lookup |
| `delete_history` | `(workspace, search_id) -> bool` | Delete record |

Internal helpers: `_crossref_search(title)` queries CrossRef API; `_try_download_pdf(doi, arxiv_id, workspace)` tries arXiv then Unpaywall; `_generate_note_for_paper(workspace, paper_info, provider_id)` generates 7-section note via LLM.

#### writing_service.py

Constant: `WRITING_SUFFIX = "_论文写作"`

| Function | Signature | Description |
|----------|-----------|-------------|
| `list_projects` | `() -> list[dict]` | Scan for `*_论文写作` directories |
| `create_project` | `(name, template="default") -> dict` | Create project with LaTeX template, init `writing.json` |
| `get_project` | `(name) -> dict \| None` | Read project metadata |
| `delete_project` | `(name) -> bool` | Delete via `shutil.rmtree` |
| `list_files` | `(name) -> list[dict]` | List project files |
| `read_file` | `(name, path) -> str` | Read with path-traversal check |
| `write_file` | `(name, path, content) -> dict` | Write file, update timestamp |
| `compile_latex` | `async (name) -> dict` | Run xelatex twice (for cross-refs), 120s timeout. Returns `{success, pdf_path, log, duration_ms}` |

### LLM Integration

#### Provider Architecture

```
BaseLLMProvider (ABC)
    └── OpenAICompatibleProvider
```

`BaseLLMProvider` defines one abstract method:

```python
async def chat(self, messages: list[dict], stream: bool = False, **kwargs) -> str | AsyncIterator[str]
```

`OpenAICompatibleProvider.__init__` takes `base_url`, `api_key`, `model`, `max_tokens=4096`, `temperature=0.7`. The `base_url` is auto-normalized: `/v1` is appended if the URL doesn't end with a versioned path (e.g., `/v1`, `/v2`).

**Provider resolution** (`llm_service._get_provider`): load providers from `config.json` -> lookup by explicit `provider_id` -> fallback to `is_default=True` -> fallback to first provider.

#### Streaming Flow

```
Frontend (Fetch API)
    ↓ POST with JSON body
API Router (event_generator)
    ↓ yields {"event": "message", "data": {"content": chunk}}
llm_service.chat_stream()
    ↓ AsyncIterator[str]
OpenAICompatibleProvider._stream_chat()
    ↓ httpx.AsyncClient.stream() → SSE lines
External LLM API
    ↓ data: {"choices": [{"delta": {"content": "..."}}]}
    ↓ data: [DONE]
```

#### All LLM Usage Points (9 API + 2 internal = 11 total)

| # | Endpoint / Function | Purpose | Stream |
|---|---------------------|---------|--------|
| 1 | `POST /api/llm/chat` (stream=true) | General-purpose chat | Yes |
| 2 | `POST /api/llm/chat` (stream=false) | General-purpose chat | No |
| 3 | `POST /api/llm/translate` | Text translation | Yes |
| 4 | `POST /api/llm/generate_note` | 7-section paper note from PDF | Yes |
| 5 | `POST .../export/ai_summary` | Cross-paper literature review summary | Yes |
| 6 | `POST /api/writing/ai/continue` | Continue writing from cursor | Yes |
| 7 | `POST /api/writing/ai/polish` | Polish/refine selected text | Yes |
| 8 | `POST /api/writing/ai/generate_section` | Generate full LaTeX section | Yes |
| 9 | `POST /api/writing/ai/chat` | Writing assistant chat | Yes |
| 10 | `search_service.search_literature` (internal) | LLM paper recommendations (stage 1) | Yes |
| 11 | `search_service._generate_note_for_paper` (internal) | Note generation for imported papers (stage 5) | Yes |

### File Storage

#### Directory Layout

```
{base_dir}/
├── {topic}_文献调研/                    # Workspace (one per research topic)
│   ├── papers.json                     # Paper catalog + categories
│   ├── search_history.json             # Search records (max 50)
│   ├── pdfs/                           # PDF files
│   │   ├── {arxiv_id}.pdf
│   │   ├── {safe_doi}.pdf
│   │   └── {uploaded_filename}.pdf
│   ├── 00_总览总结/
│   │   └── 总览总结.md                  # Auto-generated overview
│   ├── 01_单篇论文/
│   │   ├── 01_{title}.md               # Per-paper 7-section notes
│   │   ├── 02_{title}.md
│   │   └── ...
│   └── 02_关键技术总结/                  # Key technology summaries
│
├── {name}_论文写作/                     # Writing project
│   ├── writing.json                    # Project metadata
│   ├── main.tex                        # Main LaTeX source
│   └── output/                         # Compilation output
│       ├── main.pdf
│       └── main.aux, main.log, ...
│
└── config.json                         # (in project root, not base_dir)
```

#### papers.json Schema

```json
{
  "papers": [
    {
      "id": "a1b2c3d4",
      "number": 1,
      "title_zh": "",
      "title_en": "Paper Title",
      "authors": ["Author 1", "Author 2"],
      "year": 2024,
      "journal": "Nature",
      "doi": "10.1234/example",
      "keywords": ["keyword1", "keyword2"],
      "category_id": "",
      "tags": [],
      "status": "unread",
      "pdf_path": "pdfs/filename.pdf",
      "markdown_path": "01_单篇论文/01_Paper_Title.md",
      "relations": [
        {"target_id": "e5f6g7h8", "type": "cites"}
      ],
      "llm_record": {
        "summary": "...",
        "key_contribution": "...",
        "method_tags": [],
        "generated_at": "2024-01-01T00:00:00",
        "provider": "provider_39c81c"
      },
      "created_at": "2024-01-01T00:00:00",
      "updated_at": "2024-01-01T00:00:00"
    }
  ],
  "categories": []
}
```

#### search_history.json Schema

```json
[
  {
    "id": "a1b2c3d4",
    "timestamp": "2024-01-01T00:00:00",
    "params": {
      "direction": "deep learning for NLP",
      "paper_count": 10,
      "year_start": 2020,
      "year_end": 2024,
      "extra_requirements": ""
    },
    "results": [
      {
        "id": "paper_id",
        "number": 1,
        "title_en": "...",
        "title_zh": "...",
        "authors": [],
        "year": 2024,
        "journal": "",
        "doi": "",
        "keywords": [],
        "summary": "...",
        "verified": true,
        "has_pdf": true,
        "note_generated": false
      }
    ],
    "stats": {
      "total": 10,
      "verified": 7,
      "has_pdf": 3,
      "notes_generated": 0
    }
  }
]
```

#### writing.json Schema

```json
{
  "name": "project_name",
  "created_at": "2024-01-01T00:00:00",
  "updated_at": "2024-01-01T00:00:00",
  "main_file": "main.tex",
  "compile_status": "",
  "compile_log": ""
}
```

`compile_status` values: `""` (never compiled), `"success"`, `"error"`.

#### config.json Schema

```json
{
  "base_dir": "/path/to/workspace/root",
  "llm_providers": [
    {
      "id": "provider_39c81c",
      "name": "DeepSeek",
      "base_url": "https://api.deepseek.com",
      "api_key": "sk-...",
      "model": "deepseek-chat",
      "is_default": true,
      "max_tokens": 4096,
      "temperature": 0.7
    }
  ],
  "ui_preferences": {
    "language": "zh-CN",
    "theme": "light"
  }
}
```

---

## Frontend

### Project Structure

```
frontend/src/
├── main.tsx                    # BrowserRouter wrapper
├── App.tsx                     # Routes + sidebar layout
├── index.css                   # Global styles (split-pane, etc.)
├── api/
│   └── index.ts                # Axios client + all API functions
├── stores/
│   ├── useAppStore.ts          # Global state (workspaces, papers)
│   └── useWritingStore.ts      # Writing projects state
├── hooks/
│   └── useSSE.ts               # Reusable SSE consumer hook
├── pages/
│   ├── WorkspacePage.tsx        # Workspace management dashboard
│   ├── PapersPage.tsx           # Paper table with CRUD
│   ├── PaperDetailPage.tsx      # Split-pane: PDF + markdown notes
│   ├── SearchPage.tsx           # AI literature search pipeline
│   ├── GraphPage.tsx            # Force-directed relation graph
│   ├── ExportPage.tsx           # PDF export with AI summary
│   ├── WritingListPage.tsx      # Writing project list
│   ├── WritingPage.tsx          # LaTeX editor + preview + AI tools
│   ├── SettingsPage.tsx         # Base dir + LLM provider config
│   └── GuidePage.tsx            # Static usage guide
└── components/
    ├── PdfViewer.tsx            # react-pdf multi-page viewer
    ├── MarkdownEditor.tsx       # MDEditor wrapper
    ├── MarkdownViewer.tsx       # react-markdown with math support
    ├── TranslationPopup.tsx     # Floating SSE translation popup
    ├── LaTeXEditor.tsx          # CodeMirror 6 with stex highlighting
    ├── LaTeXPreview.tsx         # latex.js live preview
    ├── FolderPicker.tsx         # Server-side directory browser modal
    └── WritingChatPanel.tsx     # AI chat drawer for writing
```

### Routing & Pages

Routes are defined in `App.tsx` using react-router-dom v6.

| Path | Component | Purpose | Key APIs |
|------|-----------|---------|----------|
| `/workspaces` | `WorkspacePage` | Topic/workspace dashboard | `workspaceApi.*`, `paperApi.list`, `fileApi.list` |
| `/papers` | `PapersPage` | Paper table: import PDF, add, edit, filter | `paperApi.*`, `pdfApi.upload` |
| `/papers/:paperId` | `PaperDetailPage` | Split-pane: PDF viewer + markdown editor | `fileApi.read/write`, `pdfApi.viewUrl`, `llmApi.generateNoteUrl` *(SSE)*, `llmApi.translateUrl` *(SSE)* |
| `/search` | `SearchPage` | AI-powered literature search pipeline | `searchApi.startUrl` *(SSE)*, `searchApi.history` |
| `/graph` | `GraphPage` | Interactive force-directed citation graph | `graphApi.*` |
| `/export` | `ExportPage` | Export papers as PDF report | `exportApi.exportHtml`, `exportApi.aiSummaryUrl` *(SSE)* |
| `/writing` | `WritingListPage` | Writing project list (create/delete) | `writingApi.list/create/delete` |
| `/writing/:projectName` | `WritingPage` | LaTeX editor + preview + AI tools | `writingApi.readFile/writeFile/compile/pdfUrl`, AI SSE endpoints |
| `/settings` | `SettingsPage` | Base directory + LLM providers | `settingsApi.*` |
| `/guide` | `GuidePage` | Static usage guide | None |
| `*` | `Navigate to="/workspaces"` | Catch-all redirect | -- |

**Sidebar menu:**

| Label | Path | Icon | Requires Workspace |
|-------|------|------|--------------------|
| 课题管理 | `/workspaces` | `FolderOutlined` | No |
| 论文管理 | `/papers` | `FileTextOutlined` | Yes |
| 文献检索 | `/search` | `SearchOutlined` | Yes |
| 关系图谱 | `/graph` | `ApartmentOutlined` | Yes |
| 导出 | `/export` | `ExportOutlined` | Yes |
| 论文写作 | `/writing` | `FormOutlined` | No |
| 设置 | `/settings` | `SettingOutlined` | No |
| 使用说明 | `/guide` | `QuestionCircleOutlined` | No |

### State Management

Two Zustand stores, both following the same pattern: state fields + async actions that call API functions and update state.

#### useAppStore (`stores/useAppStore.ts`)

**State:**

| Field | Type | Default |
|-------|------|---------|
| `workspaces` | `Workspace[]` | `[]` |
| `currentWorkspace` | `string \| null` | `null` |
| `loadingWorkspaces` | `boolean` | `false` |
| `papers` | `Paper[]` | `[]` |
| `currentPaper` | `Paper \| null` | `null` |
| `loadingPapers` | `boolean` | `false` |

**Actions:**

| Action | Signature | Description |
|--------|-----------|-------------|
| `fetchWorkspaces` | `() => Promise<void>` | Load workspace list |
| `setCurrentWorkspace` | `(name: string \| null) => void` | Set active workspace, auto-fetches papers, clears currentPaper |
| `createWorkspace` | `(name: string) => Promise<Workspace>` | Create + refresh list |
| `deleteWorkspace` | `(name: string) => Promise<void>` | Delete + clear if current + refresh |
| `fetchPapers` | `(workspace?: string) => Promise<void>` | Load papers for workspace |
| `setCurrentPaper` | `(paper: Paper \| null) => void` | Set active paper |
| `createPaper` | `(data: any) => Promise<Paper>` | Create + refresh papers |
| `updatePaper` | `(id: string, data: any) => Promise<Paper>` | Update + refresh papers |
| `deletePaper` | `(id: string) => Promise<void>` | Delete + refresh papers |

#### useWritingStore (`stores/useWritingStore.ts`)

**State:**

| Field | Type | Default |
|-------|------|---------|
| `projects` | `WritingProject[]` | `[]` |
| `currentProject` | `WritingProject \| null` | `null` |
| `loadingProjects` | `boolean` | `false` |

**Actions:**

| Action | Signature | Description |
|--------|-----------|-------------|
| `fetchProjects` | `() => Promise<void>` | Load project list |
| `createProject` | `(name: string, template?: string) => Promise<WritingProject>` | Create + refresh |
| `deleteProject` | `(name: string) => Promise<void>` | Delete + clear if current + refresh |
| `setCurrentProject` | `(project: WritingProject \| null) => void` | Set active project |

### API Client

Defined in `frontend/src/api/index.ts`. Uses Axios with `baseURL: '/api'` and `timeout: 30000`.

SSE endpoints expose URL constants (not functions) since they're consumed via the Fetch API, not Axios.

#### workspaceApi

| Function | Backend Endpoint |
|----------|-----------------|
| `list()` | `GET /api/workspaces` |
| `get(name)` | `GET /api/workspaces/{name}` |
| `create(name)` | `POST /api/workspaces` |
| `delete(name)` | `DELETE /api/workspaces/{name}` |

#### paperApi

| Function | Backend Endpoint |
|----------|-----------------|
| `list(workspace, params?)` | `GET /api/workspaces/{workspace}/papers` |
| `get(workspace, id)` | `GET /api/workspaces/{workspace}/papers/{id}` |
| `create(workspace, data)` | `POST /api/workspaces/{workspace}/papers` |
| `update(workspace, id, data)` | `PUT /api/workspaces/{workspace}/papers/{id}` |
| `delete(workspace, id)` | `DELETE /api/workspaces/{workspace}/papers/{id}` |

#### fileApi

| Function | Backend Endpoint |
|----------|-----------------|
| `list(workspace)` | `GET /api/workspaces/{workspace}/files` |
| `read(workspace, path)` | `GET /api/workspaces/{workspace}/files/read?path=` |
| `write(workspace, path, content)` | `POST /api/workspaces/{workspace}/files/write?path=` |

#### pdfApi

| Function | Backend Endpoint |
|----------|-----------------|
| `upload(workspace, file, paperId?)` | `POST /api/workspaces/{workspace}/pdf/upload` (multipart, 60s timeout) |
| `viewUrl(workspace, path)` | URL builder: `/api/workspaces/{workspace}/pdf/view?path=` |

#### llmApi

| Function | Backend Endpoint |
|----------|-----------------|
| `chat(messages, providerId?)` | `POST /api/llm/chat` |
| `streamUrl` | URL: `/api/llm/chat` |
| `generateNoteUrl` | URL: `/api/llm/generate_note` |
| `translateUrl` | URL: `/api/llm/translate` |

#### graphApi

| Function | Backend Endpoint |
|----------|-----------------|
| `get(workspace)` | `GET /api/workspaces/{workspace}/graph` |
| `addRelation(workspace, ...)` | `POST /api/workspaces/{workspace}/graph/relations` |
| `removeRelation(workspace, ...)` | `DELETE /api/workspaces/{workspace}/graph/relations` |

#### exportApi

| Function | Backend Endpoint |
|----------|-----------------|
| `exportHtml(workspace, ...)` | `POST /api/workspaces/{workspace}/export` |
| `exportSingleHtml(workspace, paperId)` | `POST /api/workspaces/{workspace}/export/single/{paperId}` |
| `aiSummaryUrl(workspace)` | URL builder: `/api/workspaces/{workspace}/export/ai_summary` |

#### settingsApi

| Function | Backend Endpoint |
|----------|-----------------|
| `get()` | `GET /api/settings` |
| `getBaseDir()` | `GET /api/settings/base_dir` |
| `setBaseDir(base_dir)` | `PUT /api/settings/base_dir` |
| `browseDir(path?)` | `GET /api/settings/browse?path=` |
| `mkdir(path)` | `POST /api/settings/mkdir` |
| `listProviders()` | `GET /api/settings/providers` |
| `addProvider(data)` | `POST /api/settings/providers` |
| `updateProvider(id, data)` | `PUT /api/settings/providers/{id}` |
| `deleteProvider(id)` | `DELETE /api/settings/providers/{id}` |

#### searchApi

| Function | Backend Endpoint |
|----------|-----------------|
| `startUrl` | URL: `/api/search/start` |
| `history(workspace)` | `GET /api/search/history?workspace=` |
| `historyDetail(workspace, searchId)` | `GET /api/search/history/{searchId}?workspace=` |
| `deleteHistory(workspace, searchId)` | `DELETE /api/search/history/{searchId}?workspace=` |

#### writingApi

| Function | Backend Endpoint |
|----------|-----------------|
| `list()` | `GET /api/writing/projects` |
| `get(name)` | `GET /api/writing/projects/{name}` |
| `create(name, template)` | `POST /api/writing/projects` |
| `delete(name)` | `DELETE /api/writing/projects/{name}` |
| `listFiles(name)` | `GET /api/writing/projects/{name}/files` |
| `readFile(name, path)` | `GET /api/writing/projects/{name}/files/read?path=` |
| `writeFile(name, path, content)` | `POST /api/writing/projects/{name}/files/write?path=` |
| `compile(name)` | `POST /api/writing/projects/{name}/compile` (130s timeout) |
| `pdfUrl(name)` | URL builder: `/api/writing/projects/{name}/pdf` |
| `aiContinueUrl` | URL: `/api/writing/ai/continue` |
| `aiPolishUrl` | URL: `/api/writing/ai/polish` |
| `aiGenerateSectionUrl` | URL: `/api/writing/ai/generate_section` |
| `aiChatUrl` | URL: `/api/writing/ai/chat` |

### Reusable Components

All in `frontend/src/components/`.

| Component | Props | Purpose |
|-----------|-------|---------|
| `PdfViewer` | `url: string`, `dragging?: boolean` | Multi-page PDF rendering via `react-pdf`. Uses `ResizeObserver` for responsive width. Text/annotation layers enabled. CMap CDN for CJK support |
| `MarkdownEditor` | `value: string`, `onChange: (val) => void` | Wraps `@uiw/react-md-editor` for live markdown editing with preview |
| `MarkdownViewer` | `content: string` | Read-only markdown via `react-markdown` + `remark-gfm` + `remark-math` + `rehype-katex` |
| `TranslationPopup` | `text: string`, `position: {x, y}`, `onClose: () => void` | Floating popup streaming translation via SSE. Positioned near cursor, closes on click-outside |
| `FolderPicker` | `open: boolean`, `initialPath?: string`, `onOk: (path) => void`, `onCancel: () => void` | Modal directory browser with breadcrumbs, address bar, new folder creation |
| `LaTeXEditor` | `value: string`, `onChange: (val) => void`, `editorViewRef?`, `onSave?` | CodeMirror 6 with `stex` syntax highlighting, Ctrl+S keymap, exposes EditorView ref |
| `LaTeXPreview` | `content: string` | Client-side LaTeX-to-HTML via `latex.js`. Strips unsupported packages. 300ms debounce |
| `WritingChatPanel` | `open: boolean`, `onClose`, `paperContext: string`, `projectName: string`, `onInsertText?` | Drawer-based AI chat for writing. Streams via SSE. Copy/insert-to-editor actions |

### Key Patterns

#### SSE Consumption

Two patterns used on the frontend:

**Pattern A: `useSSE` hook** (`hooks/useSSE.ts`)

```typescript
const { start, stop } = useSSE();

start(url, body, {
  onMessage: (content: string) => { /* append to state */ },
  onError: (error: string) => { /* show error */ },
  onDone: () => { /* finalize */ },
});
```

- Sends POST with JSON body via Fetch API
- Reads `ReadableStream` via `getReader()`
- Parses SSE lines: `data: {...}` -> JSON parse -> extract `content`/`error`
- Supports abort via `AbortController`
- **Used by:** `WritingPage`, `WritingChatPanel`

**Pattern B: Inline SSE** (directly in page components)

Same Fetch + ReadableStream + SSE parsing logic, but implemented inline.
**Used by:** `PaperDetailPage`, `SearchPage`, `ExportPage`, `TranslationPopup`

#### Split-Pane

Used in `PaperDetailPage` (PDF + notes) and `WritingPage` (editor + preview):

- `splitPercent` state (default 50) -> left panel `width: ${splitPercent}%`
- Right panel `width: calc(${100 - splitPercent}% - 6px)`
- Drag handle `<div>` with `onMouseDown` -> `mousemove`/`mouseup` listeners
- Clamped between 15-85%
- During drag: `cursor: col-resize`, `userSelect: none` on body, `pointerEvents: none` on panels
- `PaperDetailPage` has preset buttons: 7:3 / 5:5 / 3:7

#### Form Handling

All forms use Ant Design `Form` with `Form.useForm()`:

- **PapersPage**: Modal form for add/edit paper. Comma-separated authors/keywords split on submit. Cross-field validation (at least one title required). Pre-fills from PDF metadata on import
- **SearchPage**: Direction (TextArea), paper_count (InputNumber), year range, extra requirements, auto_generate_notes (Switch)
- **SettingsPage**: LLM provider form with name, base_url, api_key (Password), model, max_tokens, temperature, is_default (Switch)
- **Workspace/Writing**: Simple name input modals

#### PDF Rendering

Three approaches:

1. **`react-pdf`** (primary) -- `PdfViewer` component. Multi-page, text-selectable, CJK support via CMap CDN. Used for reading papers and viewing compiled LaTeX output
2. **`latex.js`** (live preview) -- `LaTeXPreview` component. Client-side LaTeX-to-HTML. Strips unsupported packages (ctex, xeCJK, tikz, etc.). 300ms debounce
3. **Browser print-to-PDF** (export) -- `ExportPage` generates HTML, opens in new window, triggers `window.print()`

---

## SSE Streaming Protocol

### Standard LLM Streaming (8 endpoints)

Used by all LLM-powered endpoints except search.

**Endpoints:** `/api/llm/chat`, `/api/llm/translate`, `/api/llm/generate_note`, `.../export/ai_summary`, `/api/writing/ai/continue`, `/api/writing/ai/polish`, `/api/writing/ai/generate_section`, `/api/writing/ai/chat`

| SSE Event | Data Shape | Description |
|-----------|------------|-------------|
| `message` | `{"content": "<chunk>"}` | Text chunk from LLM (sent repeatedly) |
| `done` | `{}` | Stream complete |
| `error` | `{"error": "<message>"}` | Error occurred |

Backend emission:

```python
yield {"event": "message", "data": json.dumps({"content": chunk})}
yield {"event": "done", "data": "{}"}
yield {"event": "error", "data": json.dumps({"error": str(e)})}
```

All return `EventSourceResponse(event_generator())` from `sse_starlette`.

### Search Pipeline SSE (1 endpoint)

`POST /api/search/start` uses a single `event: message` with a `stage` field to distinguish pipeline phases.

| Stage | Data Shape | Description |
|-------|------------|-------------|
| `llm` | `{"stage": "llm", "message": "..."}` | Starting LLM recommendation |
| `llm_stream` | `{"stage": "llm_stream", "content": "..."}` | Streaming LLM token |
| `llm_done` | `{"stage": "llm_done", "message": "...", "count": N}` | LLM phase complete |
| `verify` | `{"stage": "verify", "message": "..."}` | Starting CrossRef verification |
| `verify_progress` | `{"stage": "verify_progress", "current": N, "total": N, "title": "..."}` | Verification progress |
| `verify_done` | `{"stage": "verify_done", "message": "..."}` | Verification complete |
| `download` | `{"stage": "download", "message": "..."}` | Starting PDF download |
| `download_progress` | `{"stage": "download_progress", "current": N, "total": N, "title": "..."}` | Download progress |
| `download_done` | `{"stage": "download_done", "message": "..."}` | Download complete |
| `import` | `{"stage": "import", "message": "..."}` | Starting workspace import |
| `import_progress` | `{"stage": "import_progress", "current": N, "total": N, "title": "..."}` | Import progress |
| `import_done` | `{"stage": "import_done", "message": "..."}` | Import complete |
| `generate` | `{"stage": "generate", "message": "..."}` | Starting AI note generation |
| `generate_progress` | `{"stage": "generate_progress", "current": N, "total": N, "title": "..."}` | Note generation progress |
| `generate_done` | `{"stage": "generate_done", "message": "..."}` | Note generation complete |
| `done` | `{"stage": "done", "message": "...", "search_id": "...", "results": [...], "stats": {...}}` | Pipeline complete |
| `error` | `{"stage": "error", "message": "..."}` | Fatal error |

Frontend maps stages to a 5-step stepper:

| Step | Label | Stages |
|------|-------|--------|
| 0 | AI 检索 | `llm`, `llm_stream`, `llm_done` |
| 1 | 数据库验证 | `verify`, `verify_progress`, `verify_done` |
| 2 | PDF 下载 | `download`, `download_progress`, `download_done` |
| 3 | 导入文献库 | `import`, `import_progress`, `import_done` |
| 4 | 生成总结 | `generate`, `generate_progress`, `generate_done` |

---

## Configuration

### config.json

Located at project root (`literature-review-app/config.json`). Gitignored; `config.json.example` is committed.

```json
{
  "base_dir": "",
  "llm_providers": [
    {
      "id": "provider_39c81c",
      "name": "DeepSeek",
      "base_url": "https://api.deepseek.com",
      "api_key": "sk-...",
      "model": "deepseek-chat",
      "is_default": true,
      "max_tokens": 4096,
      "temperature": 0.7
    }
  ],
  "ui_preferences": {
    "language": "zh-CN",
    "theme": "light"
  }
}
```

### Base Directory Resolution (config.py)

| Priority | Source | Description |
|----------|--------|-------------|
| 1 (highest) | `config.json["base_dir"]` | If set and non-empty |
| 2 | `LR_BASE_DIR` env var | If set and non-empty |
| 3 (fallback) | Parent of project root | `_DEFAULT_BASE_DIR` |

### Config Initialization

On first run, `_ensure_config()` copies `config.json.example` to `config.json` if the latter doesn't exist. If neither exists, writes default empty config.

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `LR_BASE_DIR` | Fallback workspace root directory (priority 2) |

---

## Development Setup

### Prerequisites

| Dependency | Minimum Version |
|------------|----------------|
| Python | >= 3.10 |
| Node.js | >= 18.0 |
| npm | >= 9.0 |
| xelatex | Any (optional, for LaTeX compilation) |

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev    # Starts Vite dev server on :5173
```

### One-Click Start

```bash
./start.sh     # Starts both servers, Ctrl+C stops both
```

### Ports

| Service | Port | URL |
|---------|------|-----|
| Backend (FastAPI) | 8000 | `http://127.0.0.1:8000` |
| Frontend (Vite) | 5173 | `http://127.0.0.1:5173` |
| Swagger API Docs | 8000 | `http://127.0.0.1:8000/docs` |

### Proxy

Vite dev server proxies all `/api/*` requests to `http://127.0.0.1:8000` (configured in `vite.config.ts`). In production, the backend serves the built frontend from `frontend/dist/` as static files.

### CORS

Backend allows origins `http://localhost:5173` and `http://127.0.0.1:5173` with all methods and headers.

---

## Adding New Features Guide

### Checklist: Backend Feature

1. **Model** (`models/__init__.py`)
   - Add Pydantic models for request/response if needed
   - Add any new enums

2. **Service** (`services/`)
   - Implement business logic in the appropriate service file
   - Follow existing pattern: module-level functions, no classes
   - For JSON storage: use `_load`/`_save` pattern (see `paper_service.py`)
   - For LLM calls: use `llm_service.chat_stream()` or `chat_completion()`

3. **API Route** (`api/`)
   - Add route handler in the appropriate router file
   - For SSE endpoints, follow the `event_generator` pattern:
     ```python
     async def event_generator():
         try:
             async for chunk in llm_service.chat_stream(messages, provider_id):
                 yield {"event": "message", "data": json.dumps({"content": chunk})}
             yield {"event": "done", "data": "{}"}
         except Exception as e:
             yield {"event": "error", "data": json.dumps({"error": str(e)})}
     return EventSourceResponse(event_generator())
     ```
   - Register new routers in `main.py` if creating a new module

### Checklist: Frontend Feature

4. **API Client** (`api/index.ts`)
   - Add REST functions to the appropriate API object
   - For SSE endpoints, export a URL constant

5. **Store** (`stores/`)
   - Add state fields and actions to the appropriate Zustand store
   - Follow pattern: action calls API, then `set()` to update state

6. **Page/Component** (`pages/` or `components/`)
   - Create or modify page component
   - For SSE consumption, use the `useSSE` hook or inline fetch pattern
   - For split-pane layouts, follow the `splitPercent` + mouse event pattern
   - Register route in `App.tsx` if adding a new page

7. **Documentation**
   - Update `GuidePage.tsx` (usage guide)
   - Update `README.md`

### Example: Adding a New LLM-Powered Feature

```
models/__init__.py     → Add MyFeatureRequest model
services/my_service.py → Implement logic using llm_service.chat_stream()
api/my_router.py       → Add SSE endpoint returning EventSourceResponse
main.py                → Register router: app.include_router(my_router.router)
api/index.ts           → Add URL constant: myFeatureUrl: '/api/my/feature'
hooks/useSSE.ts        → Consume via useSSE hook in page component
pages/MyPage.tsx       → Build UI with streaming display
App.tsx                → Add route and sidebar menu item
```
