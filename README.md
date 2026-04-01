# 文献调研管理系统 (Literature Review App)

一个本地化的文献调研管理 Web 应用，帮助研究者高效管理论文、记录笔记、检索文献、分析关系并导出报告。

> 所有数据存储在本地文件系统（JSON + Markdown），人类可读、Git 友好，不依赖数据库。

## 功能特性

- **课题管理** — 多课题独立工作空间，自动创建标准目录结构，概览仪表盘
- **论文管理** — PDF 导入自动解析元数据、手动添加、编辑论文信息、搜索筛选、列显示配置
- **分屏阅读** — 左侧 PDF（react-pdf 渲染，支持文字选中）右侧 Markdown 笔记，可拖拽调节比例，支持 LaTeX 公式渲染
- **划词翻译** — PDF 和笔记区域均可划词翻译，选中英文即弹出翻译小窗，流式显示中文结果
- **AI 生成笔记** — 基于 PDF 内容自动生成 7 节结构化论文笔记（流式输出）
- **文献检索** — AI 推荐论文 → CrossRef 验证 → 自动下载 PDF → 导入文献库 → 可选自动生成笔记
- **关系图谱** — 力导向交互式图谱，可视化论文引用/关联/对比等关系，支持添加/删除
- **导出报告** — 导出为 PDF，支持 AI 综合文献总结放在报告最前面
- **论文写作** — AI 辅助 LaTeX 论文写作：CodeMirror 6 编辑器 + latex.js 实时预览 + xelatex PDF 编译，支持 AI 续写/润色/生成章节/对话
- **多 LLM 支持** — 兼容任何 OpenAI 格式 API（DeepSeek、OpenAI、Claude 等）

## 截图预览

> TODO: 添加截图

## 环境要求

| 依赖 | 最低版本 | 说明 |
|------|---------|------|
| Python | >= 3.10 | 后端运行环境 |
| Node.js | >= 18.0 | 前端构建和开发 |
| npm | >= 9.0 | 前端包管理 |

## 快速开始

### 0. 安装基础环境

如果你的系统还没有 Python、Node.js 或 Git，请先安装：

<details>
<summary><b>Ubuntu / Debian</b></summary>

```bash
# 更新包索引
sudo apt update

# 安装 Python 3 和 pip
sudo apt install -y python3 python3-pip python3-venv

# 安装 Node.js 18.x 和 npm
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# 安装 Git
sudo apt install -y git

# 验证
python3 --version   # >= 3.10
node --version       # >= 18.0
npm --version        # >= 9.0
git --version
```

</details>

<details>
<summary><b>macOS</b></summary>

```bash
# 安装 Homebrew（如果没有）
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 安装 Python、Node.js、Git
brew install python node git

# 验证
python3 --version
node --version
npm --version
```

</details>

<details>
<summary><b>Windows</b></summary>

1. **Python**: 下载安装 https://www.python.org/downloads/ （勾选 "Add to PATH"）
2. **Node.js**: 下载安装 https://nodejs.org/ （LTS 版本，自带 npm）
3. **Git**: 下载安装 https://git-scm.com/download/win

安装后在终端验证：
```bash
python --version
node --version
npm --version
git --version
```

</details>

<details>
<summary><b>使用 Conda（推荐科研用户）</b></summary>

如果你已有 Anaconda / Miniconda：

```bash
# 创建专用环境
conda create -n litreview python=3.11 nodejs=18 -y
conda activate litreview

# 验证
python --version
node --version
npm --version
```

</details>

### 1. 克隆项目

```bash
git clone https://github.com/yzp-000/literature-review-app.git
cd literature-review-app
```

### 2. 安装后端依赖

```bash
cd backend
pip install -r requirements.txt
```

> 建议使用虚拟环境（venv / conda）避免与系统包冲突：
> ```bash
> python3 -m venv .venv && source .venv/bin/activate  # Linux/macOS
> python -m venv .venv && .venv\Scripts\activate       # Windows
> pip install -r requirements.txt
> ```

### 3. 安装前端依赖

```bash
cd ../frontend
npm install
```

> 国内用户如果下载慢，可以使用镜像源：
> ```bash
> npm install --registry=https://registry.npmmirror.com
> ```

### 4. 配置（可选）

复制示例配置文件：

```bash
cd ..
cp config.json.example config.json
```

