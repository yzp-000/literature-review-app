"""Export service — generate combined HTML from paper markdown notes."""
from __future__ import annotations

import markdown
from markdown.extensions.tables import TableExtension
from markdown.extensions.fenced_code import FencedCodeExtension
from markdown.extensions.toc import TocExtension

from services.paper_service import list_papers
from services.markdown_service import read_markdown


# CSS for print-friendly PDF output
PRINT_CSS = """
@page {
  size: A4;
  margin: 20mm 18mm;
}
body {
  font-family: "Noto Sans SC", "PingFang SC", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif;
  font-size: 11pt;
  line-height: 1.7;
  color: #222;
  max-width: 100%;
}
h1 {
  font-size: 18pt;
  border-bottom: 2px solid #1890ff;
  padding-bottom: 6px;
  margin-top: 0;
  page-break-after: avoid;
}
h2 {
  font-size: 14pt;
  border-bottom: 1px solid #ddd;
  padding-bottom: 4px;
  margin-top: 20px;
  page-break-after: avoid;
}
h3 {
  font-size: 12pt;
  margin-top: 16px;
  page-break-after: avoid;
}
table {
  border-collapse: collapse;
  width: 100%;
  margin: 10px 0;
  font-size: 10pt;
}
th, td {
  border: 1px solid #ccc;
  padding: 6px 10px;
  text-align: left;
}
th {
  background: #f5f5f5;
}
blockquote {
  border-left: 4px solid #1890ff;
  margin: 10px 0;
  padding: 4px 16px;
  color: #555;
  background: #f9f9f9;
}
code {
  background: #f0f0f0;
  padding: 2px 4px;
  border-radius: 3px;
  font-size: 10pt;
}
pre {
  background: #f5f5f5;
  padding: 12px;
  border-radius: 4px;
  overflow-x: auto;
  font-size: 9pt;
}
hr {
  border: none;
  border-top: 1px solid #ddd;
  margin: 16px 0;
}
.paper-separator {
  page-break-before: always;
  border: none;
  border-top: 3px solid #1890ff;
  margin: 30px 0 20px;
}
.cover-page {
  text-align: center;
  padding-top: 120px;
  page-break-after: always;
}
.cover-page h1 {
  font-size: 24pt;
  border: none;
  color: #1890ff;
}
.cover-page .meta {
  font-size: 12pt;
  color: #666;
  margin-top: 20px;
}
.toc {
  page-break-after: always;
  padding: 20px 0;
}
.toc h2 {
  border-bottom: 2px solid #1890ff;
}
.toc ul {
  list-style: none;
  padding-left: 0;
}
.toc li {
  padding: 4px 0;
  border-bottom: 1px dotted #ddd;
}
.toc li a {
  text-decoration: none;
  color: #333;
}
/* KaTeX math support */
.katex { font-size: 1em; }
@media print {
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
"""

MD_EXTENSIONS = [
    TableExtension(),
    FencedCodeExtension(),
    TocExtension(permalink=False),
    "md_in_html",
]


def export_pdf_html(
    workspace: str,
    paper_ids: list[str] | None = None,
    include_cover: bool = True,
    include_toc: bool = True,
    ai_summary: str = "",
) -> str:
    """Export selected papers' markdown notes as a combined HTML document for PDF printing."""
    papers = list_papers(workspace)
    if paper_ids:
        papers = [p for p in papers if p["id"] in paper_ids]

    if not papers:
        papers = list_papers(workspace)

    # Sort by number
    papers.sort(key=lambda p: p.get("number", 0))

    # Build cover page
    cover_html = ""
    if include_cover:
        total = len(papers)
        completed = sum(1 for p in papers if p.get("status") == "completed")
        reading = sum(1 for p in papers if p.get("status") == "reading")
        cover_html = f"""
<div class="cover-page">
  <h1>{workspace}</h1>
  <p style="font-size:16pt; color:#333;">文献调研报告</p>
  <div class="meta">
    <p>共 {total} 篇论文 &nbsp;|&nbsp; 已完成 {completed} 篇 &nbsp;|&nbsp; 阅读中 {reading} 篇</p>
  </div>
</div>
"""

    # Build TOC
    toc_html = ""
    if include_toc and len(papers) > 1:
        toc_items = ""
        if ai_summary:
            toc_items += '<li style="font-weight:600;color:#1890ff;">综合总结（AI 生成）</li>\n'
        for p in papers:
            title = p.get("title_zh") or p.get("title_en") or "未命名"
            num = p.get("number", "?")
            authors = ", ".join(p.get("authors", []))[:40]
            year = p.get("year", "")
            toc_items += f'<li>#{num} &nbsp; {title} <span style="float:right;color:#999;">{authors} ({year})</span></li>\n'
        toc_html = f"""
<div class="toc">
  <h2>目录</h2>
  <ul>{toc_items}</ul>
</div>
"""

    # Build AI summary section
    summary_html = ""
    if ai_summary:
        md_conv = markdown.Markdown(extensions=MD_EXTENSIONS)
        summary_body = md_conv.convert(ai_summary)
        summary_html = f"""
<div class="ai-summary">
{summary_body}
</div>
<hr class="paper-separator" />
"""

    # Build paper content
    md_converter = markdown.Markdown(extensions=MD_EXTENSIONS)
    papers_html = ""
    for i, paper in enumerate(papers):
        md_path = paper.get("markdown_path", "")
        content = ""
        if md_path:
            raw = read_markdown(workspace, md_path)
            if raw:
                content = raw

        if not content:
            # Generate minimal content from metadata
            title = paper.get("title_zh") or paper.get("title_en") or "未命名"
            authors = ", ".join(paper.get("authors", []))
            content = f"# {title}\n\n> 作者: {authors}\n> 年份: {paper.get('year', '')}\n> 期刊: {paper.get('journal', '')}\n\n（暂无笔记内容）\n"

        md_converter.reset()
        html_body = md_converter.convert(content)

        separator = '<hr class="paper-separator" />' if i > 0 else ""
        papers_html += f"{separator}\n<article>{html_body}</article>\n"

    # Assemble full HTML
    full_html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>{workspace} — 文献调研报告</title>
<style>{PRINT_CSS}</style>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
</head>
<body>
{cover_html}
{toc_html}
{summary_html}
{papers_html}
</body>
</html>"""
    return full_html


def export_single_paper_html(workspace: str, paper_id: str) -> str:
    """Export a single paper's markdown note as HTML for PDF printing."""
    return export_pdf_html(workspace, paper_ids=[paper_id], include_cover=False, include_toc=False)
