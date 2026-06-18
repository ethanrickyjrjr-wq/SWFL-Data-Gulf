#!/usr/bin/env python3
"""
Export a compact brain-graph JSON for the /ops/graph vis.js page.
Reads graphify-out/graph.json and writes a vis-network-ready payload
to swfldatagulf-ops/app/graph/brain-graph.json.

Usage:
  python scripts/graphify/export-ops-graph.py
"""

import json
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent.parent
OPS_ROOT = REPO_ROOT.parent / "swfldatagulf-ops"

DOMAIN_COLORS = {
    "real-estate":  "#3b82f6",
    "logistics":    "#f59e0b",
    "environmental":"#10b981",
    "economic":     "#8b5cf6",
    "finance":      "#ef4444",
    "tourism":      "#f97316",
    "safety":       "#06b6d4",
    "synthesizer":  "#fbbf24",
    "master":       "#fbbf24",
}

SLUG_COLOR    = "#64748b"
PIPELINE_COLOR= "#334155"
BRAIN_SIZE    = 28
SLUG_SIZE     = 14
PIPELINE_SIZE = 12


def transform(graph: dict) -> dict:
    vis_nodes = []
    vis_edges = []

    for n in graph["nodes"]:
        ntype = n.get("type", "slug")
        domain = n.get("domain", "")

        if ntype == "brain":
            color = DOMAIN_COLORS.get(domain, "#6366f1")
            size  = BRAIN_SIZE
            shape = "ellipse"
            font_size = 13
        elif ntype == "pipeline":
            color = PIPELINE_COLOR
            size  = PIPELINE_SIZE
            shape = "box"
            font_size = 10
        else:  # slug
            color = SLUG_COLOR
            size  = SLUG_SIZE
            shape = "dot"
            font_size = 11

        vis_nodes.append({
            "id":    n["id"],
            "label": n["label"],
            "type":  ntype,
            "domain": domain,
            "scope": n.get("scope", ""),
            "category": n.get("category", ""),
            "size":  size,
            "shape": shape,
            "color": {
                "background": color,
                "border":     color,
                "highlight":  {"background": "#f1f5f9", "border": "#fff"},
                "hover":      {"background": "#fff", "border": color},
            },
            "font": {"size": font_size, "color": "#e2e8f0"},
        })

    for e in graph["edges"]:
        rel = e["relation"]
        if rel == "depends_on":
            edge_color = "#6366f1"
            dashes = False
            width  = 2
        elif rel == "emits":
            edge_color = "#334155"
            dashes = True
            width  = 1
        else:
            edge_color = "#475569"
            dashes = False
            width  = 1

        vis_edges.append({
            "from":   e["source"],
            "to":     e["target"],
            "label":  rel,
            "color":  {"color": edge_color, "highlight": "#fff"},
            "dashes": dashes,
            "width":  width,
            "font":   {"size": 9, "color": "#94a3b8", "strokeWidth": 0},
            "arrows": {"to": {"enabled": True, "scaleFactor": 0.6}},
            "smooth": {"type": "continuous"},
        })

    return {"nodes": vis_nodes, "edges": vis_edges}


def main() -> None:
    src = REPO_ROOT / "graphify-out/graph.json"
    if not src.exists():
        print(f"ERROR: {src} not found. Run build-graph.py first.")
        return

    graph = json.loads(src.read_text(encoding="utf-8"))
    vis_data = transform(graph)

    out_dir = OPS_ROOT / "app/graph"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "brain-graph.json"
    out_path.write_text(json.dumps(vis_data, indent=2, ensure_ascii=False), encoding="utf-8")

    n = len(vis_data["nodes"])
    e = len(vis_data["edges"])
    print(f"Wrote {n} nodes, {e} edges -> {out_path}")


if __name__ == "__main__":
    main()
