"""
A/B follow-up to the smoke test — compare web_search_20260209 (dynamic filtering)
against web_search_20250305 (no dynamic filtering) on the SAME Q1 prompt.

Headline finding from the first smoke run: 20260209 + sonnet-4-6 returned ZERO
`cited_text` spans, even though the model clearly used search results. This isolates
whether dynamic filtering (which routes content through code execution and pulls
data into Python variables) is suppressing the per-claim citation contract that the
v2 plan relied on.

Writes to docs/vendor-notes/anthropic-web-search-compare-output.json.
"""
from __future__ import annotations
import json, os, sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]

def _load_env_local() -> None:
    p = REPO / ".env.local"
    if not p.exists(): return
    for raw in p.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line: continue
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

_load_env_local()
from anthropic import Anthropic

MODEL = "claude-sonnet-4-6"

ALLOWED = [
    "cushmanwakefield.com", "lsicompanies.com", "creconsultants.com",
    "ipcnaples.com", "cbre.com", "colliers.com",
    "leegov.com", "colliercountyfl.gov", "leepa.org", "collierappraiser.com",
    "gulfshorebusiness.com",
    "fred.stlouisfed.org", "bls.gov", "census.gov", "fema.gov", "fdot.gov",
]

PROMPT = (
    "What is the current asking rent per square foot (NNN basis) for medical "
    "office or general commercial space along Pine Ridge Road in Naples, Florida? "
    "Quote specific dollar figures from 2025-2026 broker reports, listing services, "
    "or county records. Cite each number to its primary source."
)

VARIANTS = [
    {"id": "tool_20260209_dynamic_filtering",
     "tool": {"type": "web_search_20260209", "name": "web_search", "max_uses": 6,
              "allowed_domains": ALLOWED,
              "user_location": {"type": "approximate", "city": "Naples",
                                "region": "Florida", "country": "US",
                                "timezone": "America/New_York"}}},
    {"id": "tool_20250305_no_dynamic_filtering",
     "tool": {"type": "web_search_20250305", "name": "web_search", "max_uses": 6,
              "allowed_domains": ALLOWED,
              "user_location": {"type": "approximate", "city": "Naples",
                                "region": "Florida", "country": "US",
                                "timezone": "America/New_York"}}},
]

def run(client: Anthropic, v: dict) -> dict:
    sys.stdout.write(f"[compare] {v['id']}...\n"); sys.stdout.flush()
    response = client.messages.create(
        model=MODEL, max_tokens=4096,
        messages=[{"role": "user", "content": PROMPT}],
        tools=[v["tool"]],
    )
    return {"variant_id": v["id"], "tool": v["tool"], "response": response.model_dump()}

def main() -> int:
    if not os.environ.get("ANTHROPIC_API_KEY"):
        sys.stderr.write("ANTHROPIC_API_KEY missing\n"); return 2
    client = Anthropic()
    out = REPO / "docs" / "vendor-notes" / "anthropic-web-search-compare-output.json"
    results = [run(client, v) for v in VARIANTS]
    out.write_text(json.dumps(results, indent=2, default=str), encoding="utf-8")
    sys.stdout.write(f"[compare] wrote {out.relative_to(REPO)}\n")
    for r in results:
        raw = json.dumps(r["response"])
        usage = r["response"].get("usage", {}) or {}
        sst = usage.get("server_tool_use") or {}
        sys.stdout.write(
            f"[compare] {r['variant_id']}: "
            f"in={usage.get('input_tokens')} out={usage.get('output_tokens')} "
            f"searches={sst.get('web_search_requests')} "
            f"cited_text_occurrences={raw.count(chr(34) + 'cited_text' + chr(34))}\n"
        )
    return 0

if __name__ == "__main__":
    sys.exit(main())
