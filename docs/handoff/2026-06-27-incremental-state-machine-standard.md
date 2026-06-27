# Handoff — the incremental state-machine standard (persist once, maintain deltas, brain reads the DB)

**For:** anyone building or auditing a brain's ingest. **Status of the reference impl:**
`listing-lifecycle` (Source B — origin lives ONLY in the `LISTING_LIFECYCLE_BASE_URL` secret, never
the repo). The full set was seeded once and the **seeded brain is live on the site** (10,459
listings, as of 2026-06-27 — it reads the persisted aggregate view via `/api/b` + MCP, confirmed).
The **daily delta-maintenance loop is NOT yet proven in production** — one local dry-run, and the
first cron attempt crashed (see §7). This standard generalizes the *pattern*; the loop itself is
still being hardened on the reference impl.

**The one-line rule:** a brain's data source is **ingested in full exactly once (the seed), then kept
current by writing only what changed** — and the brain reads the *persistent database*, never the
website/source live. We do **not** re-pull and re-store the whole dataset every run.

---

## 1. The two ways

**The stupid way (what we're killing).** Every run, re-scrape/re-fetch the *entire* current-state
dataset and replace the table. The old `active_listings` (Source A) did this: a full daily re-scrape
of the whole listings market. It got **capped** (the source stops paginating past ~3,000), went
**stale**, was **expensive** (hundreds of page fetches every day), and **fragile** (one bad run = a
wrong full table). Re-pulling everything to learn that ~14 listings changed is the waste.

**The smart way (this standard).** A persistent state table is the living home of the dataset:
- **Seed once** — one full pull loads every row into the table (e.g. `data_lake.listing_state`).
- **Maintain deltas** — each run detects changes and writes *only* those: a new item is one INSERT,
  a changed item is one UPDATE, a departed item MOVES to a holding state (never deleted). The ~99%
  that didn't change are never rewritten.
- **The table is always complete and current** because it persists between runs and is corrected in
  place. Completeness comes from **persistence**, not from re-ingestion.
- **The brain reads the database**, not the source: one aggregate-at-source view
  (`GROUP BY` county/zip) over the persistent table. The brain never touches the website.

Mental model: an **inventory ledger**. Count the warehouse once; thereafter record only what comes
in and what goes out. The ledger is always complete — you never recount the whole warehouse.

---

## 2. The mechanics (the parts that make it work)

1. **Persistent state table, MERGE on a stable natural key** — never a daily REPLACE. Key on
   something stable across runs (we key listings on a normalized `address_key`, not the source's MLS
   id, so a relist under a new id still matches). `first_seen` set once; `last_seen`/`scraped_at`
   refreshed. Reference: `data_lake.listing_state`, `distill.upsert_state` (`INSERT … ON CONFLICT … DO UPDATE`).
2. **Seed = run #1.** First run sees an empty prior and loads everything, stamped so its day-0 rows
   don't read as "all new" (our `is_seed` flag → `seed=true` transitions, excluded from flow counts).
3. **Delta detection = load-ours-first, then diff.** Load the current state into memory *before*
   touching the source; diff the scan against it (`union(prior, scanned)`): in-scan-not-ours → new;
   ours-not-in-scan → departed; in-both → update if changed. Reference: `transitions.diff_states`.
4. **Coverage guard before any "departed" inference.** "It's gone" is only trustworthy from a
   **complete** read — an item you didn't reach isn't gone, just unseen. Gate the departed→holding
   move on a verified-complete scan (we compare against the source's own printed total). A partial
   pull writes new/changed but marks nothing departed. Reference: `coverage_guard.scan_is_complete`.
5. **An event log (optional but powerful).** Append every change as an immutable row
   (`from_state → to_state`, date, price delta), idempotent on the daily-grain key. The transitions
   *are* the signal (new / price-cut / departed / relisted). Reference: `data_lake.listing_transitions`.
6. **Aggregate-at-source view the brain reads.** `GROUP BY GROUPING SETS` over the table → tens of
   rows, not the raw 10k. Brain connector swaps to it with a one-line view-name change. Reference:
   `data_lake.listing_active_stats` → `active-listings-residential-source.mts`.
7. **Cadence — a COMPLETE read every run, delta-write. This is the standard, full stop.** Read the
   whole current set each run — that is the *only* way to detect departures (an item you didn't reach
   isn't gone, just unseen) — and write only the deltas. **Nothing here costs money:** GHA is free
   (public repo), the scrape is plain HTTP, a pure reporter makes no LLM calls, the full read runs
   from home IP (no proxy), DB writes are trivial. So there is no spend to optimize away — the
   complete read is simply correct. "Cheap" already comes for free from the **delta-write** (the ~99%
   unchanged rows are never rewritten) and from **not** fetching a per-item detail page. The one
   non-money cost is **WAF/block risk** from request volume — mitigated by a per-request delay
   (≥1.5s) + per-county staggering, and proven low (the seed's full ~370-page scan ran 0×403 from
   home IP). *Contingency only:* if the source ever starts throttling at daily-full-scan volume, a
   cheap shallow daily scan (newest-first, stop on known) + a weekly full reconcile cuts request
   volume — at the cost of departed items staying counted as active until the weekly pass. Adopt it
   *only* under that block pressure, never as a default.

---

## 3. WHEN this applies — and when REPLACE/APPEND is already correct (read this before "migrating" anything)

This pattern is for **one source shape**. Forcing it elsewhere creates bugs. Use the test:

**Use the incremental state machine when ALL of these hold:**
- The source exposes a **current state** (what's live *now*), with **no change-feed** (no "what
  changed since" API) — so the only way to learn a change is to re-read the set.
- A full re-read is **expensive** (large, paginated, rate-limited/WAF'd, or pagination-capped).
- You care about **per-item lifecycle** (new / changed / departed / returned) — the transitions are a
  signal you want.
- → Examples that fit: scraped listings, a scraped "current open cases" registry, any large scraped
  current-state inventory with no diff endpoint.

**Do NOT use it — REPLACE or APPEND is already correct — when:**
- **Periodically published vintages** (the source hands you the *entire* new dataset each period):
  Census ACS/CBP, BLS LAUS/QCEW/OEWS/PPI, FRED series, FHFA, FDOT AADT, Zillow ZHVI/ZORI, Redfin
  market trackers, realtor.com market-heat, NOAA/USGS/storm, county parcel rolls. **REPLACE the
  vintage.** There is no per-item lifecycle to track and re-pull cost is low/bounded. A state machine
  here is pure overhead and risk.
- **Append-only event streams** (each run yields *new* records, you never re-evaluate old ones):
  news, city-pulse, building permits as issued, DBPR press releases / public notices / SIRS filings,
  quarterly broker PDFs, airport/TDT/sales-tax monthly. **APPEND.** They already don't re-ingest
  everything.
- **Small/bounded current-state scrapes** where a full re-pull is trivially cheap (a few items):
  technically fits the pattern but not worth the machinery — re-pull is fine. (e.g. the CRE
  `crexi`/`brevitas` lease scrapes, ~1–4 items/city.)

**Net:** most of our ~36 brains are *already* doing it right (periodic REPLACE of a published
vintage, or APPEND of an event stream). The "stupid way" is narrow — a **large scraped current-state
source re-pulled in full daily** — and the only clear instance was old Source A `active_listings`,
which `listing-lifecycle` now replaces.

---

## 4. Audit — first-pass classification (confirm `write_disposition` per pipeline before acting)

Basis: `ingest/cadence_registry.yaml` (every pipeline's lane + source) + the pipeline's
`write_disposition`. Classify each, then act only on column **C**.

- **A. Periodic REPLACE of a published vintage — CORRECT, leave alone.** All tier-1-duckdb +
  tier-2-dlt published datasets (Census, BLS, FRED, FHFA, FDOT, Zillow, Redfin, parcels, NOAA/USGS,
  realtor market-heat, FEMA). No change.
- **B. APPEND-only event stream — CORRECT, leave alone.** news, city-pulse(-corridors), lee/collier
  permits, DBPR press/notices/SIRS, swfl-inc, FDLE, RSW airport, FL-DOR TDT/sales-tax, FGCU RERI,
  marketbeat/colliers/MHS PDFs.
- **C. Large scraped current-state, full daily re-pull — MIGRATE.**
  - `active_listings` (Source A) → **in progress**: `listing-lifecycle` is the replacement; retire
    Source A's pipeline only after the lifecycle daily cron is proven (it currently still runs as a
    bridge; the live brain is already swapped to the lifecycle view).
- **D. Marginal (fits the pattern but low value) — defer.** `crexi`/`brevitas` CRE lease scrapes
  (tiny). Migrate only if they grow.

If a future source lands in column **C**, it gets the state-machine treatment from day one — clone
the `listing-lifecycle` shape, don't write a daily full-replace scraper.

---

## 5. Migration recipe (snapshot-replace → incremental, using listing-lifecycle as the template)

1. **State table** keyed on a stable natural key; MERGE-on-conflict, never REPLACE; soft-departure
   (a `holding`/`inactive` state, never DELETE). Migration mirrors `migrations/20260627_listing_lifecycle.sql`.
2. **Seed run** = the existing full pull, stamped `is_seed` so day-0 isn't all-new.
3. **Diff engine** (pure, unit-tested): `load_current_state()` first, then `diff_states(prior, scan)`
   → (upserts, transitions). Mirror `ingest/pipelines/listing_lifecycle/transitions.py` + its tests.
4. **Coverage guard** gating the departed inference on a complete read.
5. **Aggregate-at-source view** with the **same column shape** as the old view, so the brain connector
   swaps with a one-line view-name change (zero brain-logic churn). Reference: `docs/sql/20260627_listing_active_stats.sql`.
6. **Cadence**: parked cron first (`not_yet_running:`), prove ≥3 runs, then schedule a **complete
   read every run + delta-write** (keeps the active count correct daily; nothing here bills, so
   there's no cost to trade against — §2.7). The shallow-scan is a block-pressure contingency only.
   Per `docs/standards/pipeline-freshness.md`.
7. **Retire the old full-replace pipeline** only AFTER the incremental one is proven live.

---

## 6. Antipatterns to kill on sight

- A daily job that re-fetches a large current-state source **and `write_disposition='replace'`** on a
  table a brain reads. (That's the stupid way.)
- DELETE-ing rows that "left" instead of moving them to a holding state (throws away the departure
  signal and any later records-lane resolution).
- Inferring "departed" from a **partial/capped** scan (no coverage guard) — silently turns a scrape
  gap into a fake withdrawal.
- A brain connector that reads raw rows instead of an aggregate-at-source view (hauls 10k rows to
  compute a count — re-derives in TS what SQL does in one pass).
- Keying the state table on the source's volatile id instead of a stable natural key (a relist under
  a new id orphans the old row forever).

---

## 7. Reference files (the worked example)

- Pipeline: `ingest/pipelines/listing_lifecycle/` (`extract.py` band-partition scan, `transitions.py`
  diff engine, `coverage_guard.py`, `distill.py` MERGE/append, `pipeline.py` orchestrator).
- Tables: `migrations/20260627_listing_lifecycle.sql` (`listing_state` + `listing_transitions`).
- View: `docs/sql/20260627_listing_active_stats.sql`.
- Brain wiring: `refinery/sources/active-listings-residential-source.mts` (one-line view swap) +
  `refinery/packs/active-listings-swfl.mts`.
- Cron (parked): `.github/workflows/listing-lifecycle-daily.yml` + `ingest/cadence_registry.yaml`
  (`not_yet_running: listing_lifecycle`).
- Prior handoff (brain-wire + automate): `docs/handoff/2026-06-27-listing-lifecycle-brain-wire-and-automate.md`.

**Open follow-ups on the reference impl (not blockers for this standard):** fix the runner-only
asyncio "event loop is closed" crash (reuse one `AsyncWebCrawler` instead of per-page churn);
implement the daily **complete-read + delta-write** loop and prove ≥3 runs (then decide with the
operator whether to add the cheap shallow-scan optimization, §2.7); add the explicit "re-confirmed
off" stamp on still-departed holding rows; wire the Webshare proxy as a 403-fallback (not always-on).
