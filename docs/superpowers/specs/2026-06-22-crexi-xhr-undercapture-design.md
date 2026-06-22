# Crexi under-capture overhaul (build 11) — XHR-branch design

**Date:** 2026-06-22 · **Plan:** `docs/audit/2026-06-21-full-platform-audit/PLAN/phase-3-probe-first-upgrades/SOLO-11-crexi-under-capture--OPUS.md`
**Status:** approved (operator chose XHR branch + GHA dry-run for P0b + fix geo/state bug in this build).

## Problem (probe-verified, home-IP, 2026-06-22)

`ingest/pipelines/crexi_listings/extract.py` scrapes the JS grid with ONE scroll, strips HTML to
text, hard-truncates `[:28000]`, and sends it to Haiku for JSON extraction. Defects confirmed live:

1. **`[:28000]` amputates rows.** First capture was **49,437 chars** — ~43% lost before scrolling.
2. **Single scroll** + two **blind `delay_after`** (5.0/4.0) waits.
3. **`js:` `wait_for` is broken on crawl4ai 0.9.x** — `extract.py:69` uses
   `wait_for="js:…querySelectorAll(…).length>0"`, which now throws `userFunction is not a function`
   → step 1 fails → `Crawl4aiError` → 0 rows → fail-loud. A *second* live root cause.
4. **No city filter + hardcoded `state="FL"`.** The pipeline loads the generic `/lease` page
   (nationwide ML recommendations; `totalCount` 164,039, row0 was Baton Rouge LA / Peoria IL) and
   `distill.normalize()` sets `state="FL"` unconditionally → **mislabels out-of-state listings as FL**
   (MOAT violation).

## Decisive discovery: the grid is backed by a JSON API

`POST https://api-lease.crexi.com/assets/search`, body `{count, offset, useML, sortDirection,
sortOrder, includeUndisclosedRate}` → **200 `application/json`**. Built-in `offset` pagination +
`totalCount`. This is the plan's "XHR branch" — it makes virtualized-vs-accumulating (P0a) **moot**.

- **Cloudflare-gated:** a plain HTTP POST gets `403 "Just a moment…"`. It returns 200 **only from
  inside the CF-cleared stealth browser** → design is a two-step `Crawl4aiSession` + an **in-page
  `fetch()`**, never a raw HTTP call.
- **Geo filter = `term`** (probed empirically): `{"term":"Fort Myers Beach, FL"}` → `totalCount` 35,
  rows in the FMB submarket. (`searchText`/`query`/`address[]` etc. are ignored → full 164k.)
- **Row shape** (`data[]`): `id`, `urlSlug`, `types[]`, `status`, `rentableSqftMin/Max`,
  `baseRateSqFtPerYearMin/Max`, `rateType`, `activatedOn`, `location.{address,city,state.code,zip,
  latitude,longitude}`.
- **Listing URL:** `https://www.crexi.com/lease/properties/{id}/{urlSlug}` (confirmed from live anchors).

## Design

### `extract.py` — replace scrape+LLM with API pagination
`_scrape_city`/`_extract_with_llm`/`_SCROLL_JS`/`_EXTRACT_PROMPT`/BeautifulSoup/anthropic → **deleted**.
New `fetch_listings_for_city(city_meta)`:
1. `Crawl4aiSession(session_id="crexi_<city>")`.
2. **step 1** — `step(BASE, delay_after=6.0)` (no `js:` wait): navigate, let CF clear + SPA hydrate.
3. **step 2** — `step(BASE, js_only=True, js_before=<PAGINATE_JS>, wait_for="css:#__crexi__")`:
   an in-page async loop that POSTs `assets/search` with `{term:"<city>, FL", count:60, offset:N…}`,
   walking `offset` until `offset >= totalCount` (safety cap **500 rows / ~9 pages**), maps each row
   to the 9 output fields **in JS** (keeps the marker small), and writes the JSON array into a
   `#__crexi__` marker div.
4. Python reads the marker, `json.loads` → `list[dict]`. Fetch non-200 / no marker → `[]`
   (pipeline's existing `total_raw==0` guard fails loud).

**Field map** (API row → raw dict consumed by `normalize`):

| output field        | source                                                       |
|---------------------|--------------------------------------------------------------|
| `address`           | `location.address`                                           |
| `city`              | `location.city`                                              |
| `state`             | `location.state.code`  ← **fixes the hardcode**              |
| `property_type`     | `types[0]` lowercased                                        |
| `sqft`              | `rentableSqftMin` (the "from" suite size; documented choice) |
| `asking_price_psf`  | `baseRateSqFtPerYearMin`                                     |
| `status`            | `status` (→ `_parse_status`; "Active" → available)          |
| `listed_date`       | `activatedOn[:10]`                                           |
| `source_url`        | `https://www.crexi.com/lease/properties/{id}/{urlSlug}`      |

### `distill.py` — stop mislabeling state
`normalize()` currently sets `"state": "FL"`. Change to `raw.get("state")` (already `location.state.code`
from extract); drop rows whose state is missing. The `term` search keeps results in the SWFL
submarket; `city`/`state` are recorded from each row's own `location`, so an adjacent-town listing
(e.g. Bonita Springs) is labeled accurately rather than forced to the search city.

### What is intentionally NOT done (YAGNI / scope)
- No `zip`/`lat`/`lon` columns (table has none; adding them = migration + ZIP-gate G3 brain-first — out of scope).
- No `LLMExtractionStrategy`, no build-26 Structured-Outputs work (the LLM path is deleted, so its
  JSON-fragility is gone — nothing to harden).
- No virtual-scroll / scan_full_page branch (XHR makes P0a moot).

## P0b — GHA datacenter reachability (the gating prod question)
The only GHA run on record (2026-06-14, failed 29m) was on the **old Firecrawl code**; the workflow
is now `disabled_manually`. After local verification + push, operator-authorized sequence:
`gh workflow enable` → `workflow_dispatch dry_run=true` → record raw-row count vs the home-IP run →
`gh workflow disable`. If the runner clears Cloudflare and returns rows, prod is viable; if it 403s,
this build (and 12/13) reduce to "needs residential egress / self-hosted runner" — recorded either way.

## Done when
- Local `--dry-run` (home-IP) captures materially MORE rows than the `[:28000]` baseline with no field
  loss, and rows carry correct per-row `state`.
- The P0b GHA verdict is recorded in `SESSION_LOG.md` + the `checks` ledger.
