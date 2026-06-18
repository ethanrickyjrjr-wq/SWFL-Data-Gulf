#!/usr/bin/env python3
"""
Build a graphify-compatible graph.json from brain-platform structured data.

Sources:
  - refinery/packs/catalog.mts          → brain nodes + domains
  - refinery/vocab/brain-vocabulary.json → slug nodes + brain→slug edges
  - refinery/packs/*.mts                 → brain→brain DAG edges (makeBrainInputSource)
  - ingest/cadence_registry.yaml         → pipeline nodes

Output: graphify-out/graph.json

Usage:
  python scripts/graphify/build-graph.py

Then query with graphify CLI:
  graphify query "what breaks if housing-swfl goes down?"
  graphify affected "housing-swfl"
  graphify path "housing-swfl" "master"
  graphify explain "median_sale_price"
"""

import json
import re
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    yaml = None

REPO_ROOT = Path(__file__).parent.parent.parent


def load_catalog() -> list[dict]:
    """Parse BRAIN_CATALOG from catalog.mts using regex."""
    text = (REPO_ROOT / "refinery/packs/catalog.mts").read_text(encoding="utf-8")

    entries = []
    # Match each object block between { and the closing }
    # Handles both "string" and template `string` for scope
    block_re = re.compile(r'\{\s*id:\s*"([^"]+)",\s*domain:\s*"([^"]+)",\s*scope:\s*(?:"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`)', re.DOTALL)
    for m in block_re.finditer(text):
        scope = (m.group(3) or m.group(4) or "").strip()
        # Collapse whitespace from multiline template literals
        scope = re.sub(r"\s+", " ", scope)
        entries.append({
            "id": m.group(1),
            "domain": m.group(2),
            "scope": scope,
        })
    return entries


def load_vocab() -> dict:
    """Load brain-vocabulary.json concepts."""
    data = json.loads(
        (REPO_ROOT / "refinery/vocab/brain-vocabulary.json").read_text(encoding="utf-8")
    )
    return data.get("concepts", {})


def load_cadence() -> list[dict]:
    """Load ingest/cadence_registry.yaml pipelines."""
    if yaml is None:
        print("  [skip] pyyaml not installed — pipeline nodes omitted", file=sys.stderr)
        return []
    text = (REPO_ROOT / "ingest/cadence_registry.yaml").read_text(encoding="utf-8")
    data = yaml.safe_load(text)
    return data.get("pipelines", []) if isinstance(data, dict) else []


def extract_dag_edges(catalog_ids: set[str]) -> list[tuple[str, str]]:
    """
    Grep pack .mts files for makeBrainInputSource / brainInputFrom calls.
    Returns list of (downstream_brain_id, upstream_brain_id).
    """
    packs_dir = REPO_ROOT / "refinery/packs"
    edges = set()

    for pack_file in packs_dir.glob("*.mts"):
        if pack_file.name.endswith(".test.mts"):
            continue
        brain_id = pack_file.stem
        text = pack_file.read_text(encoding="utf-8")

        # Resolve string constants: const UP_FOO = "some-brain"
        const_map: dict[str, str] = {}
        for const_name, const_val in re.findall(r'const\s+(\w+)\s*=\s*"([^"]+)"', text):
            const_map[const_name] = const_val

        # makeBrainInputSource("literal") or makeBrainInputSource(CONSTANT)
        for raw in re.findall(r'makeBrainInputSource\(([^)]+)\)', text):
            raw = raw.strip().strip('"')
            uid = const_map.get(raw, raw)
            if uid != brain_id:
                edges.add((brain_id, uid))

        # brainInputFrom(fragments, "literal")
        for uid in re.findall(r'brainInputFrom\(\w+,\s*"([^"]+)"\)', text):
            if uid != brain_id:
                edges.add((brain_id, uid))

    return list(edges)


