# Pulse Intelligence Engine — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 6 tasks, 12 files, keywords: migration, architecture

**Goal:** Retrofit the two pulse pipelines to capture current-events facts by reading the free `data_lake.news_articles_swfl` lake (crawl4ai-fed) instead of the paid `web_search_20250305` tool, so the dark crons can turn back on at near-zero cost.

**Architecture:** Both `city_pulse` and `city_pulse_corridors` already have a clean seam: `distill_capture(capture)` consumes only `capture["citations"]` (a list of `{url,title,cited_text,type}` spans), `capture["city"|"corridor"]`, and `capture["run_at"]`, and it early-returns `[]` with **zero API calls** when `citations` is empty. Phase 1 replaces the paid-search capture (`run_city_search` / `run_corridor_search`) with a builder that reads recent lake articles, matches them to the unit with a new deterministic Python matcher, and packs them into that exact `capture` shape. `distill.py`'s fact-extraction contract is unchanged — the ONLY change is an optional `budget` charge so the $1/run guard still covers the sole remaining paid call (the distill); `write_rows`, `reconcile_supersession`, and `prune_expired` are untouched. The dead paid-search functions (`run_*_search`, `build_record`, `_extract_citations`) and their now-orphaned tests are deleted.

**Tech Stack:** Python 3.13, `crawl4ai` (already the news_swfl fetcher), `psycopg` via `ingest.lib.tier1_inventory._get_connection`, `pytest`, `claude-sonnet-4-6` (distill only, unchanged), GitHub Actions cron wrappers.

## Global Constraints

- **NO paid `web_search_*` in these pipelines after Phase 1.** The retrofit removes the only `web_search` call site in each `pipeline.py`. Verify with `grep -rn web_search ingest/pipelines/city_pulse ingest/pipelines/city_pulse_corridors` → only comments/history may remain, no live tool call. (`ingest/CLAUDE.md`, LOCKED 07/05/2026.)
- **Distill model = `claude-sonnet-4-6`** — do not change; it already lives in `ingest/pipelines/city_pulse/distill.py:42` and the corridor distill imports it.
- **Zero LLM calls for empty units.** A unit with no matched articles builds a capture with `citations: []`; `distill_capture` returns `[]` without an API call. Never call the model on an empty unit.
- **No-invention preserved.** Every kept fact still resolves to a real `source_url` via `rows_from_extraction`'s index+URL guard. Do not weaken that path.
- **`RunBudget` stays and must cover the distill call.** The retrofit deletes the paid `web_search` call that used to charge `RunBudget`; the sole paid call left is the Sonnet distill. Thread the run's `budget` into `distill_capture(capture, budget)` and charge it there (from the `cost` that `log_api_usage` already returns) so the hard-stop stays honest. Lower `default_usd` to **1.0** on both pipelines (city: was 8.0; corridor: was 16.0) — retrofit spend is ~$0.03–0.07/unit, and $1/run is the locked decree. The corridor `env_var="CORRIDOR_PULSE_MAX_USD"` override stays wired for the rare busy week.
- **`news_articles_swfl` is READ-ONLY** except the one eviction sweep (Task 5). That table is owned by the parallel `news_swfl` session — coordinate the eviction write per RULE 1.5.
- **Bun.SQL for any migration** (psql absent); `.dlt/secrets.toml` creds. Phase 1 needs **no new table** — it reads an existing one.
- **`--dry-run` prints, never writes.** Each pipeline's existing `--dry-run` contract (no Tier-1 upload, no DB write) must still hold after the retrofit.

Columns of `data_lake.news_articles_swfl` (from `ingest/pipelines/news_swfl/normalizer.py`): `article_url`, `headline`, `body_text` (≤3000 chars), `source_name`, `published_date` (TEXT `YYYY-MM-DD`), `swfl_relevance` (bool).

---

### Task 1: Deterministic pulse matcher (pure, no DB)

**Files:**
- Create: `ingest/lib/pulse_match.py`
- Test: `ingest/lib/test_pulse_match.py`

**Interfaces:**
- Produces:
  - `normalize_road(text: str) -> str` — lowercase, expand road abbreviations (rd→road, blvd→boulevard, pkwy→parkway, ave→avenue, st→street, dr→drive, hwy→highway, ln→lane, ct→court), collapse whitespace.
  - `article_matches_city(city: str, headline: str, body_text: str) -> bool` — permissive: the city name appears (case-insensitive) in `headline + " " + body_text`. Precision is left to the distill's per-city location guard; the matcher must not under-match.
  - `road_tokens_from_corridor(corridor_name: str) -> list[str]` — the road-name phrase(s) inside a corridor name, normalized (e.g. `"Immokalee Rd North Naples"` → `["immokalee road"]`).
  - `article_matches_corridor(corridor_name: str, headline: str, body_text: str) -> bool` — any road token appears in the normalized `headline + " " + body_text`.

