# Content-freshness guards on the merge pipelines (Operation July task 18)

- **Slug:** `content-freshness-guards` · **Check:** `content_freshness_guards_live_verify`
- **Status:** design approved (operator, 2026-07-05) — phase 1 = 8 small-lag sources
- **Owner:** ingest-engineer (Opus build)

## Problem (verified against live code 2026-07-05, not the autopsy)

15 pipelines write with `write_disposition="merge"`. Every run stamps a fresh `data_lake._dlt_loads`
row (LOAD-fresh) with **nothing asserting the CONTENT advanced**. Three concrete holes found live:

1. **`redfin_lee` + `redfin_collier`** — `resources.py`: `if not rows: return 0`. An empty pull (Redfin
   renames the region label or moves the URL) → **exit 0, cron GREEN, zero fresh data**, stale numbers
   narrated downstream. (both files confirmed: `redfin_lee/resources.py:162-165`, `redfin_collier/resources.py:156-159`)
2. **`lee_permits`** — sat 18 days stale behind 3 green cron runs. Nothing checks that the newest
   `issued_date` advanced; `raise_on_failed_jobs()` only catches dlt *job* failure, not stalled content.
3. **The daily probe** (`ingest/scripts/check_freshness.py`) reads `_dlt_loads.inserted_at` (LOAD time)
   for dlt entries — so it is fooled by a re-merge of stale content too. (Not fixed here — see Non-goals.)

## Research (RULE 0.4, in-session crawl4ai 2026-07-05, dlt v1.28.1 docs)

- dlt exposes `pipeline.last_trace.last_normalize_info.row_counts` (native per-table row counts) and
  `load_info` job statuses / `raise_on_failed_jobs()`.
- dlt **schema-contracts** govern column/type *evolution* only (freeze/evolve/discard on new
  columns/tables/data-types) — **there is no native content-date freshness hook.**
- Therefore the idiomatic pattern is a **Python-side assertion**: compute `MAX(content_date)` from the
  parsed batch and `raise` before/around the write. A raised exception exits the pipeline script
  non-zero → cron red, exactly like the `raise_on_failed_jobs()` the pipelines already rely on.

## Mechanism — absolute content-age (advisor-vetted)

New guard in `ingest/lib/guards.py`:

```python
class ContentStaleError(RuntimeError): ...   # own greppable class, sibling of VolumeGuardError

def assert_content_fresh(newest: date | None, max_age_days: int, label: str = "") -> None:
    """Raise ContentStaleError if the freshest content date is missing or older than max_age_days.
    newest = MAX(content_date) across the freshly-fetched batch (e.g. period_end, issued_date, month).
    Absolute age vs today — the same proven shape as check_freshness.py's age_days > threshold."""
```

**The gating threshold is NOT the probe's `cadence×tolerance`.** That is deliberately loose for
observability. lee_permits proves it: probe tolerance is 7×3 = **21d**, but the bug was an **18d** stall —
reusing 21d would miss the very bug. Each phase-1 pipeline gets its own tighter `max_age_days`, set from
*content lag + one cadence + buffer*, with a one-line justification at the call site.

## Scope — phase 1 (7 content-guarded merge sources)

Content lands within ~weeks of publish, so an absolute-age gate is safe. Per-pipeline columns and
gating thresholds confirmed by probing each resource (as-built 2026-07-05):

| Pipeline | content-date col | `max_age_days` | basis |
| --- | --- | --- | --- |
| lee_permits | `issued_date` (post-merge MAX) | 14 | weekly, permits filed ~daily; trips the 18d bug; tighter than the 21d probe |
| redfin_lee | `period_end` | 55 | monthly tracker; tighter than the 62d probe |
| redfin_collier | `period_end` | 55 | monthly tracker |
| zhvi_swfl | `period_end` | 55 | Zillow monthly ZHVI; also closes a missing raise_on_failed_jobs |
| zori_swfl | `period_end` | 55 | Zillow monthly ZORI |
| tier_divergence_swfl | `period_end` | 55 | Zillow tier-split monthly |
| collier_permits | `date_issued` | 75 | monthly prior-month XLSX; content ~1mo behind + cadence |

### news_swfl — EXCLUDED (RULE 0.5 finding, 2026-07-05)

The advisor's phase-1 list included news_swfl, but probing `news_swfl/fetcher.py:66` shows every article
is normalized with `published_date=None` — news captures **no content date** (the registry tracks its
freshness via `scraped_at` = load time). An absolute content-age guard on `published_date` would see
`newest=None` and **fail every run.** News staleness needs a *novelty* check (new `article_url`s appear),
a different mechanism — deferred to a follow-up. Exactly the class RULE 0.5 exists to catch: the plan's
premise didn't survive contact with the code.

## Changes

1. `ingest/lib/guards.py`: add `ContentStaleError` + `assert_content_fresh` (+ tests in
   `ingest/tests/lib/test_guards.py`).
2. `redfin_lee/resources.py` + `redfin_collier/resources.py`: empty `return 0` → `raise VolumeGuardError`
   (volume hole; a 0-row pull is a real failure, not a green no-op).
3. Wire `assert_content_fresh` into the 7 phase-1 pipelines at their pre-/post-write point, each with its
   content-date column and justified threshold.
4. `.github/scripts/classify-cron-failure.mjs` (+ test): a `ContentStaleError` rule → class
   `CONTENT_STALE`, action "content stale → investigate source/scraper, **do not retry**". (Caveat:
   ingest crons don't route through the classifier yet — this is future-proofing on the class I already
   own from task 19.)

## Non-goals (deferred, on purpose)

- **Daily probe content-date complement** — teaching `check_freshness.py` to read a content column for
  dlt entries is a good phase-2 add, but the probe **stays non-gating** (build-03 "always exit 0"
  invariant). Only the in-pipeline guard trips red.
- **Big-lag batch sources** (bls_laus, bls_qcew, bls_oews, census_cbp/acs, fhfa, leepa, collier_parcels,
  noaa_ghcn_rainfall) — phase 2; their inherent multi-month content lag needs the crawl4ai vendor-lag
  research (QCEW ~2-quarter lag etc.) to avoid false-trips on legitimately-lagged fresh data.
- **ZHVI narration cadence** (home-values / investor-zip narrate ZHVI ~10-16d after it lands) — a
  brain-side TTL, orthogonal to the ingest guard; split to its own build.
- **news_swfl novelty guard** — news has no content date (see scope), so its staleness detection needs a
  new-`article_url` novelty check rather than an age guard. BUILT 2026-07-05 (operator directive) — see
  `2026-07-05-news-novelty-guard-design.md`: first-seen carried forward pre-merge, then
  `assert_content_fresh` reused as a 7d novelty gate.

## Done when (live proof)

A deliberately stale/empty load is **blocked** on at least one phase-1 pipeline: re-run `lee_permits`
(or a stale fixture) → `assert_content_fresh` raises `ContentStaleError` → non-zero exit → cron red
instead of green-but-0-fresh. Proven offline by a deterministic test; the live cron-red is the
operator-run `content_freshness_guards_live_verify` check.
