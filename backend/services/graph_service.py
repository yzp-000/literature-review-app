"""Graph service — compute relation graph data & manage relations."""
import json
from services.paper_service import list_papers, get_paper, _load_papers, _save_papers


# Bidirectional relation mapping
INVERSE_RELATION = {
    "cites": "cited_by",
    "cited_by": "cites",
    "related_to": "related_to",
    "contrasts_with": "contrasts_with",
    "extends": None,  # no automatic inverse
}

# Edge display labels
RELATION_LABELS = {
    "cites": "引用",
    "cited_by": "被引用",
    "related_to": "相关",
    "contrasts_with": "对比",
    "extends": "扩展",
}

# Status-based node colors
STATUS_COLORS = {
    "unread": "#bfbfbf",
    "reading": "#1890ff",
    "completed": "#52c41a",
}


def get_graph_data(workspace: str) -> dict:
    """Return nodes and edges for the paper relation graph."""
    papers = list_papers(workspace)
    nodes = []
    edges = []
    seen_edges = set()

    for paper in papers:
        pid = paper["id"]
        title = paper.get("title_zh") or paper.get("title_en") or f"Paper #{paper.get('number', '?')}"
        nodes.append({
            "id": pid,
            "label": title,
            "number": paper.get("number"),
            "color": STATUS_COLORS.get(paper.get("status", "unread"), "#bfbfbf"),
            "status": paper.get("status", "unread"),
            "year": paper.get("year"),
            "authors": paper.get("authors", []),
            "keywords": paper.get("keywords", []),
            "journal": paper.get("journal", ""),
            "doi": paper.get("doi", ""),
        })

        for rel in paper.get("relations", []):
            target_id = rel["target_id"]
            rel_type = rel["type"]
            # Deduplicate edges (A->B same as B->A for symmetric relations)
            if rel_type in ("related_to", "contrasts_with"):
                edge_key = tuple(sorted([pid, target_id])) + (rel_type,)
            else:
                edge_key = (pid, target_id, rel_type)

            if edge_key not in seen_edges:
                seen_edges.add(edge_key)
                edges.append({
                    "source": pid,
                    "target": target_id,
                    "type": rel_type,
                    "label": RELATION_LABELS.get(rel_type, rel_type),
                })

    return {"nodes": nodes, "edges": edges}


def add_relation(workspace: str, source_id: str, target_id: str, relation_type: str) -> dict:
    """Add a relation between two papers, with automatic inverse for bidirectional types."""
    if source_id == target_id:
        raise ValueError("不能给论文添加与自身的关系")

    data = _load_papers(workspace)
    papers = data.get("papers", [])

    source = None
    target = None
    for p in papers:
        if p["id"] == source_id:
            source = p
        if p["id"] == target_id:
            target = p

    if not source:
        raise ValueError(f"论文 {source_id} 不存在")
    if not target:
        raise ValueError(f"论文 {target_id} 不存在")

    # Add forward relation (avoid duplicate)
    source_rels = source.get("relations", [])
    if not any(r["target_id"] == target_id and r["type"] == relation_type for r in source_rels):
        source_rels.append({"target_id": target_id, "type": relation_type})
        source["relations"] = source_rels

    # Add inverse relation if applicable
    inverse = INVERSE_RELATION.get(relation_type)
    if inverse:
        target_rels = target.get("relations", [])
        if not any(r["target_id"] == source_id and r["type"] == inverse for r in target_rels):
            target_rels.append({"target_id": source_id, "type": inverse})
            target["relations"] = target_rels

    _save_papers(workspace, data)
    return {"status": "ok", "source_id": source_id, "target_id": target_id, "type": relation_type}


def remove_relation(workspace: str, source_id: str, target_id: str, relation_type: str) -> dict:
    """Remove a relation and its inverse."""
    data = _load_papers(workspace)
    papers = data.get("papers", [])

    for p in papers:
        if p["id"] == source_id:
            p["relations"] = [
                r for r in p.get("relations", [])
                if not (r["target_id"] == target_id and r["type"] == relation_type)
            ]
        if p["id"] == target_id:
            inverse = INVERSE_RELATION.get(relation_type)
            if inverse:
                p["relations"] = [
                    r for r in p.get("relations", [])
                    if not (r["target_id"] == source_id and r["type"] == inverse)
                ]

    _save_papers(workspace, data)
    return {"status": "ok"}


def get_paper_relations(workspace: str, paper_id: str) -> list[dict]:
    """Get all relations for a specific paper, enriched with target paper info."""
    papers = list_papers(workspace)
    paper_map = {p["id"]: p for p in papers}
    paper = paper_map.get(paper_id)
    if not paper:
        return []

    result = []
    for rel in paper.get("relations", []):
        target = paper_map.get(rel["target_id"])
        result.append({
            "target_id": rel["target_id"],
            "type": rel["type"],
            "label": RELATION_LABELS.get(rel["type"], rel["type"]),
            "target_title": (target.get("title_zh") or target.get("title_en") or "未知") if target else "未知",
            "target_number": target.get("number") if target else None,
        })
    return result