- [ ] **Step 1: Write the failing tests**

```python
# ingest/lib/test_pulse_match.py
from ingest.lib.pulse_match import (
    normalize_road, article_matches_city,
    road_tokens_from_corridor, article_matches_corridor,
)


def test_normalize_road_expands_abbreviations():
    assert normalize_road("Immokalee Rd") == "immokalee road"
    assert normalize_road("Cleveland Ave.") == "cleveland avenue"
    assert normalize_road("Bonita Beach Blvd") == "bonita beach boulevard"


def test_city_match_is_permissive_and_case_insensitive():
    assert article_matches_city("Naples", "NAPLES sees new store", "")
    assert article_matches_city("Fort Myers", "downtown update", "A shop opened in fort myers today.")
    assert not article_matches_city("Sanibel", "Cape Coral bridge news", "Nothing about the island here.")


def test_corridor_road_tokens_and_match():
    assert road_tokens_from_corridor("Immokalee Rd North Naples") == ["immokalee road"]
    # An article naming the road (any abbreviation) matches:
    assert article_matches_corridor("Immokalee Rd North Naples", "Immokalee Road widening approved", "")
    assert article_matches_corridor("Cleveland Ave Fort Myers", "New lease on Cleveland Avenue", "")
    # An article about a different road does not:
    assert not article_matches_corridor("Immokalee Rd North Naples", "Daniels Parkway construction", "")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `C:\Users\ethan\crawl4ai-venv\Scripts\python.exe -m pytest ingest/lib/test_pulse_match.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'ingest.lib.pulse_match'`

- [ ] **Step 3: Write the implementation**

```python
# ingest/lib/pulse_match.py
"""Deterministic (no-LLM, no-DB) matcher: does a news article concern a given
SWFL city or corridor? Permissive by design — the pulse distill applies the
strict per-unit location guard, so the matcher optimizes for recall, not
precision. A missed article is a lost fact; an over-matched one is filtered
downstream at zero extra cost (still $0 — the distill runs once per unit)."""
from __future__ import annotations

import re

_ROAD_ABBR = {
    "rd": "road", "blvd": "boulevard", "pkwy": "parkway", "ave": "avenue",
    "st": "street", "dr": "drive", "hwy": "highway", "ln": "lane", "ct": "court",
}


def normalize_road(text: str) -> str:
    out = []
    for tok in re.split(r"\s+", text.strip().lower()):
        tok = tok.strip(".,")
        out.append(_ROAD_ABBR.get(tok, tok))
    return " ".join(t for t in out if t)


# Area suffixes that name the corridor's place, not its road — stripped so the
# road token stays tight (e.g. "north naples", "fort myers", county seats).
_AREA_SUFFIXES = [
    "north naples", "east naples", "golden gate", "fort myers beach",
    "north fort myers", "cape coral", "fort myers", "bonita springs",
    "bonita beach", "lehigh acres", "marco island", "naples", "estero",
    "sanibel", "immokalee",
]


def road_tokens_from_corridor(corridor_name: str) -> list[str]:
    norm = normalize_road(corridor_name)
    for suffix in _AREA_SUFFIXES:
        s = normalize_road(suffix)
        if norm.endswith(" " + s):
            norm = norm[: -(len(s) + 1)].strip()
            break
    return [norm] if norm else []


def article_matches_city(city: str, headline: str, body_text: str) -> bool:
    hay = f"{headline} {body_text}".lower()
    return city.lower() in hay


def article_matches_corridor(corridor_name: str, headline: str, body_text: str) -> bool:
    hay = normalize_road(f"{headline} {body_text}")
    return any(tok and tok in hay for tok in road_tokens_from_corridor(corridor_name))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `C:\Users\ethan\crawl4ai-venv\Scripts\python.exe -m pytest ingest/lib/test_pulse_match.py -v`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add ingest/lib/pulse_match.py ingest/lib/test_pulse_match.py
git commit -F - <<'EOF'
feat(pulse): deterministic city/corridor news matcher (Phase 1, no LLM/DB)

