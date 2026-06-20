"""
Crawl best-in-class report / data-newsletter designs and extract their LAYOUT
structure (not their data) — to inform our branded report + drip-email visual template.

This is the "send crawl4ai out and find best looking and recreate" job. It does NOT
recreate anything; it captures section order, hero pattern, chart placement, CTA, palette,
and typography from each reference so we can rebuild the best ideas with OUR components
(lib/email/templates/charts + app/r/_components).

Pattern (proven, from ingest/pipelines/crexi_listings/extract.py):
  Crawl4aiSession (stealth) -> BeautifulSoup strip scripts/styles -> Anthropic Haiku
  structured extraction -> JSON.

PREREQS (this WILL NOT run where the web is blocked):
  - pip install -r ingest/requirements.txt   (installs crawl4ai)
  - playwright install chromium
  - export ANTHROPIC_API_KEY=...
  - network egress to the target hosts (this repo's web container blocks them: 403).
    Run on a machine / environment whose network policy allows the open web, OR
    allowlist the hosts below.

USAGE:
  python ingest/pipelines/report_design_research/crawl_report_designs.py
  python ingest/pipelines/report_design_research/crawl_report_designs.py --out designs.json
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
from typing import Any

from bs4 import BeautifulSoup

from ingest.lib.crawl4ai_client import Crawl4aiSession, Crawl4aiError

# Best-in-class "one chart + explainer" / market-report references (the design agent's
# shortlist). Layout study only — confirm/replace URLs as needed. If a live sender host
# is blocked, point at its gallery render (reallygoodemails.com / milled.com).
TARGETS: list[dict[str, str]] = [
    {"label": "Chartr / Sherwood Snacks", "url": "https://sherwood.news/snacks/"},
    {"label": "Axios Markets", "url": "https://www.axios.com/newsletters/axios-markets"},
    {"label": "Morning Brew", "url": "https://www.morningbrew.com/daily/issues/latest"},
    {"label": "The Daily Upside", "url": "https://www.thedailyupside.com/"},
    {"label": "Redfin Data Center", "url": "https://www.redfin.com/news/data-center/"},
]

_SCROLL_JS = "window.scrollTo(0, document.body.scrollHeight);"

_EXTRACT_PROMPT = """\
You are studying the LAYOUT of a market-report / data-newsletter page so we can rebuild
its best ideas. From the page text + structure below, return STRICT JSON with these keys:
  section_order   - array of section names, top to bottom
  hero_pattern    - how the lead stat/headline is presented (1 sentence)
  chart_placement - where charts sit relative to text (1 sentence)
  single_focus    - true if each section centers on ONE chart/idea, else false
  cta_text        - the primary call-to-action wording, if any
  cta_position    - where the CTA sits (1 phrase)
  palette_hexes   - array of prominent hex colors you can infer (may be empty)
  typography      - 1 phrase on the font feel (serif/sans, weight, size contrast)
  takeaways       - array of 2-4 concrete design ideas worth copying
Return ONLY the JSON object. No prose.
Page:
"""


async def _scrape(label: str, url: str) -> str:
    sid = f"design_{label.replace(' ', '_').replace('/', '_').lower()}"
    async with Crawl4aiSession(session_id=sid) as sess:
        await sess.step(url, wait_for="css:body", delay_after=3.0)
        # one scroll to trigger lazy content, then capture
        html = await sess.step("", js_before=_SCROLL_JS, js_only=True, delay_after=2.0)
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    text = soup.get_text(" ", strip=True)
    return text[:18_000]  # Haiku context budget for layout study


def _extract(label: str, page_text: str) -> dict[str, Any] | None:
    """Anthropic Haiku structured layout extraction."""
    import anthropic

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print(f"[warn] ANTHROPIC_API_KEY not set — skipping extraction for {label}", flush=True)
        return None
    client = anthropic.Anthropic(api_key=api_key)
    msg = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1200,
        messages=[{"role": "user", "content": _EXTRACT_PROMPT + page_text}],
    )
    raw = "".join(block.text for block in msg.content if getattr(block, "type", "") == "text")
    raw = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        print(f"[warn] {label}: non-JSON extraction, keeping raw", flush=True)
        return {"_raw": raw}


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="report-designs.json")
    args = ap.parse_args()

    results: list[dict[str, Any]] = []
    for t in TARGETS:
        print(f"[crawl] {t['label']} <- {t['url']}", flush=True)
        try:
            text = await _scrape(t["label"], t["url"])
        except Crawl4aiError as e:
            print(f"[skip] {t['label']}: scrape failed ({e})", flush=True)
            results.append({"label": t["label"], "url": t["url"], "error": str(e)})
            continue
        extracted = _extract(t["label"], text)
        results.append({"label": t["label"], "url": t["url"], "design": extracted})

    with open(args.out, "w") as f:
        json.dump({"sources": results}, f, indent=2)
    print(f"[done] wrote {len(results)} design profiles -> {args.out}", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