编辑 `config.json`，填入你的 LLM API Key 和工作目录路径。

> 也可以跳过此步，启动后在「设置」页面通过 Web 界面配置。首次启动时应用会自动从 `config.json.example` 生成默认配置。

### 5. 启动

一键启动（同时启动前后端）：

```bash
chmod +x start.sh
./start.sh
```

或手动分别启动：

```bash
# 终端 1 — 后端
cd backend
uvicorn main:app --host 127.0.0.1 --port 8000 --reload

# 终端 2 — 前端
cd frontend
npx vite --host 127.0.0.1 --port 5173
```

### 6. 访问

| 服务 | 地址 |
|------|------|
| 前端界面 | http://127.0.0.1:5173 |
| 后端 API 文档 | http://127.0.0.1:8000/docs |

### 7. 首次使用

1. 进入「设置」页 → 配置工作目录（论文数据存放位置）→ 添加 LLM 提供商（填写 API Key）
2. 进入「课题管理」→ 新建课题
3. 进入「论文管理」→ 导入 PDF 或手动添加论文
4. 点击论文标题 → 分屏阅读 PDF & 编辑笔记

## 版本更新

当有新版本发布时，运行一键更新脚本即可：

```bash
cd literature-review-app
chmod +x update.sh
./update.sh
```

更新脚本会自动完成：

1. 拉取最新代码（`git pull`）
2. 更新后端 Python 依赖（`pip install`）
3. 更新前端 Node 依赖（`npm install`）

> 如果本地有未提交的修改，脚本会提示是否暂存（`git stash`），更新完成后自动恢复。

## 技术栈

| 层 | 技术 |
|---|---|
| 前端框架 | React 18 + TypeScript + Vite |
| UI 组件 | Ant Design 5 |
| 状态管理 | Zustand |
| 图谱可视化 | react-force-graph-2d (d3-force) |
| PDF 渲染 | react-pdf (pdfjs-dist) |
| Markdown 编辑 | @uiw/react-md-editor |
| LaTeX 编辑 | @uiw/react-codemirror (CodeMirror 6) |
| LaTeX 实时预览 | latex.js |
| 公式渲染 | remark-math + rehype-katex |
| 后端框架 | Python FastAPI + Uvicorn |
| PDF 解析 | PyMuPDF (pymupdf4llm) |
| LLM 调用 | httpx (OpenAI 兼容格式) |
| 流式输出 | SSE (sse-starlette) |
| 数据存储 | JSON + Markdown 文件 |

## 项目结构

```
literature-review-app/
├── .gitignore
├── README.md
├── config.json.example          # 配置文件示例（真实 config.json 被 gitignore）
├── start.sh                     # 一键启动脚本
│
├── backend/                     # Python FastAPI 后端
│   ├── main.py                  # 应用入口 & CORS 配置
│   ├── config.py                # 全局配置管理
│   ├── requirements.txt         # Python 依赖清单
│   ├── api/                     # API 路由层
│   │   ├── papers.py            # 论文 CRUD
│   │   ├── workspace.py         # 课题管理
│   │   ├── llm.py               # LLM 对话 & AI 笔记生成
│   │   ├── search.py            # 文献检索（SSE 流式）
│   │   ├── pdf.py               # PDF 上传/解析/预览
│   │   ├── graph.py             # 关系图谱 & 关系管理
│   │   ├── export.py            # PDF 导出 & AI 综合总结
│   │   ├── files.py             # Markdown 文件读写
│   │   ├── writing.py           # 论文写作（项目CRUD、编译、AI写作）
│   │   └── settings.py          # 设置管理
│   ├── services/                # 业务逻辑层
│   │   ├── paper_service.py     # 论文操作
│   │   ├── workspace_service.py # 工作空间管理
│   │   ├── llm_service.py       # LLM 调用编排
│   │   ├── search_service.py    # 检索流水线（LLM→CrossRef→PDF→导入）
│   │   ├── pdf_service.py       # PDF 解析
│   │   ├── graph_service.py     # 关系图谱计算
│   │   ├── markdown_service.py  # Markdown 读写
│   │   ├── writing_service.py   # 论文写作项目管理 & xelatex 编译
│   │   └── export_service.py    # HTML 导出渲染
│   ├── models/                  # Pydantic 数据模型
│   ├── llm_providers/           # LLM 提供商抽象层
│   └── templates/               # Jinja2 模板
│
└── frontend/                    # React + TypeScript 前端
    ├── package.json
    ├── vite.config.ts
    └── src/
        ├── App.tsx              # 路由 & 布局
        ├── api/index.ts         # API 客户端
        ├── stores/useAppStore.ts # Zustand 全局状态
        ├── pages/               # 页面组件
        │   ├── WorkspacePage    # 课题管理 & 概览
        │   ├── PapersPage       # 论文列表
        │   ├── PaperDetailPage  # 分屏阅读（PDF + 笔记）
        │   ├── SearchPage       # 文献检索
        │   ├── GraphPage        # 关系图谱
        │   ├── ExportPage       # 导出 & AI 总结
        │   ├── WritingListPage  # 写作项目列表
        │   ├── WritingPage      # 写作主页面（编辑器+预览+AI）
        │   ├── SettingsPage     # 设置
        │   └── GuidePage        # 使用说明
        └── components/          # 可复用组件
            ├── PdfViewer        # PDF 渲染（react-pdf，支持文字选中）
            ├── TranslationPopup # 划词翻译弹窗
            ├── MarkdownEditor   # Markdown 编辑器
            ├── MarkdownViewer   # Markdown 渲染（含数学公式）
            ├── LaTeXEditor      # LaTeX 编辑器（CodeMirror 6）
            ├── LaTeXPreview     # LaTeX 实时预览（latex.js）
            └── WritingChatPanel # AI 写作对话面板
```

