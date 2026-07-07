# Pipeline Data Census — live per-pipeline count, confirmed totals, source ceiling, vendor benchmark

**Date:** 2026-07-07
**Repos touched:** `brain-platform` (registry schema) + `swfldatagulf-ops` (new page)
**Operator ask (verbatim intent):** "I want numbers on every fucking thing we bring in. What it's at, what it should be or I was told it was to be, what it is broken down to exactly what it is... I want to know everything there is that we can bring in from that pipeline based on scoping the source... Lined up nicely on an ops page. Categorized by pipeline and grouped with similar pipelines." Plus: "everything that is possible to bring in from that source, even if we don't bring it in," and "start with how many pipelines we have so we know when we are done."

## Problem

Nobody can currently answer, in one place, for a given pipeline: how many rows we hold, whether that matches what we were actually promised (not a heuristic floor), what the source could give us beyond what we ingest, and how that compares to an outside authority's own count where one exists. `/coverage` in `swfldatagulf-ops` already answers a narrower question well (is this pipeline fresh and above a volume floor), but "above 90% of the last observed count" is not "confirmed against the source," and no page shows the source's true ceiling or an external benchmark at all.

## What already exists (do not rebuild)

- `ingest/cadence_registry.yaml` — the one config root, ~85 pipeline entries under `pipelines:` + `not_yet_running:`. Already read live by the ops repo via `rawText()`.
- `swfldatagulf-ops/lib/coverage.ts` + `/coverage` page — live Supabase row counts, `expected_rows_min` floor breach (`LOW_VOLUME`), freshness vs. cadence, year-coverage gaps, and a GRAB/FIX/FIND/ROUTE work order. This machinery (`tableCoverage`, `directTableFreshness`, `tier1Freshness`, `classify()`) is reused, not replaced.
- `swfldatagulf-ops/app/data-inventory/_data.ts` — a **hand-copied static** catalog (ZIP-grain focused). Already drifting from the registry. New work does not touch it and does not use it as a source of truth.
- `expected_rows_min` — a 90%-of-last-observed-count heuristic used only to catch a pipeline silently shrinking. It is **not** the "confirmed total" this build asks for; the two stay separate fields with separate meanings.

## Decomposition — mechanical vs. research

This request cannot ship as one build because two of its four asks are fundamentally different kinds of work:

| Cell | Kind | How it's filled |
|---|---|---|
| Current count (+ sub-row breakdown) | Mechanical | Live SQL against tables we already have |
| Existing floor/freshness guard | Mechanical | Already built (`lib/coverage.ts`) — reused |
| **Confirmed total** ("what it should be / I was told it was to be") | Research | Per-source crawl4ai investigation (RULE 0.4), one citation at a time |
| **Source ceiling** ("everything possible to bring in, even unused") | Research | Same — reading the vendor's own docs/API for what else they publish |
| **Vendor benchmark** (Redfin/Zillow say they have N) | Research, and only where real | Only exists for pipelines with a genuine external comparable — see below |

~85 pipelines × up-to-3 research cells each is not a single build. The frame ships now; the research fills in afterward, pipeline by pipeline, without blocking the page from existing.

**Vendor benchmark reality check:** Redfin Data Center publishes real per-ZIP/county inventory and listing counts (we already ingest from it via `redfin_swfl`, `redfin_lee`, `redfin_collier`) — a genuine comparable exists there. Zillow publishes indices (ZHVI/ZORI), not a listing count — there is no "Zillow says N properties" number to fetch for most of what we pull from Zillow. Most non-real-estate sources (BLS, Census, FEMA, permits, CRE) have no vendor-style benchmark at all; for those, `vendor_benchmark` is simply omitted from the registry entry, not filled with a fake "N/A" row.

## Data model — extend the one registry, no new database table

Add optional fields per `cadence_registry.yaml` entry:

