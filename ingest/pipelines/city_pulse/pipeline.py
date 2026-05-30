"""SWFL city pulse — daily current-events capture -> Tier-1 cold + Tier-2 distilled.

Per city: one Anthropic web_search_20250305 call captures current signals
(openings, layoffs, construction starts, major sales, disasters). The raw
response + flattened citations[] is written to Tier-1 cold storage; distill.py
then turns it into citation-backed rows in data_lake.city_pulse.

Tool version: web_search_20250305 — NOT web_search_20260209. The 20260209
dynamic filtering suppresses per-claim citations[] (repo A/B 2026-05-26:
9 vs 0 cited_text spans). Per-claim citations are the no-hallucination spine.
See ingest/pipelines/corridor_grounded/pipeline.py and
docs/vendor-notes/anthropic-web-search-wire-up.md.

Env: ANTHROPIC_API_KEY + SUPABASE_URL + SUPABASE_SERVICE_KEY +
DESTINATION__POSTGRES__CREDENTIALS.

CLI:
  python -m ingest.pipelines.city_pulse.pipeline
  python -m ingest.pipelines.city_pulse.pipeline --dry-run
  python -m ingest.pipelines.city_pulse.pipeline --city "Naples"
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import anthropic
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[3] / ".env.local")

from ingest.lib.storage_uploader import _upload_bytes  # noqa: E402
from ingest.lib.tier1_inventory import upsert_inventory_row  # noqa: E402

CITIES = [
    "Lehigh Acres", "Cape Coral", "Fort Myers", "Naples",
    "Estero", "Bonita Springs", "Fort Myers Beach",
]

MODEL = "claude-sonnet-4-6"
SEARCH_TOOL_VERSION = "web_search_20250305"
BUCKET = "lake-tier1"

# Audited domains. naplesnews.com + news-press.com BLOCK Anthropic's crawler
# (verified in corridor_grounded), so SWFL news comes from the publishers below
# plus county/gov/state primary sources. Do NOT add the blocked papers.
ALLOWED_DOMAINS = [
    "gulfshorebusiness.com",
    "businessobserverfl.com",
    "winknews.com",
    "leegov.com",
    "colliercountyfl.gov",
    "capecoral.gov",
    "cityftmyers.com",
    "leepa.org",
    "collierappraiser.com",
    "floridajobs.org",
    "bls.gov",
    "census.gov",
]


def slug(city: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", city.lower()).strip("-")


QUERY_TEMPLATE = (
    "Provide a current-events briefing for {city}, Florida (Southwest Florida, "
    "Lee or Collier County) covering the LAST 60 DAYS. Surface concrete, dated "
    "developments in these areas:\n"
    "- New business openings, closings, expansions, or major hiring/layoffs.\n"
    "- Commercial building sales, large lease signings, or land acquisitions.\n"
    "- Construction starts, planning-board approvals, or permit milestones.\n"
    "- Storm, flood, or disaster impacts to the local economy.\n\n"
    "Quote specific figures, company names, dollar amounts, and dates. Cite each "
    "claim to its primary source (local news, county records, company releases)."
)

USER_LOCATION = {
    "type": "approximate",
    "city": "Fort Myers",
    "region": "Florida",
    "country": "US",
    "timezone": "America/New_York",
}


def _extract_citations(content: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Flatten all non-null citations from model_dump() content blocks, deduped."""
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for block in content:
        for c in block.get("citations") or []:
            key = f"{c.get('url')}|{c.get('cited_text', '')[:60]}"
            if key in seen:
                continue
            seen.add(key)
            out.append({
                "url": c.get("url"),
                "title": c.get("title"),
                "cited_text": c.get("cited_text"),
                "type": c.get("type"),
            })
    return out


def build_record(city: str, query: str, response_dump: dict[str, Any], run_at: str) -> dict[str, Any]:
    content = response_dump.get("content", [])
    citations = _extract_citations(content)
    usage = response_dump.get("usage", {}) or {}
    return {
        "city": city,
        "city_slug": slug(city),
        "query": query,
        "model": MODEL,
        "tool_version": SEARCH_TOOL_VERSION,
        "run_at": run_at,
        "input_tokens": usage.get("input_tokens"),
        "output_tokens": usage.get("output_tokens"),
        "stop_reason": response_dump.get("stop_reason"),
        "response": response_dump,
        "citations": citations,
        "cited_text_count": len(citations),
    }


def run_city_search(city: str, run_at: str) -> dict[str, Any]:
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    query = QUERY_TEMPLATE.format(city=city)
    response = client.messages.create(
        model=MODEL,
        max_tokens=4096,
        tools=[{
            "type": SEARCH_TOOL_VERSION,
            "name": "web_search",
            "max_uses": 8,
            "allowed_domains": ALLOWED_DOMAINS,
            "user_location": USER_LOCATION,
        }],
        messages=[{"role": "user", "content": query}],
    )
    return build_record(city, query, response.model_dump(), run_at)