Recall-first matcher; distill keeps precision. Road-abbrev normalization
so "Immokalee Rd" matches "Immokalee Road". Spec:
docs/superpowers/plans/2026-07-07-pulse-intelligence-engine/00-design.md
EOF
```

---

### Task 2: Lake reader + capture builder

**Files:**
- 🔴 Create: `ingest/lib/pulse_lake.py`
- 🔴 Test: `ingest/lib/test_pulse_lake.py`

**Interfaces:**
- Consumes: `article_matches_city` / `article_matches_corridor` (Task 1); `_get_connection` from `ingest.lib.tier1_inventory`.
- Produces:
  - `LakeArticle` TypedDict: `{article_url:str, headline:str, body_text:str, source_name:str, published_date:str}`.
  - `load_recent_articles(window_days: int = 7, conn=None) -> list[LakeArticle]` — SELECT the window from `data_lake.news_articles_swfl` where `published_date >= today-window_days`. `conn=None` opens/closes its own; an injected conn is used and left open (testability).
  - `build_capture(unit_field: str, unit_value: str, run_at: str, articles: list[LakeArticle]) -> dict` — pure: filters `articles` for the unit (city or corridor, chosen by `unit_field`) and returns `{unit_field: unit_value, "run_at": run_at, "citations": [...], "source": "news_lake"}`. Each citation = `{"url": a["article_url"], "title": a["headline"], "cited_text": a["body_text"], "type": "news_lake"}`. `unit_field` is `"city"` or `"corridor"`.

- [ ] **Step 1: Write the failing tests** (pure builder — no DB needed for `build_capture`)

```python
# ingest/lib/test_pulse_lake.py
from ingest.lib.pulse_lake import build_capture

ARTICLES = [
    {"article_url": "https://x/1", "headline": "Naples store opens",
     "body_text": "A new shop on 5th Ave in Naples.", "source_name": "s", "published_date": "2026-07-06"},
    {"article_url": "https://x/2", "headline": "Cape Coral bridge",
     "body_text": "Unrelated to Naples.", "source_name": "s", "published_date": "2026-07-06"},
]


def test_build_capture_city_filters_and_shapes_citations():
    cap = build_capture("city", "Naples", "2026-07-07T00:00:00Z", ARTICLES)
    assert cap["city"] == "Naples"
    assert cap["run_at"] == "2026-07-07T00:00:00Z"
    assert cap["source"] == "news_lake"
    # both mention "Naples" (article 2 says "Unrelated to Naples") -> permissive match keeps both
    assert len(cap["citations"]) == 2
    assert cap["citations"][0] == {
        "url": "https://x/1", "title": "Naples store opens",
        "cited_text": "A new shop on 5th Ave in Naples.", "type": "news_lake",
    }


def test_build_capture_empty_when_no_match():
    cap = build_capture("city", "Sanibel", "2026-07-07T00:00:00Z", ARTICLES)
    assert cap["citations"] == []


def test_build_capture_corridor_uses_corridor_field():
    arts = [{"article_url": "https://x/3", "headline": "Immokalee Road widening",
             "body_text": "", "source_name": "s", "published_date": "2026-07-06"}]
    cap = build_capture("corridor", "Immokalee Rd North Naples", "2026-07-07T00:00:00Z", arts)
    assert cap["corridor"] == "Immokalee Rd North Naples"
    assert len(cap["citations"]) == 1
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `C:\Users\ethan\crawl4ai-venv\Scripts\python.exe -m pytest ingest/lib/test_pulse_lake.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'ingest.lib.pulse_lake'`

- [ ] **Step 3: Write the implementation**

```python
# ingest/lib/pulse_lake.py
"""Read the free news lake (data_lake.news_articles_swfl, crawl4ai-fed by the
news_swfl pipeline) and pack matched articles into the `capture` shape the pulse
distill already consumes. This REPLACES the paid web_search capture: same
downstream contract, $0 gather.

READ-ONLY on news_articles_swfl (owned by the news_swfl session). The only
writer is evict_stale_pool (see the eviction runner), coordinated separately."""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any, TypedDict

from ingest.lib.pulse_match import article_matches_city, article_matches_corridor
from ingest.lib.tier1_inventory import _get_connection


class LakeArticle(TypedDict):
    article_url: str
    headline: str
    body_text: str
    source_name: str
    published_date: str


_SELECT = (
    "SELECT article_url, headline, body_text, source_name, published_date "
    "FROM data_lake.news_articles_swfl "
    "WHERE published_date >= %(since)s "
    "ORDER BY published_date DESC"
)


def load_recent_articles(window_days: int = 7, conn=None) -> list[LakeArticle]:
    since = (date.today() - timedelta(days=window_days)).isoformat()
    own = conn is None
    conn = conn or _get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(_SELECT, {"since": since})
            cols = [d[0] for d in cur.description]
            return [dict(zip(cols, r)) for r in cur.fetchall()]  # type: ignore[misc]
    finally:
        if own:
            conn.close()


def build_capture(
    unit_field: str, unit_value: str, run_at: str, articles: list[LakeArticle]
) -> dict[str, Any]:
    if unit_field == "city":
        matched = [a for a in articles if article_matches_city(unit_value, a["headline"], a["body_text"])]
    elif unit_field == "corridor":
        matched = [a for a in articles if article_matches_corridor(unit_value, a["headline"], a["body_text"])]
    else:
        raise ValueError(f"unit_field must be 'city' or 'corridor', got {unit_field!r}")
    citations = [
        {"url": a["article_url"], "title": a["headline"],
         "cited_text": a["body_text"], "type": "news_lake"}
        for a in matched
    ]
    return {unit_field: unit_value, "run_at": run_at, "citations": citations, "source": "news_lake"}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `C:\Users\ethan\crawl4ai-venv\Scripts\python.exe -m pytest ingest/lib/test_pulse_lake.py -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add ingest/lib/pulse_lake.py ingest/lib/test_pulse_lake.py