## 数据存储

所有数据以人类可读格式存储在本地文件系统，无需数据库：

```
工作目录/
├── [课题A]_文献调研/
│   ├── papers.json                # 论文元数据（含关系、标签、LLM 记录）
│   ├── search_history.json        # 检索历史记录
│   ├── pdfs/                      # PDF 文件
│   │   ├── paper_001.pdf
│   │   └── ...
│   ├── 00_总览总结/
│   │   └── 总览总结.md
│   ├── 01_单篇论文/               # 每篇论文的 7 节结构化笔记
│   │   ├── 01_[标题].md
│   │   └── 02_[标题].md
│   └── 02_关键技术总结/
│       └── 01_[主题].md
│
└── [课题B]_文献调研/
    └── ...

├── [项目名]_论文写作/                # 论文写作项目
│   ├── writing.json                # 项目元数据
│   ├── main.tex                    # 主 LaTeX 文件
│   └── output/                     # 编译输出
│       └── main.pdf
```

## 支持的 LLM 提供商

兼容所有 OpenAI `/v1/chat/completions` 格式的 API：

| 提供商 | Base URL 示例 |
|--------|--------------|
| [DeepSeek](https://platform.deepseek.com/) | `https://api.deepseek.com/` |
| [OpenAI](https://platform.openai.com/) | `https://api.openai.com/` |
| [Anthropic Claude](https://docs.anthropic.com/) (兼容网关) | 视网关地址而定 |
| [通义千问](https://dashscope.aliyun.com/) | `https://dashscope.aliyuncs.com/compatible-mode/` |
| [智谱 GLM](https://open.bigmodel.cn/) | `https://open.bigmodel.cn/api/paas/` |
| [Ollama](https://ollama.ai/) (本地) | `http://localhost:11434/` |

> 系统会自动补全 URL 中缺少的 `/v1` 路径，无需手动添加。

## 常见问题

<details>
<summary>启动时提示端口被占用？</summary>

修改 `start.sh` 中的端口号，或手动用其他端口启动：

```bash
uvicorn main:app --port 8001         # 后端换端口
npx vite --port 5174                 # 前端换端口
```

前端换端口后需同步修改 `frontend/vite.config.ts` 中的代理目标地址。

</details>

<details>
<summary>如何导入已有的调研数据？</summary>

将已有的 `[课题名]_文献调研/` 文件夹放到工作目录下，确保包含 `papers.json` 文件，系统会自动识别。

</details>

<details>
<summary>API Key 安全吗？</summary>

API Key 存储在本地 `config.json` 中（已被 `.gitignore` 排除），不会上传到 Git 仓库。设置页面中以脱敏形式显示。编辑提供商时，API Key 栏留空即保持原 Key 不变，无需重复输入。

</details>

## License

MIT
