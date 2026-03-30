"""PDF service — upload, parse, extract metadata."""
from __future__ import annotations

import re
from pathlib import Path

from services.workspace_service import get_workspace_path


def save_pdf(workspace: str, filename: str, content: bytes) -> str:
    """Save uploaded PDF to workspace pdfs/ directory. Returns relative path."""
    ws_path = get_workspace_path(workspace)
    pdf_dir = ws_path / "pdfs"
    pdf_dir.mkdir(parents=True, exist_ok=True)
    dest = pdf_dir / filename
    dest.write_bytes(content)
    return f"pdfs/{filename}"


def get_pdf_path(workspace: str, relative_path: str) -> Path | None:
    """Get the absolute path of a PDF file."""
    ws_path = get_workspace_path(workspace)
    file_path = ws_path / relative_path
    try:
        file_path.resolve().relative_to(ws_path.resolve())
    except ValueError:
        return None
    if not file_path.exists():
        return None
    return file_path


def extract_text(pdf_path: Path, max_pages: int = 0) -> str:
    """Extract full text from PDF."""
    try:
        import fitz
        doc = fitz.open(str(pdf_path))
        text = ""
        limit = max_pages if max_pages > 0 else doc.page_count
        for i, page in enumerate(doc):
            if i >= limit:
                break
            text += page.get_text() + "\n\n"
        doc.close()
        return text
    except Exception:
        return ""