git commit -F - <<'EOF'
feat(pulse): lake reader + capture builder from news_articles_swfl (Phase 1)

Packs matched free-lake articles into the exact `capture` shape distill_capture
already consumes. READ-ONLY on news_articles_swfl.
EOF
```

---

### Task 3: Retrofit city_pulse pipeline to the lake capture

**Files:**
- Modify: `ingest/pipelines/city_pulse/pipeline.py` (replace `run_city_search` usage in `main`; remove the `web_search` tool call)
- Test: `ingest/pipelines/city_pulse/test_pipeline.py` (add a lake-capture test; drop/replace the `web_search` assertion)

**Interfaces:**
- Consumes: `load_recent_articles`, `build_capture` (Task 2); the untouched `distill_capture`, `write_rows`, `reconcile_supersession`.
- Produces: `build_city_capture(city: str, run_at: str, articles: list) -> dict` — thin wrapper: `build_capture("city", city, run_at, articles)`.

- [ ] **Step 1: Write the failing test**

```python
# add to ingest/pipelines/city_pulse/test_pipeline.py
from ingest.pipelines.city_pulse.pipeline import build_city_capture


def test_build_city_capture_from_lake_articles():
    articles = [
        {"article_url": "https://n/1", "headline": "Naples land deal",
         "body_text": "Company bought 20 acres in Naples for $5M.",
         "source_name": "gulfshorebusiness", "published_date": "2026-07-06"},
        {"article_url": "https://n/2", "headline": "Estero news",
         "body_text": "Nothing about the target city.", "source_name": "s", "published_date": "2026-07-06"},
    ]
    cap = build_city_capture("Naples", "2026-07-07T00:00:00Z", articles)
    assert cap["city"] == "Naples"
    assert cap["source"] == "news_lake"
    assert [c["url"] for c in cap["citations"]] == ["https://n/1"]
    # capture has the keys distill_capture reads:
    assert set(["city", "run_at", "citations"]).issubset(cap)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `C:\Users\ethan\crawl4ai-venv\Scripts\python.exe -m pytest ingest/pipelines/city_pulse/test_pipeline.py::test_build_city_capture_from_lake_articles -v`
Expected: FAIL — `ImportError: cannot import name 'build_city_capture'`

- [ ] **Step 3: Implement — add the wrapper and rewire `main`**

Add near the top of `pipeline.py` (after the existing imports), a new import and wrapper:

```python
from ingest.lib.pulse_lake import build_capture, load_recent_articles  # noqa: E402


def build_city_capture(city: str, run_at: str, articles: list) -> dict:
    """Lake-fed replacement for run_city_search: no paid web_search, no API call."""
    return build_capture("city", city, run_at, articles)
```

In `main`, load the lake window ONCE before the loop (after `budget = RunBudget(...)`):

```python
    articles = load_recent_articles(window_days=7)
    print(f"city_pulse: {len(articles)} lake articles in the 7-day window")
```

Replace the capture call inside the loop. Change:

```python
        try:
            record = run_city_search(city, run_at, budget)
        except RunBudgetExceeded:
            raise
        except Exception as exc:
            print(f"  -> ERROR (search): {exc!r}")
            errors.append(city)
            continue

        cited = record["cited_text_count"]
        print(f"  -> {cited} cited_text spans | {record['input_tokens']} in / {record['output_tokens']} out")
        if cited == 0:
            print(f"  -> WARNING: zero cited_text spans — verify SEARCH_TOOL_VERSION is '{SEARCH_TOOL_VERSION}'")
```

to:

```python
        record = build_city_capture(city, run_at, articles)
        cited = len(record["citations"])
        print(f"  -> {cited} matched lake articles")
        if cited == 0:
            print(f"  -> no lake matches for '{city}' — zero LLM calls, skipping")
```

Change the loop's distill call to pass the budget: `rows = distill_capture(record, budget)`. The rest of the loop (dry-run print → Tier-1 upload of `to_ndjson([record])` → `write_rows`) is unchanged: `record` carries `city`, `run_at`, `citations` — exactly the keys `distill_capture` and `rows_from_extraction` read. The Tier-1 upload keeps the matched-article set as the permanent raw audit.

