# 01 — Daily Truth Engine **[SPINE]** (Wave 1)

> Build file for the Daily Freshness System. **Read `README.md` §0 (ledger), §2 (loop), §3a (the `daily_truth` schema this file defines).** This is the MOAT core: ask reliable sources for today's number, cross-check across cascade legs, verify it's on the cited page, and store **only** a sourced+verified number — never a bare model number.

**Model:** Opus · **Repo:** brain-platform · **Wave:** 1 · **Depends:** 00 · **Ships in the SAME PR as 02 + 03** (brain-first gate).

**Goal:** A fallback-cascade engine (`api` mode for FRED-style authoritative APIs; `search` mode = Gemini → Firecrawl → Spider → Claude) that writes the first-class Tier-2 table `data_lake.daily_truth`, storing a value only when it is sourced from a named reliable source AND re-found on the cited page within tolerance.

**Architecture:** Two fetch modes. `api` = deterministic pull from an authoritative API (FRED `MORTGAGE30US`) — single reliable source, trivially verified. `search` = the cascade with cross-leg agreement + verify-on-page. Both write the same row shape. Provenance precedence (§2 MOAT): sourced rows always lose to vendor rows; an unverifiable value stores as `NULL + status_reason`, never a guess.

---

## STEP 0 — Rule 1 / Vendor-First (do this BEFORE writing any engine code)

The Gemini grounding surface drifts. README §0 captured it on 2026-06-15 — **re-verify it live in your session** with WebFetch on `https://ai.google.dev/gemini-api/docs/google-search` and `…/pricing` and confirm, verbatim: (a) the model id (`gemini-2.5-flash` vs a newer `gemini-3-*`), (b) the tool key is still `tools:[{ "google_search": {} }]`, (c) the response path `candidates[].groundingMetadata.groundingChunks[].web.uri` + `.web.title`, (d) the redirect host is still `vertexaisearch.cloud.google.com`. If Gemini 3 grounding (cheaper: $14/1k, 5,000/mo free) is GA and the operator wants it, set the model id accordingly — the request/response shape is the same. **The plan is a hypothesis; the live doc is authority.**

---

## Files

- **Create:** `ingest/pipelines/live_search/__init__.py`
- **Create:** `ingest/pipelines/live_search/engine.py` — the cascade + verify-on-page (pure, testable; no DB).
- **Create:** `ingest/pipelines/live_search/pipeline.py` — registry-driven runner + psycopg upsert + `--dry-run`.
- **Create:** `ingest/scripts/migrate_daily_truth.py` — idempotent DDL for `data_lake.daily_truth`.
- **Create:** `ingest/pipelines/live_search/tests/test_engine.py` — the test suite.
- **Reuse (do not copy blindly — import/mirror):** `ingest/lib/extract_client.py` (`scrape_with_fallback`, `extract`, `ExtractError` — Firecrawl primary, Spider fallback), `ingest/pipelines/fred_g17/resources.py` (FRED request shape: `https://api.stlouisfed.org/fred/series/observations`, params `{series_id, api_key, file_type:"json", observation_start, sort_order:"asc"}`), `ingest/scripts/migrate_nfip_flood_zone_current.py` (`_uri()` + `psycopg.connect` + `NOTIFY pgrst,'reload schema'` + idempotent DDL + `GRANT`), `ingest/lib/guards.py` (`assert_min_rows(landed:int, minimum:int, label="")`).
- **No new Python dependency:** Gemini grounding is called via **REST with `requests`** (already pinned), matching the `fred_g17` pattern. (`requests`, `psycopg`, `firecrawl-py`, `anthropic`, `pyyaml` are all already in `ingest/requirements.txt` → no lockfile churn.)

---

## Task 1 — Migration: `data_lake.daily_truth`

- [ ] **Step 1.1: Write `ingest/scripts/migrate_daily_truth.py`** (mirror `migrate_nfip_flood_zone_current.py`):

