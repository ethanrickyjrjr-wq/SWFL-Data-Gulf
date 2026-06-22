"""crawl4ai extraction of active commercial listings from Crexi via its backing JSON API.

Coverage: Estero FL and Fort Myers Beach FL — two SWFL submarkets with no MarketBeat
broker-survey coverage.

Strategy (build 11 — XHR branch; replaces the prior scroll + [:28000] + Haiku approach):
  1. Crawl4aiSession + UndetectedAdapter loads https://www.crexi.com/lease so the browser
     clears Cloudflare and acquires the cf_clearance cookie.
  2. An in-page fetch() loop calls the grid's own backing API
     (POST https://api-lease.crexi.com/assets/search) with the `term` geo filter, walking
     `offset` until totalCount is exhausted. That API is Cloudflare-gated — a plain HTTP POST
     gets a 403 "Just a moment…" challenge — so it can only be called from INSIDE the cleared
     page context.
  3. Each JSON row is mapped to the output fields directly: typed JSON, no LLM, no [:28000]
     truncation, no virtualization concern.

Why this replaced scroll + LLM (probed live 2026-06-22):
  - The old [:28000] cut amputated ~43% of even the first capture (49,437 chars).
  - The grid is virtualized behind a JSON API anyway, so scrolling can't reliably accumulate it.
  - assets/search is structured, so the BeautifulSoup→Haiku→json.loads path (and its fence-strip
    fragility) is unnecessary — we read typed fields.
  - The old code also (a) used a `js:` wait_for that THROWS on crawl4ai 0.9.x and (b) loaded the
    generic /lease page with no city filter, then hardcoded state="FL" — mislabeling nationwide
    listings. Both fixed here.
Design: docs/superpowers/specs/2026-06-22-crexi-xhr-undercapture-design.md
"""
from __future__ import annotations

import asyncio
import html as _html
import json
import re
from typing import Any

from ingest.lib.crawl4ai_client import Crawl4aiSession, Crawl4aiError

SEARCH_TARGETS: list[dict[str, str]] = [
    {"city": "Estero", "label": "Estero FL"},
    {"city": "Fort Myers Beach", "label": "Fort Myers Beach FL"},
]

_BASE_URL = "https://www.crexi.com/lease"
_PAGE_SIZE = 60   # matches the SPA's own count=60
_MAX_ROWS = 500   # safety cap (~9 pages) so a broad term can't run away

# In-page paginator. Runs in the Cloudflare-cleared page origin (so cf_clearance + same-origin
# headers apply). Walks assets/search by offset, maps each row to the 9 output fields IN JS (keeps
# the result marker small), and writes the JSON payload into a #__crexi__ marker div we read back
# out of the captured HTML.
_PAGINATE_JS_TMPL = r"""
(async () => {{
  const TERM = {term_json};
  const API = "https://api-lease.crexi.com/assets/search";
  const PAGE = {page_size}, MAX = {max_rows};
  const base = {{ count: PAGE, useML: false, sortDirection: "Descending",
                  sortOrder: "Rank", includeUndisclosedRate: true, term: TERM }};
  const out = {{ ok: false, status: null, total: null, rows: [] }};
  try {{
    let offset = 0, total = Infinity;
    while (offset < total && out.rows.length < MAX) {{
      const res = await fetch(API, {{
        method: "POST",
        headers: {{ "Content-Type": "application/json", "Accept": "application/json" }},
        body: JSON.stringify({{ ...base, offset }})
      }});
      out.status = res.status;
      if (res.status !== 200) break;
      const j = await res.json();
      total = (typeof j.totalCount === "number") ? j.totalCount : 0;
      out.total = total;
      const data = j.data || [];
      if (!data.length) break;
      for (const a of data) {{
        const loc = a.location || {{}};
        const st = (loc.state || {{}}).code || null;
        out.rows.push({{
          address: loc.address || null,
          city: loc.city || null,
          state: st,
          property_type: (Array.isArray(a.types) && a.types[0]) ? String(a.types[0]).toLowerCase() : null,
          sqft: (typeof a.rentableSqftMin === "number") ? a.rentableSqftMin : null,
          asking_price_psf: (typeof a.baseRateSqFtPerYearMin === "number") ? a.baseRateSqFtPerYearMin : null,
          status: a.status || null,
          listed_date: a.activatedOn ? String(a.activatedOn).slice(0, 10) : null,
          source_url: (a.id != null)
            ? ("https://www.crexi.com/lease/properties/" + a.id + "/" + (a.urlSlug || ""))
            : null,
        }});
      }}
      offset += PAGE;
    }}
    out.ok = out.rows.length > 0;
  }} catch (e) {{
    out.error = String(e);
  }}
  const el = document.createElement("div");
  el.id = "__crexi__";
  el.textContent = JSON.stringify(out);
  document.body.appendChild(el);
}})();
"""


async def _fetch_city_rows(city: str) -> list[dict[str, Any]]:
    """Two-step stealth session: navigate so Cloudflare clears, then paginate the backing API
    from inside the cleared page. Returns raw listing rows (already field-mapped in JS)."""
    term = f"{city}, FL"
    js = _PAGINATE_JS_TMPL.format(
        term_json=json.dumps(term), page_size=_PAGE_SIZE, max_rows=_MAX_ROWS
    )
    sid = f"crexi_{city.replace(' ', '_').lower()}"
    async with Crawl4aiSession(session_id=sid) as sess:
        # Step 1: navigate; let Cloudflare clear + the SPA hydrate. A plain delay, NOT a `js:`
        # wait_for — that form throws on crawl4ai 0.9.x ("userFunction is not a function").
        await sess.step(_BASE_URL, delay_after=6.0)
        # Step 2: run the in-page paginator on the now-cleared page; wait for the result marker.
        page_html = await sess.step(
            _BASE_URL, js_only=True, js_before=js, wait_for="css:#__crexi__", delay_after=2.0
        )

    m = re.search(r'<div id="__crexi__"[^>]*>(.*?)</div>', page_html, re.DOTALL)
    if not m:
        raise Crawl4aiError(
            f"crexi: no result marker for {city!r} — page blocked or paginator JS failed to run"
        )
    payload = json.loads(_html.unescape(m.group(1)))
    status = payload.get("status")
    if status is not None and status != 200:
        raise Crawl4aiError(
            f"crexi: assets/search returned HTTP {status} for {city!r} "
            "(Cloudflare block or API change)"
        )
    rows: list[dict[str, Any]] = payload.get("rows", []) or []
    return rows


def fetch_listings_for_city(city_meta: dict[str, str]) -> list[dict[str, Any]]:
    """Scrape Crexi (backing API) for one city. Returns raw listing rows (empty on failure;
    the pipeline's total-empty guard fails the run loud if EVERY city returns nothing)."""
    city = city_meta["city"]
    label = city_meta["label"]
    try:
        rows = asyncio.run(_fetch_city_rows(city))
    except Crawl4aiError as exc:
        print(f"[warn] Crexi crawl error for {label}: {exc}", flush=True)
        return []
    except Exception as exc:
        print(f"[warn] Crexi error for {label}: {exc}", flush=True)
        return []
    if not rows:
        print(f"[warn] Crexi: no listings returned for {label}", flush=True)
    return rows