Lower the budget cap in `main` (the retrofit's per-run spend is ~$0.05/unit): change `RunBudget("city_pulse", default_usd=8.0, env_var="CITY_PULSE_MAX_USD")` to `default_usd=1.0`, and update its comment to reflect distill-only spend.

**Make the distill charge the budget** — edit `ingest/pipelines/city_pulse/distill.py`: change the signature to `def distill_capture(capture: dict[str, Any], budget=None) -> list[dict[str, Any]]:`, and where it currently calls `log_api_usage(model=msg.model, call_type="ingest_city_pulse_distill", usage=msg.usage)`, capture the return and charge:

```python
    cost = log_api_usage(model=msg.model, call_type="ingest_city_pulse_distill", usage=msg.usage)
    if budget is not None:
        budget.charge(cost)
```

**Re-raise the budget exception in the distill try/except.** Since the budget is now charged inside `distill_capture`, the loop's distill `try` must let `RunBudgetExceeded` kill the run instead of swallowing it as a per-city error. Change:

```python
        try:
            rows = distill_capture(record, budget)
        except RunBudgetExceeded:
            raise  # blown budget kills the whole run — never continue to the next city
        except Exception as exc:
            print(f"  -> ERROR (distill): {exc!r}")
            errors.append(city)
            continue
```

(Keep the existing `from ingest.lib.api_usage import RunBudget, RunBudgetExceeded, ...` import; `RunBudgetExceeded` is still needed here even though the old capture `try` that referenced it is gone.) The fact-extraction output is byte-identical; only spend accounting is added.

- [ ] **Step 4: Update the stale web_search test**

The retrofit deletes `_extract_citations` and `build_record` (Step 6), so their tests are now orphaned. In `ingest/pipelines/city_pulse/test_pipeline.py`, **delete these two whole tests** — `test_extract_citations_dedupes_by_url_and_text` and `test_build_record_shape` (the latter is the one asserting `tool_version == "web_search_20250305"`) — and the `from ...pipeline import _extract_citations, build_record` line that feeds only them. **Keep** `test_cities_list`, `test_slug_is_filesystem_safe`, `test_to_ndjson_round_trips`, `test_tier1_path_is_date_partitioned_and_slugged` and their imports (`CITIES`, `slug`, `to_ndjson`, `tier1_path` are all still live). Do not leave an assertion-less stub.

- [ ] **Step 5: Run tests to verify they pass**

Run: `C:\Users\ethan\crawl4ai-venv\Scripts\python.exe -m pytest ingest/pipelines/city_pulse/ -v`
Expected: PASS (new test + existing distill tests; no `web_search` assertion remains)

- [ ] **Step 6: Verify no live web_search call remains**

Run: `grep -n "web_search" ingest/pipelines/city_pulse/pipeline.py`
Expected: only comment/history lines — NO `client.messages.create(... tools=[{"type": SEARCH_TOOL_VERSION ...}])`. Delete the now-dead paid-search code from `pipeline.py`: `run_city_search`, `build_record`, `_extract_citations`, `QUERY_TEMPLATE`, `USER_LOCATION`, `ALLOWED_DOMAINS`, `SEARCH_TOOL_VERSION`, and the `import anthropic` line (only `run_city_search` used it — the distill imports its own). Keep `slug`, `to_ndjson`, `tier1_path`, `CITIES`, and the `RunBudget`/`RunBudgetExceeded`/`log_api_usage` imports (still used). Re-run `pytest ingest/pipelines/city_pulse/ -v` after the deletion to confirm the suite is still green with no import errors.

- [ ] **Step 7: Commit**

```bash
git add ingest/pipelines/city_pulse/pipeline.py ingest/pipelines/city_pulse/test_pipeline.py
git commit -F - <<'EOF'
feat(city-pulse): capture from free news lake, not paid web_search (Phase 1)

build_city_capture reads the 7-day news_articles_swfl window and packs matched
articles into the capture shape distill_capture already consumes. Zero API call
for a city with no matches. distill/write/supersession untouched.
EOF
```

---

### Task 4: Retrofit city_pulse_corridors pipeline to the lake capture

**Files:**
- Modify: `ingest/pipelines/city_pulse_corridors/pipeline.py`
- Test: `ingest/pipelines/city_pulse_corridors/test_pipeline.py`

**Interfaces:**
- Consumes: `load_recent_articles`, `build_capture` (Task 2); the untouched corridor `distill_capture`, `write_rows`, `reconcile_supersession`; the existing `resolve_corridors`.
- Produces: `build_corridor_capture(corridor: str, run_at: str, articles: list) -> dict` — `build_capture("corridor", corridor, run_at, articles)`.

- [ ] **Step 1: Write the failing test**

```python
# add to ingest/pipelines/city_pulse_corridors/test_pipeline.py
from ingest.pipelines.city_pulse_corridors.pipeline import build_corridor_capture


def test_build_corridor_capture_matches_road_name():
    articles = [
        {"article_url": "https://c/1", "headline": "Cleveland Avenue redevelopment",
         "body_text": "A 40,000 sqft lease signed on Cleveland Ave.",
         "source_name": "businessobserver", "published_date": "2026-07-06"},
        {"article_url": "https://c/2", "headline": "Daniels Parkway news",
         "body_text": "Different corridor entirely.", "source_name": "s", "published_date": "2026-07-06"},
    ]
    cap = build_corridor_capture("Cleveland Ave Fort Myers", "2026-07-07T00:00:00Z", articles)
    assert cap["corridor"] == "Cleveland Ave Fort Myers"
    assert [c["url"] for c in cap["citations"]] == ["https://c/1"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `C:\Users\ethan\crawl4ai-venv\Scripts\python.exe -m pytest ingest/pipelines/city_pulse_corridors/test_pipeline.py::test_build_corridor_capture_matches_road_name -v`
Expected: FAIL — `ImportError: cannot import name 'build_corridor_capture'`

- [ ] **Step 3: Implement — wrapper + rewire `main`**

Add the import and wrapper near the top of the corridor `pipeline.py`:

```python
from ingest.lib.pulse_lake import build_capture, load_recent_articles  # noqa: E402


def build_corridor_capture(corridor: str, run_at: str, articles: list) -> dict:
    return build_capture("corridor", corridor, run_at, articles)
```

In `main`, after the corridor work-list is resolved and the budget built, load the window once:

```python
    articles = load_recent_articles(window_days=7)
    print(f"corridor_pulse: {len(articles)} lake articles in the 7-day window")
```

Replace the per-corridor `run_corridor_search(...)` capture call with `record = build_corridor_capture(corridor, run_at, articles)` and swap the "N cited_text spans" print for `cited = len(record["citations"])` / "no lake matches → skip" exactly as in Task 3. Then apply the same four corrections as Task 3:

1. **Distill charges the budget.** Change the loop call to `rows = distill_capture(record, budget)`, and wrap it so a blown budget kills the run:

```python
        try:
            rows = distill_capture(record, budget)
        except RunBudgetExceeded:
            raise
        except Exception as exc:
            print(f"  -> ERROR (distill): {exc!r}")
            errors.append(corridor)
            continue
```

2. **Edit `ingest/pipelines/city_pulse_corridors/distill.py`:** signature → `def distill_capture(capture: dict[str, Any], budget=None) -> list[dict[str, Any]]:`; capture the return of its existing `log_api_usage(...)` call (near line 209) into `cost` and add `if budget is not None: budget.charge(cost)`. Fact output unchanged.

3. **Lower the cap:** `RunBudget("corridor_pulse", default_usd=16.0, env_var="CORRIDOR_PULSE_MAX_USD")` → `default_usd=1.0`; keep the `env_var` override wired (a busy week can set `CORRIDOR_PULSE_MAX_USD=2` in the workflow — a visible, reviewable line, never a code default).

4. **Delete dead code + orphaned test.** Remove `run_corridor_search`, `build_record`, `_extract_citations`, `QUERY_TEMPLATE`, `ALLOWED_DOMAINS`, `USER_LOCATION`, `SEARCH_TOOL_VERSION`, and the `import anthropic` from `pipeline.py`; keep `slug`, `to_ndjson`, `tier1_path`, `resolve_corridors`/`get_corridors`, and the `RunBudget`/`RunBudgetExceeded`/`log_api_usage` imports. In `test_pipeline.py`, delete the orphaned `test_build_record_has_distill_required_keys` (it calls `pipeline.build_record`); keep the slug/tier1_path/fixture/resolve tests. Everything else after distill (dry-run print, Tier-1 upload, `write_rows`, `reconcile_supersession`) is unchanged.

- [ ] **Step 4: Confirm the orphaned test is gone** (deleted in Step 3, item 4): `grep -n "build_record\|_extract_citations" ingest/pipelines/city_pulse_corridors/test_pipeline.py` → no matches.

- [ ] **Step 5: Run tests to verify they pass**

Run: `C:\Users\ethan\crawl4ai-venv\Scripts\python.exe -m pytest ingest/pipelines/city_pulse_corridors/ -v`
Expected: PASS

- [ ] **Step 6: Verify no live web_search remains**

Run: `grep -n "web_search" ingest/pipelines/city_pulse_corridors/pipeline.py`
Expected: comments/history only.

- [ ] **Step 7: Commit**

```bash
git add ingest/pipelines/city_pulse_corridors/pipeline.py ingest/pipelines/city_pulse_corridors/test_pipeline.py
git commit -F - <<'EOF'
feat(corridor-pulse): capture from free news lake, not paid web_search (Phase 1)

Mirrors city-pulse: road-name matcher over the news lake window into the
capture shape distill_capture consumes. Zero API call for a corridor with no
matches.
EOF
```

---

### Task 5: 45-day raw-pool eviction sweep (Store-1 self-cleaning)

**Files:**
- 🔴 Modify: `ingest/lib/pulse_lake.py` (add `evict_stale_pool`)
- Create: `ingest/pipelines/pulse_pool_evict.py` (CLI runner with `--dry-run`)
- Create: `.github/workflows/pulse-pool-evict-daily.yml` (cron wrapper, `--dry-run` default)
- 🔴 Test: `ingest/lib/test_pulse_lake.py` (add SQL-shape test)

**Safety note (put in the module docstring):** deleting an aged `news_articles_swfl` row is lossless — every `city_pulse` fact copies its own `source_url` + `cited_text` at distill time (`rows_from_extraction`), and Tier-1 cold storage holds the permanent raw audit. So age-based eviction never breaks a live fact. Coordinate the enable with the `news_swfl` session (RULE 1.5); ship behind `--dry-run`.

**Interfaces:**
- Produces: `evict_stale_pool(window_days: int = 45, dry_run: bool = True, conn=None) -> int` — returns the count of rows older than the window; deletes them only when `dry_run` is False. SQL: `DELETE FROM data_lake.news_articles_swfl WHERE published_date < %(cutoff)s` (cutoff = today − window_days). Dry-run runs the matching `SELECT count(*)` and deletes nothing.

- [ ] **Step 1: Write the failing test** (assert the cutoff SQL builder, no live DB)

```python
# add to ingest/lib/test_pulse_lake.py
from ingest.lib.pulse_lake import _evict_sql, _evict_count_sql

def test_evict_sql_targets_news_pool_by_published_date():
    assert "delete from data_lake.news_articles_swfl" in _evict_sql().lower()
    assert "published_date <" in _evict_sql().lower()
    assert "count(*)" in _evict_count_sql().lower()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `C:\Users\ethan\crawl4ai-venv\Scripts\python.exe -m pytest ingest/lib/test_pulse_lake.py::test_evict_sql_targets_news_pool_by_published_date -v`
Expected: FAIL — `ImportError: cannot import name '_evict_sql'`

- [ ] **Step 3: Implement in `ingest/lib/pulse_lake.py`**

```python
def _evict_count_sql() -> str:
    return "SELECT count(*) FROM data_lake.news_articles_swfl WHERE published_date < %(cutoff)s"


def _evict_sql() -> str:
    return "DELETE FROM data_lake.news_articles_swfl WHERE published_date < %(cutoff)s"


def evict_stale_pool(window_days: int = 45, dry_run: bool = True, conn=None) -> int:
    """Drop raw-pool rows older than window_days. Lossless: city_pulse facts copy
    their own source_url + cited_text; Tier-1 cold storage keeps the raw audit."""
    cutoff = (date.today() - timedelta(days=window_days)).isoformat()
    own = conn is None
    conn = conn or _get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(_evict_count_sql(), {"cutoff": cutoff})
            n = cur.fetchone()[0]
            if not dry_run and n:
                cur.execute(_evict_sql(), {"cutoff": cutoff})
                conn.commit()
        return n
    finally:
        if own:
            conn.close()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `C:\Users\ethan\crawl4ai-venv\Scripts\python.exe -m pytest ingest/lib/test_pulse_lake.py -v`
Expected: PASS (all pulse_lake tests)

- [ ] **Step 5: Create the CLI runner**

```python
# ingest/pipelines/pulse_pool_evict.py
"""Daily raw-pool eviction: drop news_articles_swfl rows older than 45 days.
Lossless (see ingest/lib/pulse_lake.evict_stale_pool). --dry-run counts only.

  python -m ingest.pipelines.pulse_pool_evict --dry-run
  python -m ingest.pipelines.pulse_pool_evict
"""
from __future__ import annotations

import argparse
import sys

from ingest.lib.pulse_lake import evict_stale_pool

WINDOW_DAYS = 45


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--dry-run", action="store_true", help="Count only; delete nothing.")
    p.add_argument("--window-days", type=int, default=WINDOW_DAYS)
    args = p.parse_args(argv)
    n = evict_stale_pool(window_days=args.window_days, dry_run=args.dry_run)
    verb = "would evict" if args.dry_run else "evicted"
    print(f"pulse_pool_evict: {verb} {n} rows older than {args.window_days}d")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 6: Create the GHA wrapper** (`--dry-run` default; mirror an existing ingest cron's structure — engine guard, Python 3.13, secrets)

```yaml
# .github/workflows/pulse-pool-evict-daily.yml
name: pulse-pool-evict-daily
on:
  schedule:
    - cron: "30 8 * * *" # 08:30 UTC daily — dry-run counts by default
  workflow_dispatch:
    inputs:
      apply:
        description: "Set true to actually delete (default dry-run)"
        type: boolean
        default: false
permissions:
  contents: read
jobs:
  evict:
    if: ${{ vars.ENGINE_ENABLED != 'false' || github.event_name == 'workflow_dispatch' }}
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-python@v6
        with:
          python-version: "3.13"
      - run: pip install -r ingest/requirements.txt
      - name: Evict stale pool
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
          DESTINATION__POSTGRES__CREDENTIALS: ${{ secrets.DESTINATION__POSTGRES__CREDENTIALS }}
        run: python -m ingest.pipelines.pulse_pool_evict ${{ github.event.inputs.apply == 'true' && ' ' || '--dry-run' }}
```

- [ ] **Step 7: Register the cadence entry** in `ingest/cadence_registry.yaml` under the appropriate section (daily), documenting the 45-day window and the lossless rationale. (Match the surrounding YAML shape; coordinate with the `news_swfl` owner since the table is shared.)

- [ ] **Step 8: Commit**

```bash
git add ingest/lib/pulse_lake.py ingest/lib/test_pulse_lake.py ingest/pipelines/pulse_pool_evict.py .github/workflows/pulse-pool-evict-daily.yml ingest/cadence_registry.yaml
git commit -F - <<'EOF'
feat(pulse): 45-day raw-pool eviction sweep, dry-run default (Phase 1)

Lossless age-based cleanup of news_articles_swfl so Store-1 never bloats.
GHA wrapper counts by default; delete is an explicit dispatch input.
EOF
```

---

### Task 6: Re-enable the crons (operator-gated live-verify)

**Files:**
- Modify: `.github/workflows/corridor-pulse-weekly.yml` (uncomment `schedule:`)
- Modify: `.github/workflows/city-pulse-daily.yml` (uncomment `schedule:`)

**This task is operator-run** (per the no-live-paid-without-approval + `*_live_verify` rules). Do NOT uncomment a schedule until its dry-run is green on the runner with zero web-search billing. Order: corridors first (the bigger burner), then city.

- [ ] **Step 1: Dry-run corridors on the runner (free)**

Run: `gh workflow run corridor-pulse-weekly.yml -f dry_run=true --repo <ingest-repo>`
Expected: log shows "N lake articles in the 7-day window", per-corridor matched counts, distilled facts printed, and **zero web-search billing segments** in the run's API usage. Confirm `api_usage_log` shows only `ingest_city_pulse_distill`-type calls (Sonnet), no `searches`.

- [ ] **Step 2: Uncomment the corridor schedule**

In `corridor-pulse-weekly.yml`, restore:

```yaml
  schedule:
    - cron: "0 10 * * 0"
```

(Delete the "PAUSED" comment block above it; leave the slot-collision note.)

- [ ] **Step 3: Dry-run city on the runner (free)**

Run: `gh workflow run city-pulse-daily.yml -f dry_run=true --repo <ingest-repo>`
Expected: same as Step 1 for the 13 cities.

- [ ] **Step 4: Uncomment the city schedule**

In `city-pulse-daily.yml`, restore:

```yaml
  schedule:
    - cron: "0 9 * * *"
```

- [ ] **Step 5: Commit + close the check**

```bash
git add .github/workflows/corridor-pulse-weekly.yml .github/workflows/city-pulse-daily.yml
git commit -F - <<'EOF'
feat(pulse): re-enable city + corridor crons on the free lake capture (Phase 1)

Both dry-run green on the runner with zero web-search billing. Capture is now
news_articles_swfl matching; distill stays Sonnet.
EOF
node scripts/check.mjs close pulse_crawl4ai_retrofit_live_verify --evidence "<runner run URLs; api_usage_log shows distill-only Sonnet calls, zero web_search segments; rows written to city_pulse + city_pulse_corridors>"
```

---

## Self-Review

**Spec coverage:** capture retrofit (Tasks 3–4) · Python matcher (Task 1) · Sonnet distill on matched text with zero-call-on-empty (Tasks 2–4, relies on `distill_capture`'s existing empty guard) · three dedup layers (URL `dedup_key` + `story_key`/`reconcile_supersession` already exist and stay wired; temporal dedup is Phase 2 per spec) · 45-day eviction (Task 5) · re-enable corridors-then-city after green dry-run (Task 6). All Phase 1 spec bullets map to a task.

**Placeholders:** none — every code step carries complete code; the only investigation step (confirming corridor_name format) is covered by reusing the existing `resolve_corridors`. `<ingest-repo>` and the Task-6 evidence string are operator-supplied runtime values, not code placeholders.

**Type consistency:** `build_capture(unit_field, unit_value, run_at, articles)` returns keys `{<unit_field>, run_at, citations, source}`; `distill_capture` reads `citations` + `city`/`corridor` + `run_at` — consistent. `LakeArticle` keys match the `news_articles_swfl` columns and the citation builder. `evict_stale_pool`/`_evict_sql`/`_evict_count_sql` names align across Task 5.

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 2, Task 5 | `ingest/lib/pulse_lake.py`, `ingest/lib/test_pulse_lake.py` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