```python
"""Idempotent DDL for data_lake.daily_truth (the sourced-freshness spine table)."""
import psycopg
from ingest.scripts.migrate_nfip_flood_zone_current import _uri  # reuse the exact creds resolver

DDL = """
CREATE SCHEMA IF NOT EXISTS data_lake;
CREATE TABLE IF NOT EXISTS data_lake.daily_truth (
  metric_key        text        NOT NULL,
  area              text        NOT NULL,
  period            date        NOT NULL,
  value             numeric,
  unit              text,
  source_url        text,
  source_title      text,
  engine            text,
  query_text        text,
  retrieved_at      timestamptz NOT NULL DEFAULT now(),
  agreement_n       int         NOT NULL DEFAULT 0,
  verified_on_page  boolean     NOT NULL DEFAULT false,
  source_tag        text        NOT NULL DEFAULT 'live_search',
  status_reason     text,
  metric_config     jsonb,
  CONSTRAINT daily_truth_pk PRIMARY KEY (metric_key, area, period, source_tag)
);
CREATE INDEX IF NOT EXISTS daily_truth_retrieved_idx ON data_lake.daily_truth (retrieved_at DESC);
GRANT SELECT ON data_lake.daily_truth TO service_role;
"""

def main() -> None:
    with psycopg.connect(_uri(), connect_timeout=30) as conn:
        with conn.cursor() as cur:
            cur.execute(DDL)
            cur.execute("NOTIFY pgrst, 'reload schema';")
        conn.commit()
        # verify
        with conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM information_schema.columns "
                        "WHERE table_schema='data_lake' AND table_name='daily_truth';")
            assert cur.fetchone()[0] >= 15, "daily_truth columns missing"
    print("migrate_daily_truth: OK")

if __name__ == "__main__":
    main()
```

- [ ] **Step 1.2: Run it and verify.**

```bash
python -m ingest.scripts.migrate_daily_truth
# Expected: "migrate_daily_truth: OK"
python -c "import psycopg; from ingest.scripts.migrate_nfip_flood_zone_current import _uri; \
c=psycopg.connect(_uri()); print(c.execute('select count(*) from data_lake.daily_truth').fetchone())"
# Expected: (0,)
```

- [ ] **Step 1.3: Commit** (`git add ingest/scripts/migrate_daily_truth.py`).

---

## Task 2 — Engine: the cascade + verify-on-page (TDD)

- [ ] **Step 2.1: Write the failing tests first** (`ingest/pipelines/live_search/tests/test_engine.py`). Cover the MOAT invariants:

```python
import pytest
from ingest.pipelines.live_search import engine

def test_extract_numbers_normalizes_money():
    # "$360K", "359,950", "$360,000" all parse near 360000
    nums = engine.extract_numbers("Median sale price was $360K (up from $359,950).")
    assert any(abs(n - 360000) <= 1000 for n in nums)
    assert any(abs(n - 359950) <= 1) for n in [n for n in nums]

def test_verify_on_page_numeric_tolerance(monkeypatch):
    monkeypatch.setattr(engine, "_scrape_text", lambda url: "Cape Coral median sale price: $362,000")
    assert engine.verify_on_page(360000, "https://www.redfin.com/x", ["redfin.com"], tolerance_pct=10)
    assert not engine.verify_on_page(360000, "https://www.redfin.com/x", ["redfin.com"], tolerance_pct=0.1)

def test_verify_rejects_disallowed_domain(monkeypatch):
    monkeypatch.setattr(engine, "_scrape_text", lambda url: "median $360,000")
    assert not engine.verify_on_page(360000, "https://randomblog.example/x", ["redfin.com"], 10)

def test_resolve_vertex_redirect(monkeypatch):
    monkeypatch.setattr(engine, "_follow_redirect",
                        lambda u: "https://www.redfin.com/news/data-center/")
    out = engine.resolve_source_url("https://vertexaisearch.cloud.google.com/grounding-api-redirect/AB12")
    assert "redfin.com" in out

def test_agreement_counts_within_tolerance():
    cands = [engine.Candidate(360000, "redfin.com", "u1", "gemini"),
             engine.Candidate(362000, "zillow.com", "u2", "firecrawl"),
             engine.Candidate(410000, "blog", "u3", "claude")]
    n, winner = engine.cross_check(cands, tolerance_pct=10)
    assert n == 2 and abs(winner.value - 361000) < 5000

def test_no_source_means_no_store():
    row = engine.resolve_metric_search(_cfg(), candidates=[], verify=lambda *a: False)
    assert row.value is None and "no source" in row.status_reason.lower()

def test_out_of_range_flags_null():
    row = engine.finalize(_winner(value=9_000_000), cfg=_cfg(expected_range=(200000, 900000)),
                          verified=True, agreement_n=2)
    assert row.value is None and "range" in row.status_reason.lower()

def test_api_mode_fred_happy_path(monkeypatch):
    monkeypatch.setattr(engine, "_fred_latest",
                        lambda series_id: (6.52, "2026-06-11"))
    row = engine.resolve_metric_api(_cfg(fetch_mode="api",
        api_config={"provider": "fred", "series_id": "MORTGAGE30US"}, unit="pct"))
    assert row.value == 6.52 and row.verified_on_page and row.engine == "fred"
```