def extract_metadata(pdf_path: Path) -> dict:
    """Extract rich metadata from PDF using PyMuPDF + heuristics.

    Returns dict with keys:
      title_en, title_zh, authors, year, journal, doi, keywords,
      abstract, page_count
    """
    result = {
        "title_en": "",
        "title_zh": "",
        "authors": [],
        "year": None,
        "journal": "",
        "doi": "",
        "keywords": [],
        "abstract": "",
        "page_count": 0,
    }

    try:
        import fitz
    except ImportError:
        return result

    try:
        doc = fitz.open(str(pdf_path))
    except Exception:
        return result

    result["page_count"] = doc.page_count
    meta = doc.metadata or {}

    # ── 1. Extract first-few-pages text for heuristic parsing ──
    first_pages_text = ""
    for i in range(min(3, doc.page_count)):
        first_pages_text += doc[i].get_text() + "\n"
    doc.close()

    lines = [l.strip() for l in first_pages_text.split("\n") if l.strip()]

    # ── 2. DOI ──
    doi_match = re.search(r'(10\.\d{4,9}/[^\s,;]+)', first_pages_text)
    if doi_match:
        result["doi"] = doi_match.group(1).rstrip(".")

    # ── 3. Title from PDF metadata, fallback to heuristic ──
    pdf_title = (meta.get("title") or "").strip()
    if pdf_title and len(pdf_title) > 5:
        if re.search(r'[\u4e00-\u9fff]', pdf_title):
            result["title_zh"] = pdf_title
        else:
            result["title_en"] = pdf_title
    else:
        # Heuristic: pick the longest of the first few non-trivial lines
        candidates = []
        for l in lines[:15]:
            # Skip very short lines or lines that look like metadata
            if len(l) < 8:
                continue
            if re.match(r'^(abstract|keywords|doi|http|copyright|©|\d{4})', l, re.I):
                continue
            if re.match(r'^(vol\.|issue|pp\.)', l, re.I):
                continue
            candidates.append(l)
        if candidates:
            # The title is usually among the first long-ish, prominent lines
            best = max(candidates[:5], key=len) if candidates else ""
            if best:
                if re.search(r'[\u4e00-\u9fff]', best):
                    result["title_zh"] = best[:300]
                else:
                    result["title_en"] = best[:300]

    # ── 4. Authors from PDF metadata ──
    pdf_author = (meta.get("author") or "").strip()
    if pdf_author:
        # Split by common separators
        parts = re.split(r'[,;，；&]|\band\b', pdf_author)
        result["authors"] = [a.strip() for a in parts if a.strip()]

    # If no metadata authors, try heuristic from text
    if not result["authors"]:
        # Look for a line near the top that looks like an author list
        for l in lines[1:10]:
            # Skip the title (already captured), skip trivial lines
            if l == result["title_en"] or l == result["title_zh"]:
                continue
            if len(l) < 5 or len(l) > 500:
                continue
            # Author lines often contain commas, numbers (superscripts), etc.
            # But should not look like a sentence (no period at end normally)
            if re.match(r'^(abstract|keywords|doi|http|copyright)', l, re.I):
                break  # We've passed the author region
            # Heuristic: line with many proper-noun-like words or commas
            word_count = len(l.split())
            comma_count = l.count(",") + l.count("，")
            if comma_count >= 1 and word_count <= 40 and not l.endswith("."):
                # Clean superscript-like numbers
                cleaned = re.sub(r'\d+\s*[,*†‡§∥]?\s*', ' ', l)
                cleaned = re.sub(r'[*†‡§∥,]+\s*', ', ', cleaned)
                parts = re.split(r'[,，;&]|\band\b', cleaned)
                authors = [a.strip() for a in parts if a.strip() and len(a.strip()) > 1]
                if 1 <= len(authors) <= 30:
                    result["authors"] = authors
                    break

    # ── 5. Year ──
    # From metadata
    pdf_date = meta.get("creationDate") or meta.get("modDate") or ""
    year_from_meta = re.search(r'D:(\d{4})', pdf_date)
    # From text (look for 4-digit year near DOI, copyright, or header)
    year_from_text = None
    for l in lines[:20]:
        m = re.search(r'(?:©|copyright|published|received|accepted)\s*:?\s*(\d{4})', l, re.I)
        if m:
            year_from_text = int(m.group(1))
            break
    if not year_from_text:
        m = re.search(r'\b(19\d{2}|20[0-3]\d)\b', first_pages_text[:3000])
        if m:
            year_from_text = int(m.group(1))
    if year_from_text and 1950 <= year_from_text <= 2040:
        result["year"] = year_from_text
    elif year_from_meta:
        y = int(year_from_meta.group(1))
        if 1950 <= y <= 2040:
            result["year"] = y

    # ── 6. Keywords ──
    kw_match = re.search(
        r'(?:keywords?|关键[词字]|key\s*words?|index\s+terms?)\s*[:：\-—]?\s*(.+?)(?:\n\n|\n[A-Z1])',
        first_pages_text,
        re.I | re.S,
    )
    if kw_match:
        kw_text = kw_match.group(1).strip()
        # Keywords are usually separated by ;,，；or newlines
        kw_parts = re.split(r'[;；,，•·\n]', kw_text)
        kws = [k.strip().strip(".").strip() for k in kw_parts if k.strip() and len(k.strip()) > 1]
        result["keywords"] = kws[:15]

    # ── 7. Abstract ──
    abs_match = re.search(
        r'(?:abstract|摘\s*要)\s*[:：\-—]?\s*\n?\s*(.+?)(?:\n\s*(?:keywords?|关键[词字]|introduction|1[\.\s]|引言|I\.\s)|$)',
        first_pages_text,
        re.I | re.S,
    )
    if abs_match:
        abstract = abs_match.group(1).strip()
        # Clean up: collapse whitespace, limit length
        abstract = re.sub(r'\s+', ' ', abstract)
        if len(abstract) > 50:
            result["abstract"] = abstract[:2000]

    # ── 8. Journal heuristic ──
    # Look for common patterns in header/footer of first page
    for l in lines[:8] + lines[-5:]:
        # e.g. "IEEE Transactions on ...", "Journal of ...", "Robotics and Autonomous Systems"
        if re.search(r'(IEEE|journal|transactions|proceedings|conference|symposium|letters)', l, re.I):
            if len(l) < 200 and l != result["title_en"]:
                result["journal"] = l.strip()
                break

    return result
