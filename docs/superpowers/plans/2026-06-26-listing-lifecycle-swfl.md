# listing-lifecycle-swfl Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a property **lifecycle state machine** that scans a full-coverage listing source's status categories daily, keys every property by its **address** (not listing id), records every **state transition** (new → active → pending → sold / pulled / back-on-market), and surfaces those transitions to master as live absorption / withdrawal / deal-collapse signal — the data we were throwing away by only photographing the active feed.

**Architecture:** One Python ingest pipeline (`ingest/pipelines/listing_lifecycle/`) does a daily category scan via crawl4ai (HTTP strategy, backing-JSON-first). A pure-logic transition engine diffs the scanned states against the stored `data_lake.listing_state` (current state, MERGE — never replace) and appends every change to `data_lake.listing_transitions` (durable history). One tier-1 reporter brain (`refinery/packs/listing-lifecycle-swfl.mts`) reads both tables aggregated-at-source and hands master per-state counts + transition counts. **Capture wide, build narrow, slice late:** every card field becomes a column; price/sqft/ZIP/type are sliced at query time, never as separate lanes.

**Tech Stack:** Python 3.12 (crawl4ai HTTP strategy, BeautifulSoup), Postgres `data_lake.*` (idempotent SQL via `Bun.SQL`), TypeScript/Bun refinery (`PackDefinition` / `SourceConnector`), GitHub Actions cron (parked until runner-IP WAF-proven).

## Global Constraints

Every task's requirements implicitly include this section. Values are verbatim, non-negotiable.