- [ ] **Step 2.2: Run them — expect failures** (`pytest ingest/pipelines/live_search/tests/test_engine.py -x`). Expected: import/attribute errors (engine not implemented).

- [ ] **Step 2.3: Implement `engine.py`** to pass. Key surfaces (complete enough to implement, not paraphrase):

```python
"""Cascade ask→verify engine for data_lake.daily_truth. Pure (no DB). MOAT: never return a bare number."""
from __future__ import annotations
import os, re, requests
from dataclasses import dataclass, field
from statistics import median
from ingest.lib.extract_client import scrape_with_fallback, ExtractError

GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")  # re-verify per STEP 0
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
_MONEY = re.compile(r"\$?\s*([\d]{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*([KkMm])?")

@dataclass
class Candidate:
    value: float; domain: str; source_url: str; engine: str; source_title: str = ""

@dataclass
class DailyTruthRow:
    metric_key: str; area: str; period: str; value: float | None; unit: str
    source_url: str | None = None; source_title: str | None = None; engine: str | None = None
    query_text: str | None = None; agreement_n: int = 0; verified_on_page: bool = False
    source_tag: str = "live_search"; status_reason: str | None = None
    metric_config: dict = field(default_factory=dict)

def extract_numbers(text: str) -> list[float]:
    out = []
    for raw, suffix in _MONEY.findall(text or ""):
        n = float(raw.replace(",", ""))
        if suffix and suffix.lower() == "k": n *= 1_000
        if suffix and suffix.lower() == "m": n *= 1_000_000
        out.append(n)
    return out

def _follow_redirect(url: str) -> str:
    r = requests.head(url, allow_redirects=True, timeout=20)
    return r.url

def resolve_source_url(url: str) -> str:
    return _follow_redirect(url) if "vertexaisearch.cloud.google.com" in (url or "") else url

def _domain_of(url: str) -> str:
    m = re.match(r"https?://([^/]+)/?", url or ""); return (m.group(1).lower() if m else "").lstrip("www.")

def _scrape_text(url: str) -> str:
    try: return scrape_with_fallback(url, formats=("markdown",)) or ""
    except ExtractError: return ""

def verify_on_page(value: float, source_url: str, allowed_domains: list[str], tolerance_pct: float) -> bool:
    dom = _domain_of(resolve_source_url(source_url))
    if not any(dom.endswith(a) for a in allowed_domains):  # allowlist gate
        return False
    text = _scrape_text(resolve_source_url(source_url))
    tol = abs(value) * tolerance_pct / 100.0
    return any(abs(n - value) <= tol for n in extract_numbers(text))

def cross_check(cands: list[Candidate], tolerance_pct: float) -> tuple[int, Candidate | None]:
    if not cands: return 0, None
    vals = [c.value for c in cands]; m = median(vals); tol = abs(m) * tolerance_pct / 100.0
    agree = [c for c in cands if abs(c.value - m) <= tol]
    winner = min(agree or cands, key=lambda c: abs(c.value - m))
    return len(agree), winner

# --- cascade legs (each returns Candidate | None; never raises out) ---
def gemini_grounded(question: str, allowed_domains: list[str]) -> Candidate | None: ...   # REST POST, tools:[{google_search:{}}]; pull groundingChunks[].web.uri (resolve redirect), parse number
def firecrawl_leg(question: str, urls: list[str]) -> Candidate | None: ...                # extract() over allowlisted urls
def spider_leg(question: str, urls: list[str]) -> Candidate | None: ...                    # scrape_with_fallback deep
def claude_leg(question: str, context: str) -> Candidate | None: ...                       # Haiku last-resort, tagged

def resolve_metric_search(cfg, candidates=None, verify=verify_on_page) -> DailyTruthRow: ...  # run legs, cross_check, finalize
def resolve_metric_api(cfg) -> DailyTruthRow: ...                                          # FRED-style: _fred_latest(series_id) -> deterministic row
def finalize(winner, cfg, verified, agreement_n) -> DailyTruthRow: ...                     # range-guard + verify gate + NULL-on-fail
```