```yaml
category: "Real Estate & Property"    # grouping key for the ops page
breakdown_by: source_name              # optional column; engine runs GROUP BY for sub-rows
                                        # (only set where a table legitimately bundles >1 logical source,
                                        # e.g. marketbeat_swfl's source_name split, or a county column)
source_scope:
  confirmed_total:                     # null until researched — never a guess
    value: 548798
    as_of: "2026-05-18"
    source_url: "https://www.leepa.org/..."
    source_label: "Lee County Property Appraiser parcel roll"
  source_ceiling:                      # null until researched
    summary: "LeePA also publishes sale history, building permits linkage, and GIS parcel boundaries we don't currently pull."
    source_url: "https://www.leepa.org/..."
  vendor_benchmark:                    # omitted entirely where no real comparable exists
    source: "Redfin"
    value: 41250
    as_of: "2026-06-01"
    source_url: "https://www.redfin.com/news/data-center/"
```

Git history is the audit trail — matches the existing convention of dating `expected_rows_min` in a comment. No new Postgres table, no new ledger.

**Pipeline count is derived, not hand-maintained:** total = every entry under `pipelines:` + `not_yet_running:` in the registry (the documented "excluded tables" section at the bottom is commentary, not pipeline entries, and stays excluded). This is the literal denominator for "how many pipelines do we have," computed live on every page load — never a number typed into a doc that goes stale.

## Page design

New route in `swfldatagulf-ops`: **`/census`**.

**Header:** total pipeline count (live, per the rule above) as the headline number, plus a progress line: "N confirmed-total researched / M source-ceiling researched / K vendor-benchmark applicable" — all computed from how many registry entries have a non-null `source_scope` field. This is the "how do we know when we're done" counter the operator asked for.

**Body:** pipelines grouped by `category`, each rendered as a card/row block showing:
- Label, lane, cron/cadence (existing fields)
- Live current count, reusing `tableCoverage`/`directTableFreshness`/`tier1Freshness`
- Sub-rows via `breakdown_by` where set (e.g. `marketbeat_swfl` → 4 rows, one per `source_name`)
- Existing freshness/floor guard badge, reused verbatim from `classify()` — no new guard logic
- Three new cells: **Confirmed total**, **Source ceiling**, **Vendor benchmark** — each shows the real value + citation link when `source_scope` is filled, or an explicit "pending research" badge when not (never blank, never guessed)

**Guards:** reuse the existing GRAB/FIX/FIND/ROUTE work order from `/coverage` as-is. No new auto-remediation — per the standing no-paid-dispatch guard, a pipeline that costs money on each run cannot be auto-redispatched by this page; flagging is the ceiling here, same as today.

## Initial category taxonomy (proposed, adjust freely during build)

Derived from scanning the current registry: Real Estate & Property (parcels, listings, rentals, Redfin/Zillow/FHFA), Market Aggregates (SteadyAPI histograms/details), Permits & Licenses, CRE / Commercial (MarketBeat family, Crexi/Brevitas, local CRE context), Labor & Economy (BLS, Census CBP/ACS), Environmental (USGS, NOAA, HURDAT2, FEMA), Government Revenue (FL DOR TDT/sales tax), News & Compliance (DBPR press/notices, SWFL Inc, news_swfl), Macro (FRED national series), Airport & Tourism (RSW), Operator-Internal (search demand — not customer-facing).

## Rollout order

1. **Build the frame now:** registry schema fields, `/census` page, category grouping, live counts + breakdowns + reused guards, header progress counter. Every pipeline visible immediately with research cells honestly marked pending.
2. **Research fill, incremental, ordered by category** starting with Real Estate & Property (the pipelines that triggered this ask: `leepa`, `collier_parcels`, `redfin_swfl`/`redfin_lee`/`redfin_collier`, `active_listings`, `listing_lifecycle`, `zhvi`/`zori`, `fhfa`), then outward category by category. Each fill is a small, separately-committed crawl4ai investigation citing a real source per RULE 0.4 — not a batch guess.
3. **"Brought in" per-run delta** (explicitly deferred, not in this spec): needs a check of whether dlt's load metadata already exposes rows-per-load before any new instrumentation is designed. Separate follow-up once the frame above ships.

## Non-goals

- Not rebuilding or replacing `/coverage` — this is a new, complementary page.
- Not touching the static `/data-inventory` catalog.
- Not inventing a "confirmed total" or "source ceiling" number for any pipeline before it's actually researched — `pending` is the only acceptable placeholder.
- Not building auto-remediation for guard failures.
- Not building per-run ingest delta tracking in this pass.
