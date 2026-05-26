"""
Anthropic web_search_20260209 smoke test — Step 1 of the corridor character generator v2 plan.

Two questions tailored to test what the two-block design needs:
  Q1: facts-block stressor — specific numeric value + primary-source coverage
  Q2: speculative-block input stressor — recency, breadth, useful context for AI inference

Writes raw responses to docs/vendor-notes/anthropic-web-search-smoke-output.json
so the vendor-notes writeup can quote verbatim citations.

Re-runnable. Each run costs ~2-6 searches * $0.01 = under $0.10 + token costs.

Usage:
  python scripts/smoke/anthropic_web_search_smoke.py
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


def _load_env_local() -> None:
    env_path = REPO_ROOT / ".env.local"
    if not env_path.exists():
        return
    for raw in env_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        os.environ.setdefault(key, val)


_load_env_local()

try:
    from anthropic import Anthropic
except ImportError:
    sys.stderr.write(
        "anthropic SDK not installed. Run: pip install anthropic\n"
        "Or use a venv that has it.\n"
    )
    sys.exit(2)


MODEL = "claude-sonnet-4-6"  # cheap for smoke; Stage B production may bump to opus if needed

SEED_ALLOWED_DOMAINS = [
    "cushmanwakefield.com",
    "lsicompanies.com",
    "creconsultants.com",
    "ipcnaples.com",
    "cbre.com",
    "colliers.com",
    "leegov.com",
    "colliercountyfl.gov",
    "leepa.org",
    "collierappraiser.com",
    # news-press.com — BLOCKED by Anthropic crawler (smoke-test finding 2026-05-26)
    # naplesnews.com — BLOCKED by Anthropic crawler (smoke-test finding 2026-05-26)
    "gulfshorebusiness.com",
    "fred.stlouisfed.org",
    "bls.gov",
    "census.gov",
    "fema.gov",
    "fdot.gov",
]

QUESTIONS = [
    {
        "id": "Q1_facts_block_stressor",
        "purpose": (
            "Tests facts-block needs: specific numeric value (asking rent), "
            "primary-source coverage (SWFL brokers), cited_text span coherence "
            "(can lint pull verbatim values?)."
        ),
        "prompt": (
            "What is the current asking rent per square foot (NNN basis) for "
            "medical office or general commercial space along Pine Ridge Road "
            "in Naples, Florida? Quote specific dollar figures from 2025-2026 "
            "broker reports, listing services, or county records. Cite each "
            "number to its primary source."
        ),
    },
    {
        "id": "Q2_speculative_block_input_stressor",
        "purpose": (
            "Tests speculative-block input needs: recency, breadth across "
            "publishers, useful context for AI to infer 'where is this "
            "corridor heading.' Tests if news + brokerage announcements "
            "surface together."
        ),
        "prompt": (
            "What significant commercial real estate transactions, tenant "
            "announcements, new construction starts, or development news "
            "have affected Pine Ridge Road in Naples, FL during 2024, 2025, "
            "and early 2026? Include any noteworthy lease signings, building "
            "sales, or planning-board approvals along the corridor."
        ),
    },
]


def run_one(client: Anthropic, q: dict) -> dict:
    sys.stdout.write(f"[smoke] running {q['id']}...\n")
    sys.stdout.flush()
    response = client.messages.create(
        model=MODEL,
        max_tokens=4096,
        messages=[{"role": "user", "content": q["prompt"]}],
        tools=[
            {
                "type": "web_search_20260209",
                "name": "web_search",
                "max_uses": 6,
                "allowed_domains": SEED_ALLOWED_DOMAINS,
                "user_location": {
                    "type": "approximate",
                    "city": "Naples",
                    "region": "Florida",
                    "country": "US",
                    "timezone": "America/New_York",
                },
            }
        ],
    )
    # response.model_dump() gives the full JSON; preserve everything for the writeup.
    return {
        "question_id": q["id"],
        "purpose": q["purpose"],
        "prompt": q["prompt"],
        "model": MODEL,
        "response": response.model_dump(),
    }


def main() -> int:
    if not os.environ.get("ANTHROPIC_API_KEY"):
        sys.stderr.write("ANTHROPIC_API_KEY missing from env / .env.local\n")
        return 2

    out_path = REPO_ROOT / "docs" / "vendor-notes" / "anthropic-web-search-smoke-output.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    client = Anthropic()
    results = [run_one(client, q) for q in QUESTIONS]

    out_path.write_text(json.dumps(results, indent=2, default=str), encoding="utf-8")
    sys.stdout.write(f"[smoke] wrote {out_path.relative_to(REPO_ROOT)}\n")

    for r in results:
        usage = r["response"].get("usage", {})
        sst = usage.get("server_tool_use", {}) or {}
        sys.stdout.write(
            f"[smoke] {r['question_id']}: "
            f"in={usage.get('input_tokens')} "
            f"out={usage.get('output_tokens')} "
            f"searches={sst.get('web_search_requests')}\n"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