**Gemini leg detail (the load-bearing one):** POST `GEMINI_URL?key=$GEMINI_API_KEY` with `{"contents":[{"parts":[{"text": question}]}],"tools":[{"google_search":{}}]}`. From the response, take `candidates[0].content.parts[*].text` (the answer prose) → `extract_numbers`; take `candidates[0].groundingMetadata.groundingChunks[0].web.uri` (+ `.web.title`) as `source_url` → `resolve_source_url` (it's a `vertexaisearch…` redirect). The `Candidate.domain` = `_domain_of` the resolved url.

**`finalize` store rule (MOAT):** store `value` only if `winner is not None` AND `verified_on_page` AND `expected_range[0] <= value <= expected_range[1]`. Otherwise `value=None` with a precise `status_reason` (`"no source from any leg"` / `"failed on-page verification"` / `"value 9000000 outside expected_range"` / `"disagreement: legs returned …"`).

- [ ] **Step 2.4: Run tests — expect pass** (`pytest ingest/pipelines/live_search/tests/test_engine.py -v`). Expected: all green.

- [ ] **Step 2.5: Commit** (`git add ingest/pipelines/live_search/`).

---

## Task 3 — Pipeline: registry-driven runner + idempotent upsert

- [ ] **Step 3.1: Implement `pipeline.py`.** Read the `live_search_config:` entries from `cadence_registry.yaml` (file 02 authors them), run `engine.resolve_metric_*` per `(metric, area)`, and upsert:

```python
def upsert(rows: list[DailyTruthRow]) -> int:
    landed = [r for r in rows if r.value is not None or r.status_reason]  # store NULL+reason rows too (audit trail)
    assert_min_rows(len([r for r in rows]), 1, "daily_truth")             # we ran at least one metric
    with psycopg.connect(_uri(), connect_timeout=30) as conn, conn.cursor() as cur:
        for r in rows:
            cur.execute("""
              INSERT INTO data_lake.daily_truth
                (metric_key, area, period, value, unit, source_url, source_title, engine,
                 query_text, agreement_n, verified_on_page, source_tag, status_reason, metric_config)
              VALUES (%(metric_key)s,%(area)s,%(period)s,%(value)s,%(unit)s,%(source_url)s,%(source_title)s,
                 %(engine)s,%(query_text)s,%(agreement_n)s,%(verified_on_page)s,%(source_tag)s,
                 %(status_reason)s,%(metric_config)s)
              ON CONFLICT (metric_key, area, period, source_tag) DO UPDATE SET
                value=EXCLUDED.value, source_url=EXCLUDED.source_url, source_title=EXCLUDED.source_title,
                engine=EXCLUDED.engine, agreement_n=EXCLUDED.agreement_n,
                verified_on_page=EXCLUDED.verified_on_page, status_reason=EXCLUDED.status_reason,
                retrieved_at=now(), metric_config=EXCLUDED.metric_config
            """, _as_params(r))
        conn.commit()
    return len(rows)
```

This is a **non-destructive merge** (no `replace`/truncate) → the Gate-4 non-null guard does not apply (README §6). CLI: `python -m ingest.pipelines.live_search.pipeline [--dry-run] [--metric <id>]`. `--dry-run` prints rows (value + source + agreement + verified) without writing — mirror `estero_edc/pipeline.py`.

- [ ] **Step 3.2: End-to-end smoke (one metric).**

```bash
python -m ingest.pipelines.live_search.pipeline --dry-run --metric live_search_daily_median_price
# Expected: cascade returns {value, source_url, engine, agreement_n>=1, verified_on_page} for cape_coral/fort_myers/naples
python -m ingest.pipelines.live_search.pipeline --metric live_search_daily_median_price
python -c "import psycopg; from ingest.scripts.migrate_nfip_flood_zone_current import _uri; \
print(psycopg.connect(_uri()).execute(\"select metric_key,area,value,source_tag,verified_on_page from data_lake.daily_truth order by retrieved_at desc limit 10\").fetchall())"
# Expected: rows with verified_on_page=true and a non-vertexaisearch source_url, OR value=NULL with a status_reason — never a bare number.
```

- [ ] **Step 3.3: Commit** (`git add ingest/pipelines/live_search/pipeline.py`).

---

## Definition of Done

- `data_lake.daily_truth` exists with the §3a schema, PK `(metric_key, area, period, source_tag)`, `GRANT SELECT TO service_role`, PostgREST reloaded.
- `pytest ingest/pipelines/live_search/tests/test_engine.py` is green, covering: no-source→no-store, disagreement→flag, range-guard→NULL, unverifiable→NULL, redirect-resolve, numeric ±tolerance match, disallowed-domain reject, api-mode FRED happy path.
- A live run writes rows that are **either** sourced+verified (`verified_on_page=true`, resolved `source_url`, `agreement_n≥1`) **or** `NULL + status_reason` — **never a bare model number** (MOAT, grep the table to confirm no row has `value IS NOT NULL AND source_url IS NULL`).
- **Board row:** `01-daily-truth-engine` GREEN — engine smoke passes, table populated for the first metric.
