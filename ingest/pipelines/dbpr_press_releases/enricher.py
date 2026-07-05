"""Enrichment step — Sonnet extracts structured fields from body_text.

Runs AFTER the ingest step. Reads un-enriched rows (summary IS NULL),
calls Sonnet with tool-use, writes back structured fields.

Un-enriched = summary IS NULL AND body_text IS NOT NULL.
This is safe to re-run — already-enriched rows are skipped.
"""
from __future__ import annotations

import json
import os
import sys
from typing import Any

import anthropic
import psycopg

from ingest.lib.api_usage import log_api_usage

from .constants import ENRICH_BATCH_SIZE, ENRICH_MODEL, TABLE

# ── Sonnet tool schema ─────────────────────────────────────────────────────────

_EXTRACT_TOOL: dict[str, Any] = {
    "name": "extract_press_release",
    "description": (
        "Extract structured fields from a DBPR press release body. "
        "Return only what the text explicitly states."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "summary": {
                "type": "string",
                "description": "1-2 sentence plain-English summary of the release.",
            },
            "topics": {
                "type": "array",
                "items": {"type": "string"},
                "description": (
                    "Regulatory/enforcement topic tags. Use from: "
                    "enforcement, real_estate, construction, ABT, hospitality, "
                    "condos, licensing, legislation, public_safety, workforce."
                ),
            },
            "affected_industries": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Industries directly named or regulated in the release.",
            },
            "geographic_mentions": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Florida counties, cities, or regions explicitly named.",
            },
            "is_swfl_relevant": {
                "type": "boolean",
                "description": (
                    "True if the release mentions Lee, Collier, Charlotte, "
                    "Sarasota, or Hendry County — or cities in those counties "
                    "(Fort Myers, Cape Coral, Naples, Bonita Springs, Estero, "
                    "Marco Island, Punta Gorda, Port Charlotte, North Port, Venice)."
                ),
            },
        },
        "required": [
            "summary",
            "topics",
            "affected_industries",
            "geographic_mentions",
            "is_swfl_relevant",
        ],
    },
}

_SYSTEM = (
    "You extract structured metadata from Florida DBPR press releases. "
    "Only use information explicitly present in the text. "
    "Keep summaries factual and under 150 words."
)


def _enrich_row(client: anthropic.Anthropic, row: dict[str, Any]) -> dict[str, Any]:
    title = row.get("title", "")
    body = row.get("body_text", "")
    prompt = f"Title: {title}\n\n{body[:4000]}"  # cap at 4k chars for cost

    response = client.messages.create(
        model=ENRICH_MODEL,
        max_tokens=512,
        system=_SYSTEM,
        tools=[_EXTRACT_TOOL],
        tool_choice={"type": "tool", "name": "extract_press_release"},
        messages=[{"role": "user", "content": prompt}],
    )
    log_api_usage(
        model=response.model, call_type="ingest_dbpr_press", usage=response.usage
    )

    for block in response.content:
        if block.type == "tool_use" and block.name == "extract_press_release":
            inp: dict[str, Any] = block.input  # type: ignore[assignment]
            return {
                "source_url": row["source_url"],
                "summary": inp.get("summary"),
                "topics": inp.get("topics", []),
                "affected_industries": inp.get("affected_industries", []),
                "geographic_mentions": inp.get("geographic_mentions", []),
                "is_swfl_relevant": bool(inp.get("is_swfl_relevant", False)),
            }

    raise RuntimeError(f"No tool_use block in Sonnet response for {row['source_url']}")


_UPDATE_SQL = f"""
UPDATE public.{TABLE} SET
    summary             = %(summary)s,
    topics              = %(topics)s,
    affected_industries = %(affected_industries)s,
    geographic_mentions = %(geographic_mentions)s,
    is_swfl_relevant    = %(is_swfl_relevant)s
WHERE source_url = %(source_url)s
"""

_FETCH_SQL = f"""
SELECT source_url, title, body_text
FROM public.{TABLE}
WHERE summary IS NULL AND body_text IS NOT NULL
ORDER BY published_date DESC NULLS LAST
LIMIT %s
"""


def run_enrichment(conn_str: str, dry_run: bool = False) -> int:
    """Enrich up to ENRICH_BATCH_SIZE un-enriched rows. Returns count enriched."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY not set — cannot enrich.", file=sys.stderr)
        return 0

    client = anthropic.Anthropic(api_key=api_key)

    with psycopg.connect(conn_str) as conn:
        with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
            cur.execute(_FETCH_SQL, (ENRICH_BATCH_SIZE,))
            rows = cur.fetchall()

    if not rows:
        print(f"dbpr enricher: 0 un-enriched rows — nothing to do.")
        return 0

    print(f"dbpr enricher: enriching {len(rows)} rows via {ENRICH_MODEL}...")
    enriched: list[dict[str, Any]] = []
    for row in rows:
        try:
            result = _enrich_row(client, dict(row))
            enriched.append(result)
            swfl_flag = "✓ SWFL" if result["is_swfl_relevant"] else ""
            print(
                f"  [{result['source_url'][-60:]}] "
                f"topics={result['topics'][:2]} {swfl_flag}"
            )
        except Exception as exc:
            print(f"  WARNING: enrichment failed for {row['source_url']}: {exc}")

    if dry_run:
        print(f"dbpr enricher: --dry-run, skipping DB update for {len(enriched)} rows.")
        return len(enriched)

    if not enriched:
        return 0

    with psycopg.connect(conn_str) as conn:
        with conn.cursor() as cur:
            for r in enriched:
                # psycopg3 needs lists → postgres arrays via Json or direct list
                cur.execute(
                    _UPDATE_SQL,
                    {
                        "source_url": r["source_url"],
                        "summary": r["summary"],
                        "topics": r["topics"],
                        "affected_industries": r["affected_industries"],
                        "geographic_mentions": r["geographic_mentions"],
                        "is_swfl_relevant": r["is_swfl_relevant"],
                    },
                )
        conn.commit()

    print(f"dbpr enricher: updated {len(enriched)} rows.")
    return len(enriched)