def build_graph(catalog: list[dict], vocab: dict, dag_edges: list[tuple], pipelines: list[dict]) -> dict:
    nodes: list[dict] = []
    edges: list[dict] = []
    seen_node_ids: set[str] = set()

    def add_node(node: dict) -> None:
        if node["id"] not in seen_node_ids:
            seen_node_ids.add(node["id"])
            nodes.append(node)

    # ── Brain nodes ──────────────────────────────────────────────────────────
    catalog_ids = {e["id"] for e in catalog}
    for entry in catalog:
        scope = entry["scope"]
        add_node({
            "id": f"brain:{entry['id']}",
            "label": entry["id"],
            "type": "brain",
            "domain": entry["domain"],
            "scope": scope[:160] + "..." if len(scope) > 160 else scope,
            "source_file": f"refinery/packs/{entry['id']}.mts",
            "source_location": "BRAIN_CATALOG",
        })

    # master may not be in the leaf catalog
    if "master" not in catalog_ids:
        add_node({
            "id": "brain:master",
            "label": "master",
            "type": "brain",
            "domain": "synthesizer",
            "source_file": "refinery/packs/master.mts",
            "source_location": "master",
        })

    # ── Slug / concept nodes + brain→slug emit edges ─────────────────────────
    for slug_id, concept in vocab.items():
        if concept.get("status", "active") != "active":
            continue
        add_node({
            "id": f"slug:{slug_id}",
            "label": concept.get("prefLabel", slug_id),
            "type": "slug",
            "category": concept.get("category", ""),
            "raw_slugs": concept.get("raw_slugs", [slug_id]),
            "source_file": "refinery/vocab/brain-vocabulary.json",
            "source_location": slug_id,
        })
        for brain_id in concept.get("source_brains", []):
            edges.append({
                "source": f"brain:{brain_id}",
                "target": f"slug:{slug_id}",
                "relation": "emits",
                "confidence": "EXTRACTED",
            })

    # ── Brain → Brain DAG edges ───────────────────────────────────────────────
    for downstream, upstream in dag_edges:
        edges.append({
            "source": f"brain:{downstream}",
            "target": f"brain:{upstream}",
            "relation": "depends_on",
            "confidence": "EXTRACTED",
        })

    # ── Pipeline nodes ────────────────────────────────────────────────────────
    for pipeline in pipelines:
        name = pipeline.get("name", "")
        if not name:
            continue
        lane = pipeline.get("lane", "")
        add_node({
            "id": f"pipeline:{name}",
            "label": name,
            "type": "pipeline",
            "lane": lane,
            "cadence_days": pipeline.get("cadence_days", "?"),
            "source_file": "ingest/cadence_registry.yaml",
            "source_location": name,
        })

    return {
        "directed": True,
        "nodes": nodes,
        "edges": edges,
        "meta": {
            "generated_by": "scripts/graphify/build-graph.py",
            "source": "brain-platform refinery + vocab + cadence",
        },
    }


def main() -> None:
    print("Loading catalog...")
    catalog = load_catalog()
    print(f"  {len(catalog)} brains")

    print("Loading vocab concepts...")
    vocab = load_vocab()
    active = sum(1 for c in vocab.values() if c.get("status", "active") == "active")
    print(f"  {active} active slugs (of {len(vocab)} total)")

    print("Loading cadence registry...")
    pipelines = load_cadence()
    print(f"  {len(pipelines)} pipelines")

    print("Extracting brain DAG edges from pack files...")
    catalog_ids = {e["id"] for e in catalog}
    dag_edges = extract_dag_edges(catalog_ids)
    print(f"  {len(dag_edges)} brain->brain edges")

    print("Building graph...")
    graph = build_graph(catalog, vocab, dag_edges, pipelines)
    n_nodes = len(graph["nodes"])
    n_edges = len(graph["edges"])
    print(f"  {n_nodes} nodes  |  {n_edges} edges")

    out_dir = REPO_ROOT / "graphify-out"
    out_dir.mkdir(exist_ok=True)
    out_path = out_dir / "graph.json"
    out_path.write_text(json.dumps(graph, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nWrote -> {out_path}")
    print("\nReady to query:")
    print('  graphify query "what breaks if housing-swfl goes down?"')
    print('  graphify affected "housing-swfl"')
    print('  graphify path "housing-swfl" "master"')
    print('  graphify explain "median_sale_price"')


if __name__ == "__main__":
    main()