- **NO company / portal / feed-provider names, no "MLS" / "IDX" / "RESO" / board names (`swfl_mls`/`nabor`) anywhere in the repo.** Sources are **Source A** (incumbent, capped) and **Source B** (candidate, full-coverage), generically. Real identities + URLs live ONLY in `*_BASE_URL` secrets (e.g. `LISTING_LIFECYCLE_BASE_URL`), never committed. (Operator decree 2026-06-26: "keep any company names out or mls or idx reference until we get our own when we get users.")
- **Don't re-ingest the full market daily.** Scan only the small, *moving* status categories (New / Pending / Sold / recently-changed); the bulk active feed is pulled only on the coverage-guard cadence, not daily. (Operator: "we are pulling all and then updating. very simple.")
- **Capture wide, slice late.** ONE pipeline, ONE wide `listing_state` table, ONE transition engine. Price range / sqft / ZIP / property type / beds are **columns**, sliced in each brain's SQL at query time — **never a lane per dimension** (a new cut is a new query, never a new pipeline). (Operator: "dont want to do too much because every brain falls along with the pipelines.")
- **No-invention (four-lane moat).** Every number is a real scraped value (lane 1). The *state* is the source's own label; seller *motivation* is `[INFERENCE]` only, with the cited base fact + one falsifier. Never assert *why* beyond the labeled transition.
- **Aggregate at source.** Push COUNT / AVG / median / grouping to SQL — never haul raw rows into the brain (operator decree). The brain reads pre-aggregated grain rows.
- **Address is the key, not the listing id.** A relisting gets a new listing id; key on the normalized address so a relist reads as two events on one property (spec research finding #3).
- **ZIP gate G1:** `zip_code` is parsed from the listing's own site address / URL only — never a mailing ZIP.
- **Bible §0.3 web-scraping hardening:** crawl4ai-only (never Firecrawl), HTTP strategy for server-rendered lists, backing-JSON-first, **merge-not-replace**, fail-loud-on-empty, natural-exhaustion (no silent caps), parked cron + tracking check until WAF-proven from the runner IP.
- **Brain-first gate (§1):** the `PackDefinition` + every vocab slug it can emit (incl. conditionals) land in `brain-vocabulary.json` in the SAME PR as the ingest; the connector is ODD-ready (empty-tolerant, fixture-defaulted).
- **crawl4ai interpreter (pinned):** `C:\Users\ethan\crawl4ai-venv\Scripts\python.exe`. crawl4ai files are gitignored (`*crawl4ai*`) — probe scripts NEVER get committed.
- **Pre-push gates:** SESSION_LOG entry every push · `node scripts/safe-push.mjs` · explicit paths only (never `git add -A`) · Gate 5 (pack ⇆ catalog mirror + pack `bun:test`) on any `refinery/packs/**` change · vocab/alias gate on any vocab change · never push without operator confirmation.

---

## File Structure

| File | Responsibility | Phase |
|---|---|---|
| `docs/handoff/2026-06-2X-listing-lifecycle-source-contract.md` | The discovered Source-B contract: category query params, pagination, Pulled-visibility answer, card field map, address-key rule. The gate for Phase 1. | 0 |
| `migrations/2026XXXX_listing_lifecycle.sql` | DDL for `data_lake.listing_state` (wide current-state) + `data_lake.listing_transitions` (durable history) + grants. | 1 |
| `ingest/pipelines/listing_lifecycle/__init__.py` | Package marker. | 1 |
| `ingest/pipelines/listing_lifecycle/address_key.py` | Pure `address_key(street, zip)` normalizer — the relisting identity. | 1 |
| `ingest/pipelines/listing_lifecycle/extract.py` | crawl4ai HTTP category scan → list of raw card dicts (all wide fields), per county per status. | 1 |
| `ingest/pipelines/listing_lifecycle/transitions.py` | Pure diff engine: scanned states vs stored state → transition rows; merge-not-replace. | 1 |
| `ingest/pipelines/listing_lifecycle/coverage_guard.py` | Per-category completeness gate (natural-exhaustion + self-referential stability + baseline seed); skip-on-fail. | 1 |
| `ingest/pipelines/listing_lifecycle/pipeline.py` | Orchestrator: daily category scan loop → guard → diff → upsert state + append transitions; `--dry-run` / `--county`; fail-loud on total-empty. | 1 |
| `ingest/tests/pipelines/listing_lifecycle/test_*.py` | Unit tests for address_key, transitions, coverage_guard, extract (fixture). | 1 |
| `.github/workflows/listing-lifecycle-daily.yml` | Parked GHA cron wrapper (manual dispatch until WAF-proven). | 1 |
| `ingest/cadence_registry.yaml` | Parked `not_yet_running:` entry → graduates to `pipelines:` after first green cron. | 1 |
| `refinery/sources/listing-lifecycle-source.mts` | `SourceConnector` reading the aggregate-at-source lifecycle view; fixture/live; emits one summary fragment. | 2 |
| `refinery/__fixtures__/listing-lifecycle.sample.json` | Fixture rows for offline pack/source tests. | 2 |
| `refinery/packs/listing-lifecycle-swfl.mts` | The tier-1 reporter `PackDefinition`. | 2 |
| `refinery/packs/catalog.mts` | Add the catalog mirror entry (Gate 5). | 2 |
| `brain-vocabulary.json` | Register every slug the pack can emit. | 2 |
| `docs/sql/2026XXXX_listing_lifecycle_state_view.sql` | The aggregate-at-source GROUPING SETS view the source reads. | 2 |

---

## PHASE 0 — Source contract discovery (research; gates Phase 1)

> Phase 0 is **discovery, not code**. Its deliverable is a committed contract doc the Phase-1 connector consumes. Per CLAUDE.md RULE 0.4: research the real API behavior with crawl4ai FIRST, write findings down, THEN build. The probe scripts below are crawl4ai files — they stay local (gitignored), only the contract doc is committed. Do NOT proceed to Phase 1 until every open question here has a verbatim answer.

### Task 0.1: Confirm Source-B reachability + set the base-URL secret

**Files:**
- Create (local, gitignored): `scratchpad/probe_lifecycle_reach.py`
- Deliverable: `LISTING_LIFECYCLE_BASE_URL` secret set; reachability note in the contract doc.

**Interfaces:**
- Produces: a confirmed boolean — Source B's category/listing pages are server-rendered and reachable via crawl4ai **HTTP strategy** (no browser) from (a) home IP and (b) the GHA runner IP.

- [ ] **Step 1: Set the secret (real URL never in repo).**

```bash
gh secret set LISTING_LIFECYCLE_BASE_URL -R ethanrickyjrjr-wq/brain-platform   # paste the Source-B origin, e.g. https://<host>
```

- [ ] **Step 2: Probe reachability with the HTTP strategy.**

```python
# scratchpad/probe_lifecycle_reach.py  (crawl4ai venv: C:\Users\ethan\crawl4ai-venv\Scripts\python.exe)
import asyncio, os
from crawl4ai import AsyncWebCrawler, CacheMode, CrawlerRunConfig, HTTPCrawlerConfig
from crawl4ai.async_crawler_strategy import AsyncHTTPCrawlerStrategy
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
B = os.environ["LISTING_LIFECYCLE_BASE_URL"]
async def main():
    cfg = HTTPCrawlerConfig(method="GET", headers={"User-Agent": UA}, follow_redirects=True)
    async with AsyncWebCrawler(crawler_strategy=AsyncHTTPCrawlerStrategy(browser_config=cfg)) as c:
        r = await c.arun(url=f"{B}/lee-county/", config=CrawlerRunConfig(cache_mode=CacheMode.BYPASS))
        print("status:", getattr(r, "status_code", None), "bytes:", len(r.html or ""))
        print("cards:", (r.html or "").count("/property-search/detail/"))
asyncio.run(main())
```

- [ ] **Step 3: Run it (home IP first).**

Run: `$env:LISTING_LIFECYCLE_BASE_URL="<url>"; C:\Users\ethan\crawl4ai-venv\Scripts\python.exe scratchpad/probe_lifecycle_reach.py`
Expected: `status: 200`, non-trivial byte count, cards > 0. If 403 → WAF block; record it and the cron stays parked (Bible §0.3 — do not schedule until proven).

- [ ] **Step 4: Record the verdict** in `docs/handoff/2026-06-2X-listing-lifecycle-source-contract.md` under "Reachability" (home-IP status; runner-IP status to be confirmed in Phase 1 Task 1.7). No commit of the probe (gitignored); the contract doc commits in Task 0.3.

### Task 0.2: Crack the status-category queries + resolve Pulled-visibility

**Files:**
- Create (local): `scratchpad/probe_lifecycle_categories.py`
- Deliverable: verbatim category-query contract in the contract doc.

**Interfaces:**
- Produces: for each lifecycle state, the exact query that returns ONLY that category — endpoint path, status param name + values, pagination param, max honored page size, and whether a **backing JSON** endpoint exists (preferred per Bible §0.3, the Crexi lesson). Plus the **Pulled-visibility** answer.

- [ ] **Step 1: Probe the search/results endpoint for status filtering.** Reuse the pattern in the prior session's `scratchpad/probe_categories.py` (status inputs on the search form; candidate status params; count listings + statuses-seen per response). Look specifically for a backing JSON results API (search the HTML/network for a results endpoint that accepts `searchid` / `status` / `pageSize` / `pageNumber`).

- [ ] **Step 2: Enumerate the status taxonomy actually returned on cards.** Confirm the labels the spec expects exist on real cards: `active · new · pending · under-contract · contingent · coming-soon · back-on-market · sold · temporarily-off-market`.

- [ ] **Step 3: Resolve the one blocking open question — Pulled-visibility.** Determine whether a withdrawn listing stays queryable as a `temporarily-off-market` category, or fully drops off. Query that category; if it returns rows → the full state machine runs on small scans. If it 404s/empties → "Pulled by elimination" (a property in our Active set returned by NO category today), re-confirmed against the bulk active feed on the coverage-guard cadence.

- [ ] **Step 4: Write the contract.** Record verbatim in the contract doc: each category's query string, pagination, max page size, backing-JSON endpoint (or "none — parse server-rendered cards"), the status taxonomy, and the Pulled-visibility verdict (queryable vs by-elimination).

### Task 0.3: Card field map + address-key stability

**Files:**
- Create (local): `scratchpad/probe_lifecycle_fields.py`
- Create + commit: `docs/handoff/2026-06-2X-listing-lifecycle-source-contract.md`

**Interfaces:**
- Produces: the wide field list every card exposes (the `listing_state` columns) + confirmation that the chosen `address_key` is stable across two consecutive pulls (Bible §0.2.3 — verify key stability before trusting it).

- [ ] **Step 1: Dump one card's full field set.** Confirm the known fields are all present and selector-stable: price, price-suffix (rent marker), beds, baths (full/half), sqft, lot/acres, address, city, ZIP, subdivision, brokerage, status badge, listing id, listed-date / days-on-market. Record each field's selector.

- [ ] **Step 2: Pull the same county twice (a few minutes apart); confirm `address_key` and the visible listing id are stable** for unchanged listings. If the listing id rotates between pulls → confirms why address_key (not id) is the identity.

- [ ] **Step 3: Write + commit the contract doc** (this is the Phase-0 gate). It must contain: reachability verdict, the per-category query contract, the status taxonomy, the Pulled-visibility verdict, the card field→column map with selectors, and the address-key rule. Keep it name-clean (Source A / Source B; no host names — those live in the secret).

```bash
git add docs/handoff/2026-06-2X-listing-lifecycle-source-contract.md SESSION_LOG.md
git commit -F <msg-file>   # "docs(lifecycle): Phase-0 source contract — category queries, Pulled-visibility, field map"
```

---

## PHASE 1 — State engine

### Task 1.1: Lifecycle tables (migration)

**Files:**
- Create: `migrations/2026XXXX_listing_lifecycle.sql`
- Test: `ingest/tests/pipelines/listing_lifecycle/test_migration_smoke.py`

**Interfaces:**
- Produces: `data_lake.listing_state` (one row per property, MERGE on `(source_name, address_key)`) and `data_lake.listing_transitions` (one row per state change, append-only).

- [ ] **Step 1: Write the DDL (idempotent, wide columns, ODD-empty-tolerant).**

```sql
-- migrations/2026XXXX_listing_lifecycle.sql — listing lifecycle state machine.
-- Identity is the ADDRESS (address_key), never the rotating listing id. Capture wide, slice late.
CREATE TABLE IF NOT EXISTS data_lake.listing_state (
  source_name     text NOT NULL DEFAULT 'lifecycle_seed',  -- neutral; never a vendor/board name
  address_key     text NOT NULL,                           -- normalized street + zip (Task 1.2)
  state           text NOT NULL,                           -- new|active|pending|under_contract|contingent|coming_soon|sold|pulled|back_on_market
  listing_id      text,                                    -- current source listing id (may rotate on relist)
  list_price      bigint,
  list_suffix     text,                                    -- per-period token => this is a lease, not a sale
  sale_or_rent    text NOT NULL DEFAULT 'sale',            -- 'sale' | 'rent' (suffix/price-floor derived)
  beds            numeric,
  baths           numeric,
  sqft            integer,
  lot_acres       numeric,
  property_type   text,                                    -- single_family|condo|townhouse|land (column, NOT a lane)
  zip_code        text,                                    -- ZIP gate G1: site address only
  county          text,
  city            text,
  subdivision     text,
  brokerage       text,
  listed_date     date,
  days_on_market  integer,
  days_in_state   integer,
  first_seen      timestamptz NOT NULL DEFAULT now(),
  last_seen       timestamptz NOT NULL DEFAULT now(),
  scraped_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_name, address_key)
);

CREATE TABLE IF NOT EXISTS data_lake.listing_transitions (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_name         text NOT NULL DEFAULT 'lifecycle_seed',
  address_key         text NOT NULL,
  from_state          text,                                -- null on first appearance (=> 'new')
  to_state            text NOT NULL,
  at                  date NOT NULL,
  listing_id          text,
  price               bigint,
  price_delta         bigint,                              -- vs prior state's price (cut/raise)
  days_in_prev_state  integer,
  scraped_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_listing_transitions_addr ON data_lake.listing_transitions (address_key, at);
CREATE INDEX IF NOT EXISTS ix_listing_state_zip ON data_lake.listing_state (zip_code, state);

GRANT SELECT ON ALL TABLES IN SCHEMA data_lake TO service_role;
NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Apply via Bun.SQL** (psql is NOT installed on this box — see memory `reference_run-migrations-via-bun-sql`).

Run: a one-off `new Bun.SQL(<conn from .dlt/secrets.toml>?sslmode=require)` that executes the file, then `SELECT count(*) FROM data_lake.listing_state` (expect 0) + `\d`-equivalent column check.
Expected: both tables exist, 0 rows, PostgREST reloads.

- [ ] **Step 3: Smoke test the shape.**

```python
def test_tables_exist_and_empty(pg):
    assert pg.scalar("SELECT count(*) FROM data_lake.listing_state") == 0
    cols = pg.cols("data_lake", "listing_state")
    assert {"address_key", "state", "property_type", "sale_or_rent", "zip_code"} <= cols
```

- [ ] **Step 4: Commit** (`git add migrations/2026XXXX_listing_lifecycle.sql ingest/tests/... SESSION_LOG.md`).

### Task 1.2: `address_key` normalizer (the relisting identity)

**Files:**
- Create: `ingest/pipelines/listing_lifecycle/address_key.py`
- Test: `ingest/tests/pipelines/listing_lifecycle/test_address_key.py`

**Interfaces:**
- Produces: `address_key(street: str, zip_code: str) -> str` — deterministic, collision-resistant within a ZIP, stable across relists.

- [ ] **Step 1: Write the failing test** (relist-stability + unit-preservation + the spec's real example).

```python
from ingest.pipelines.listing_lifecycle.address_key import address_key

def test_relist_same_address_same_key():
    # 11145 2nd Ave under two listing ids must collapse to one property (spec finding #3).
    assert address_key("11145 2nd Ave", "33971") == address_key("11145 2nd Avenue", "33971")

def test_unit_is_part_of_condo_identity():
    a = address_key("3006 Caring Way Unit 301", "33990")
    b = address_key("3006 Caring Way Unit 414", "33990")
    assert a != b and "UNIT301" in a

def test_case_and_punctuation_insensitive():
    assert address_key("14150 OSTROM AVE.", "33971") == address_key("14150 ostrom ave", "33971")
```

- [ ] **Step 2: Run it — expect ImportError/FAIL.**
Run: `python -m pytest ingest/tests/pipelines/listing_lifecycle/test_address_key.py -v`

- [ ] **Step 3: Implement the normalizer.**

```python
"""address_key — the property identity. A relisting gets a new listing id; we key on the
normalized street address + ZIP so a relist reads as two events on one property (spec finding #3)."""
import re

_SUFFIX = {
    "AVENUE": "AVE", "STREET": "ST", "BOULEVARD": "BLVD", "DRIVE": "DR", "ROAD": "RD",
    "LANE": "LN", "COURT": "CT", "PLACE": "PL", "TERRACE": "TER", "CIRCLE": "CIR",
    "PARKWAY": "PKWY", "HIGHWAY": "HWY", "TRAIL": "TRL", "WAY": "WAY",
}
_UNIT = re.compile(r"\b(?:UNIT|APT|APARTMENT|STE|SUITE|#)\s*([A-Z0-9-]+)", re.I)

def address_key(street: str, zip_code: str) -> str:
    s = (street or "").upper()
    unit = ""
    m = _UNIT.search(s)
    if m:
        unit = "UNIT" + re.sub(r"[^A-Z0-9]", "", m.group(1))
        s = _UNIT.sub("", s)
    s = re.sub(r"[^A-Z0-9 ]", " ", s)              # drop punctuation
    toks = [_SUFFIX.get(t, t) for t in s.split()]  # normalize street suffixes
    core = "".join(toks)
    z = re.sub(r"[^0-9]", "", zip_code or "")[:5]
    return f"{core}{unit}:{z}"
```

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit.**

> **Open risk (note in contract doc, do not block):** if the collision/miss rate is high on real data, add a geocode-backed fallback. Start with this string normalizer; measure on the first real scan.

### Task 1.3: Category-scan extractor (crawl4ai HTTP)

**Files:**
- Create: `ingest/pipelines/listing_lifecycle/extract.py`
- Create: `ingest/tests/pipelines/listing_lifecycle/fixtures/category_pending.html` (a saved real category page)
- Test: `ingest/tests/pipelines/listing_lifecycle/test_extract.py`

**Interfaces:**
- Consumes: the Task 0.2 category-query contract + Task 0.3 field map (read them from the committed contract doc).
- Produces: `scan_category(county: str, state: str) -> list[dict]` — every card on the category as a wide dict (`{address, zip_code, city, county, state, list_price, list_suffix, beds, baths, sqft, lot_acres, property_type, subdivision, brokerage, listing_id, listed_date, days_on_market}`); and `SWFL_COUNTIES`, `LIFECYCLE_STATES`. Uses crawl4ai **HTTP strategy** + backing JSON if Task 0.2 found one; natural-exhaustion pagination (walk `?pg=N` / `pageNumber` until a no-new-cards page — NEVER a fixed cap, Bible §0.3 no-silent-caps).

- [ ] **Step 1: Write the failing test against the saved fixture** (parse the real HTML offline — no network in tests).

```python
from ingest.pipelines.listing_lifecycle.extract import parse_cards

def test_parse_cards_extracts_wide_fields(pending_html):
    cards = parse_cards(pending_html, state="pending", county="Lee")
    c = cards[0]
    assert c["state"] == "pending"
    assert c["zip_code"] and c["list_price"] and c["address"]
    assert "beds" in c and "sqft" in c and "property_type" in c
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement `parse_cards` + `scan_category`.** Mirror the existing HTTP-strategy fetch in `ingest/pipelines/active_listings/extract.py` (same `AsyncHTTPCrawlerStrategy` + `HTTPCrawlerConfig`, same `_text(a, sel)` card-field helper). `parse_cards` reads the status badge into `state`, applies the existing land/residential + rent-suffix/price-floor classification (reuse the rules from `active_listings/distill.py`: `list_suffix` per-period token ⇒ rent; residential `< $50k` ⇒ rent backstop; land never reclassified), derives `property_type`, and parses `zip_code` from the listing URL/address (ZIP gate G1). `scan_category` walks pages until natural exhaustion and returns the union.

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit.**

### Task 1.4: Transition engine (pure diff, merge-not-replace)

**Files:**
- Create: `ingest/pipelines/listing_lifecycle/transitions.py`
- Test: `ingest/tests/pipelines/listing_lifecycle/test_transitions.py`

**Interfaces:**
- Consumes: `prior: dict[address_key, StateRow]` (current `listing_state`) + `scanned: dict[address_key, ScanRow]` (today's category scan) + `pulled_resolution` (the Task 0.2 verdict).
- Produces: `diff_states(prior, scanned, today, pulled_visible) -> tuple[list[StateUpsert], list[TransitionRow]]` — pure, no DB, no I/O. The upserts MERGE (never delete); transitions are the durable history.

- [ ] **Step 1: Write the failing tests — every signal-bearing transition.**

```python
from ingest.pipelines.listing_lifecycle.transitions import diff_states

def test_new_listing_emits_new_transition():
    ups, trans = diff_states({}, {"A:33901": row(state="active", price=400000)}, "2026-07-01", True)
    assert trans[0]["from_state"] is None and trans[0]["to_state"] == "new"

def test_active_to_pending_is_absorption():
    prior = {"A:33901": srow(state="active", price=400000)}
    scan = {"A:33901": row(state="pending", price=400000)}
    _, trans = diff_states(prior, scan, "2026-07-01", True)
    assert (trans[0]["from_state"], trans[0]["to_state"]) == ("active", "pending")

def test_pending_to_active_is_deal_collapse():
    prior = {"A:33901": srow(state="pending", price=400000)}
    scan = {"A:33901": row(state="active", price=400000)}
    _, trans = diff_states(prior, scan, "2026-07-01", True)
    assert trans[0]["to_state"] in ("active", "back_on_market")

def test_price_cut_within_active_records_delta():
    prior = {"A:33901": srow(state="active", price=400000)}
    scan = {"A:33901": row(state="active", price=380000)}
    _, trans = diff_states(prior, scan, "2026-07-01", True)
    assert trans[0]["price_delta"] == -20000

def test_active_disappears_with_pulled_visible_false_is_pulled():
    prior = {"A:33901": srow(state="active", price=400000)}
    _, trans = diff_states(prior, {}, "2026-07-01", pulled_visible=False)
    assert trans[0]["to_state"] == "pulled"

def test_unchanged_state_emits_no_transition_only_touches_last_seen():
    prior = {"A:33901": srow(state="active", price=400000)}
    ups, trans = diff_states(prior, {"A:33901": row(state="active", price=400000)}, "2026-07-01", True)
    assert trans == [] and ups[0]["last_seen_touch"] is True
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement `diff_states`** — for each `address_key` in the union: appeared (not in prior) ⇒ `new`; same state ⇒ touch `last_seen`, record `price_delta` if price moved within Active; different state ⇒ emit `(from, to)` transition with `days_in_prev_state` and `price_delta`; in prior-Active but in NO scanned category ⇒ if `pulled_visible is False` emit `→ pulled` (by elimination), else leave unchanged (it'll appear in its real category). **Never delete a state row** — a change is a move, not a discard.

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit.**

### Task 1.5: Coverage guard (no transitions from an incomplete scan)

**Files:**
- Create: `ingest/pipelines/listing_lifecycle/coverage_guard.py`
- Test: `ingest/tests/pipelines/listing_lifecycle/test_coverage_guard.py`

**Interfaces:**
- Produces: `category_is_trustworthy(scan_result, last_trusted_count, county_total) -> tuple[bool, str]` — gate each category's diff on (1) **natural exhaustion** (the walk ended on a no-new page, not an early 403), (2) **self-referential stability** (today's count within a few percent of our last *trusted* scan), (3) **baseline seed** (the page-printed county total as a ±10% sanity floor). A failing category is **skipped for the day** (no transitions emitted), logged loud.

- [ ] **Step 1: Write the failing test.**

```python
from ingest.pipelines.listing_lifecycle.coverage_guard import category_is_trustworthy

def test_early_403_is_untrustworthy():
    ok, why = category_is_trustworthy({"exhausted": False, "count": 12, "last_status": 403}, 1500, 1600)
    assert ok is False and "403" in why

def test_mass_drop_vs_last_trusted_is_untrustworthy():
    ok, _ = category_is_trustworthy({"exhausted": True, "count": 200, "last_status": 200}, 1500, 1600)
    assert ok is False  # 200 vs 1500 trusted = a truncated pull, not real movement

def test_stable_count_natural_exhaustion_passes():
    ok, _ = category_is_trustworthy({"exhausted": True, "count": 1490, "last_status": 200}, 1500, 1600)
    assert ok is True
```

- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** the three-gate check (drop-threshold e.g. >40% below last-trusted ⇒ fail; not-exhausted or last_status≠200 ⇒ fail; first-ever scan with no last_trusted ⇒ seed-only, pass but mark `seeded`).
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit.**

### Task 1.6: Pipeline orchestrator + `--dry-run`

**Files:**
- Create: `ingest/pipelines/listing_lifecycle/pipeline.py`, `ingest/pipelines/listing_lifecycle/__init__.py`
- Create: `ingest/pipelines/listing_lifecycle/distill.py` (upsert_state + append_transitions + current state loader)
- Test: `ingest/tests/pipelines/listing_lifecycle/test_pipeline_dryrun.py`

**Interfaces:**
- Consumes: `scan_category` (1.3), `diff_states` (1.4), `category_is_trustworthy` (1.5), `address_key` (1.2).
- Produces: `python -m ingest.pipelines.listing_lifecycle.pipeline [--dry-run] [--county NAME]`. Loads current `listing_state`; for each county scans the **moving** categories (New / Pending / Sold / Back-on-market / temporarily-off-market if visible); guards each; diffs; **per-county idempotent** upsert of state + append of transitions; fails loud only on total-empty.

- [ ] **Step 1: Write a `--dry-run` test** (mirror the active_listings dry-run shape: extract + diff, no DB write).

```python
def test_dry_run_emits_transitions_without_writing(monkeypatch, fake_scan, fake_prior):
    # fake_scan returns a fixture category; assert transitions computed, upsert_state NOT called.
    ...
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement `pipeline.run`** mirroring `ingest/pipelines/active_listings/pipeline.py`: UTF-8 stdout reconfig; `--county` filter; per-county loop; **per-category coverage guard before diffing** (skip-and-log on fail); `diff_states` → `upsert_rows`/`append_transitions` per county (merge, so a late-county 403 keeps earlier counties); `assert_min_rows`/`assert_vs_baseline` from `ingest.lib.guards` as end-of-run alerts; `sys.exit(1)` only if EVERY county+category returned nothing (fail-loud-on-empty, never silent fake-green).

- [ ] **Step 4: Run — expect PASS.** Then a live `--dry-run` against Source B from home IP: `python -m ingest.pipelines.listing_lifecycle.pipeline --dry-run --county Lee` — eyeball the transitions.
- [ ] **Step 5: Commit.**

### Task 1.7: Parked cron + cadence entry (graduates after WAF proof)

**Files:**
- Create: `.github/workflows/listing-lifecycle-daily.yml`
- Modify: `ingest/cadence_registry.yaml` (add under `not_yet_running:`)

**Interfaces:**
- Produces: a manual-dispatch GHA workflow (NOT scheduled until the runner IP is WAF-proven) + a parked cadence entry (probe-excluded, so no false STALE alerts while parked).

- [ ] **Step 1: Add the GHA wrapper** — `workflow_dispatch` only (no `schedule:` block yet), runs the pipeline with the `LISTING_LIFECYCLE_BASE_URL` secret in `env:`, plus a `--dry-run` job. Pattern: mirror `.github/workflows/active-listings-daily.yml`.

- [ ] **Step 2: Add the parked cadence entry.**

```yaml
not_yet_running:
  # ── Listing lifecycle state machine — parked until runner-IP WAF-proven ──────
  # Daily category scan (small moving categories), not a full-market re-pull.
  # Graduation: after ≥3 green scheduled crons from the runner IP, add a schedule:
  #   block to listing-lifecycle-daily.yml AND move this block up to pipelines:
  #   with freshness_table + expected_rows_min. Until then it is probe-excluded.
  - name: listing_lifecycle
    lane: tier-2
    cadence_days: 1
    tolerance_multiplier: 3.0
    freshness_table: data_lake.listing_transitions
    freshness_column: scraped_at
    source_name: lifecycle_seed
    # Pipeline: ingest/pipelines/listing_lifecycle/. Source contract: docs/handoff/...-source-contract.md.
    # Consumer brain: refinery/packs/listing-lifecycle-swfl.mts.
```

- [ ] **Step 3: Run the freshness probe `--dry-run`** to confirm the parked entry is excluded from active probing (no STALE alert).
- [ ] **Step 4: Run the GHA workflow manually** (`gh workflow run listing-lifecycle-daily.yml`); confirm rows land from the runner IP with no 403. Watch ≥3 runs before graduating (mirror the active-listings "≥3 green runs" bar).
- [ ] **Step 5: Commit** (parked state; graduation is a later, separate commit once proven).

---

## PHASE 2 — The brain (`listing-lifecycle-swfl`)

### Task 2.1: Aggregate-at-source view + source connector

**Files:**
- Create: `docs/sql/2026XXXX_listing_lifecycle_state_view.sql` (apply via Bun.SQL)
- Create: `refinery/sources/listing-lifecycle-source.mts`
- Create: `refinery/__fixtures__/listing-lifecycle.sample.json`
- Test: `refinery/sources/listing-lifecycle-source.test.mts`

**Interfaces:**
- Produces: `listingLifecycleSource: SourceConnector` returning ONE summary fragment with `{ kind, region, by_county, by_zip, transitions_period, latest_scraped_at, source_url }`, computed in SQL (GROUPING SETS), NOT row-hauled. Mirror `refinery/sources/active-listings-residential-source.mts` exactly (fixture vs `fetchLiveRows`, `summarize`, `citationMeta`, `buildSourceCitationUrl`).

- [ ] **Step 1: Write the view** — `listing_lifecycle_state_stats`: per (region / county / ZIP) GROUPING SETS, `count(*) FILTER (WHERE state='active')` … per state, plus a transitions rollup (counts of `active→pending`, `pending→active` (deal-collapse), `active→pulled` (withdrawal), `pulled→active` (relist), price-cuts) over a trailing window, and `max(scraped_at)` as the as-of. Slice price/sqft/zip/type **in this SQL** (capture-wide-slice-late) — never in the brain.

- [ ] **Step 2: Write the failing source test** (fixture mode emits one well-formed summary fragment).
- [ ] **Step 3: Implement the connector** (copy active-listings-residential-source.mts; swap view name, row type, and the transitions fields; `source: "listing lifecycle (crawl4ai scan)"`).
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit.**

### Task 2.2: The `PackDefinition` + catalog mirror

**Files:**
- Create: `refinery/packs/listing-lifecycle-swfl.mts`
- Modify: `refinery/packs/catalog.mts` (add the mirror entry — Gate 5)
- Modify: `refinery/packs/index.mts` (register the pack)
- Test: `refinery/packs/listing-lifecycle-swfl.test.mts`

**Interfaces:**
- Consumes: `listingLifecycleSource` + its summary type.
- Produces: `listingLifecycleSwfl: PackDefinition` — tier-1 reporter (`skipSynthesisAgent`/`skipTriageAgent`, `input_brains: []`), `domain: "real-estate"`. `key_metrics`: per-state counts (new/active/pending/sold/pulled) + period transition counts (withdrawals, relistings, **deal-collapses**, absorptions, price-cuts) + medians (DOM-at-pending), each cited with as-of MM/DD/YYYY. `detail_tables` (grain `"address"`): current movers — address, state, price, DOM, days-in-state, # relistings, sale↔rent flag — scrub-exempt lookup rows. `grain_boundary.not_available`: actual sold *prices* (state captured, close price is the later records lane). Empty-tolerant (ODD): no rows ⇒ neutral conclusion, not a throw.

- [ ] **Step 1: Write the failing pack test** (fixture summary ⇒ expected key_metrics + a deal-collapse count + a populated address detail_table; empty summary ⇒ neutral, no throw). Mirror `refinery/packs/active-listings-swfl.test.mts`.
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement the pack** (copy the structure of `active-listings-swfl.mts`: `outputProducer`, `corpusSummary`, `detail_tables`, `grain_boundary`, neutral-by-construction direction). **Name-clean** — no source/MLS/IDX strings in any caveat or scope (Global Constraints). Add the matching `catalog.mts` entry with an identical `scope` string (Gate 5 mirror).
- [ ] **Step 4: Run the pack test + the catalog mirror.**

Run: `bun test refinery/packs/listing-lifecycle-swfl.test.mts && bun test refinery/packs/catalog.test.mts`
Expected: all pass (catalog scope must equal pack scope verbatim).

- [ ] **Step 5: Commit.**

### Task 2.3: Vocab slugs + master wiring + gates green

**Files:**
- Modify: `brain-vocabulary.json` (register every emittable slug, incl. conditionals)
- Modify: master wiring so `sources[]` mirrors `input_brains[]` (landmine `project_master-sources-inputbrains-gap`)
- Test: `refinery/lib/corridor-aliases.test.mts` + `check-vocab-coverage`

**Interfaces:**
- Produces: a brain that passes the orphan linter (every metric slug the pack can emit, including the conditional `pending_to_active_deal_collapse` / `active_to_pulled_withdrawal` / `price_cut_count` ones, is registered) and is reachable from master.

- [ ] **Step 1: List every slug the pack can emit** (run the pack against the fixture, collect `key_metrics[].metric` + any conditional ones the branches produce).
- [ ] **Step 2: Register them in `brain-vocabulary.json`** (same commit as the pack — orphan linter aborts the GHA rebuild in the gap, memory `feedback_ship-contract-together`).
- [ ] **Step 3: Run the gates.**

Run: `bun test refinery/lib/corridor-aliases.test.mts && bun refinery/tools/check-vocab-coverage.mts --all`
Expected: 0 orphan slugs.

- [ ] **Step 4: Wire into master + verify the sources/input_brains mirror.**

Run: `bun run refinery -- master --target-only`
Expected: `listing-lifecycle-swfl` appears in both `sources[]` and `input_brains[]` (never sources-only — that's "fetched-never-built").

- [ ] **Step 5: Commit** (`refinery/packs/**` change ⇒ Gate 5 fires on push: catalog mirror + pack `bun:test` + each pack's test).

---

## Phase 3 — Deferred (NOT in this plan)

- **Owner-contact lead-gen.** Needs a skip-trace / owner-data lane we don't have. We hold the address only. Explicitly out of scope until a Phase-3 decision.
- **Sold *price* enrichment.** The sold *state* is captured day-one (Phase 1); the actual close price is a **separate later lane** (public county records / a transaction feed) joined onto the sold-state transition. Not blocking; the sold-state row is the hook it joins to.

---

## Self-Review

**Spec coverage (`docs/superpowers/specs/2026-06-26-delisting-events-swfl-design.md`):**
- Lifecycle state machine + transitions-are-the-signal → Tasks 1.1 (tables), 1.4 (engine), 2.2 (brain metrics). ✓
- Daily category scan, not full re-pull → Tasks 1.3 (scan moving categories), 1.6 (orchestrator). ✓
- Address-key identity → Task 1.2. ✓
- Pulled-visibility open question → Task 0.2 (resolved before build), consumed in 1.4. ✓
- Coverage guard (incomplete scan ≠ mass movement) → Task 1.5. ✓
- Data model (`listing_state` wide + `listing_transitions` durable) → Task 1.1. ✓
- Dimensions: capture-wide-slice-late → wide columns in 1.1, query-time slicing in the 2.1 view. ✓
- Sold STATE now / sold PRICE later → 2.2 grain_boundary + Phase 3. ✓
- The brain (tier-1 reporter, key_metrics + detail_tables, no-invention, [INFERENCE] motivation) → Task 2.2. ✓
- Bible compliance (crawl4ai HTTP, backing-JSON-first, merge-not-replace, fail-loud, natural-exhaustion, parked cron, brain-first gate, ODD) → Tasks 0.1–0.3, 1.3, 1.6, 1.7, 2.1–2.3. ✓
- Phasing 0→1→2, Phase 3 deferred → matches. ✓

**Placeholder scan:** Phase 0 tasks are discovery with concrete probe scripts + a committed contract-doc deliverable (not hand-waving). Phase 1/2 code tasks carry real, runnable code grounded in the existing `active_listings` pipeline + `active-listings-swfl` pack patterns. Date-stamped filenames are written `2026XXXX` / `2026-06-2X` because the executor stamps the real date at creation (scripts can't call `Date.now()`); that is intentional, not a TODO.

**Type consistency:** `address_key(street, zip)` (1.2) is the key in `listing_state`/`listing_transitions` (1.1), the diff input (1.4), and the pipeline loader (1.6). `diff_states(prior, scanned, today, pulled_visible)` signature is identical in 1.4's tests and 1.6's caller. The `scope` string is defined once in 2.2 and mirrored verbatim into `catalog.mts` (Gate 5) — same discipline that the name-sweep just verified green on the sibling `active-listings-swfl` pack.

**The one cross-task dependency to honor:** Phase 1 does not start until the Phase 0 contract doc is committed. The connector (1.3) reads real category-query params and a real field map from that doc — if Phase 0 reveals the categories are NOT queryable or the runner IP is WAF-blocked, stop and re-plan the fetch strategy (proxy / browser-strategy fallback) before building 1.3–1.6.
