# DBPR Press Releases / news-swfl — Handoff

**Session:** 2026-06-01 (Sonnet 4.6)
**Status:** Pipeline live, backfill complete, enrichment complete. Pack registered.

---

## What's Live

### Pipeline

`ingest/pipelines/dbpr_press_releases/` — Firecrawl scrapes DBPR listing pages.
Full article body is rendered inline on listing pages (no per-article scrape needed).

- **GHA:** `dbpr-press-releases-weekly.yml` — Monday 09:00 UTC, pages 1–2
- **Backfill flag:** `--backfill` crawls all 30 pages
- **Two-phase write:**
  1. Ingest: deterministic fields (source_url, title, published_date, body_text, scraped_at)
  2. Enrich: `claude-sonnet-4-6` fills summary, topics, affected_industries, geographic_mentions, is_swfl_relevant (10 rows/run)
- **Firecrawl cost:** 2 credits/weekly run (pages 1–2)

### DB State (as of 2026-06-01)

- Table: `public.dbpr_press_releases`
- Rows: 151, date range 2016-01-22 to 2026-01-29
- Enriched: 151/151 (all enriched in catchup run)
- 5 rows with null published_date (very old articles with non-standard HTML — acceptable)
- Tier-1 cold copy: `lake-tier1/news/dbpr/year=2026/month=06/day=01/`

### Pack Stub

`refinery/packs/news-swfl.mts` — registered in index, brain-first gate satisfied.

Key metrics:

- `dbpr_swfl_releases_90d` — SWFL-relevant releases last 90 days
- `dbpr_swfl_releases_prior_90d` — prior 90-day window (momentum)
- `dbpr_total_releases_90d` — statewide total

Direction vote: SWFL-relevant release count trend (bullish = rising enforcement activity).
Source: `refinery/sources/dbpr-press-releases-source.mts` → `public.dbpr_press_releases`.

### Cadence Registry

Entry `dbpr_press_releases` added to `ingest/cadence_registry.yaml` under `pipelines:`.
Floor: 135 rows (90% of 151). Freshness probe checks `MAX(scraped_at)` on the table.

---

## Known Gaps / What's Not Done

### 1. Cadence Registry — not yet in `pipelines:` active section

The entry is there but marked as "First run: 2026-06-01 backfill." The freshness probe
uses `MAX(scraped_at)` — verify this column name matches what the probe expects
(`inserted_at` vs `scraped_at`). Other non-dlt pipelines (swfl_inc, fgcu_reri) use
`inserted_at` as the freshness column. The dbpr table uses `scraped_at`.

**Action:** Either add an `inserted_at` column that auto-sets on write (and update the
upsert SQL to populate it), OR confirm the probe handles `scraped_at` as the freshness
field. Check `ingest/lib/freshness_probe.py` (or equivalent) for which column it reads
on `freshness_table` entries.

### 2. news-swfl not wired into master DAG

The pack is registered but `master.mts` doesn't list `news-swfl` as an `input_brain`.
Decision needed: does master consume this, or does it stay leaf-only?

**Recommendation:** Add as a `modifier` edge (same pattern as `env-swfl`) — regulatory
enforcement signals are contextual modifiers, not primary drivers. Probably routes
through `sector-credit-swfl` as an intermediate (DBPR enforcement → sector credit risk).

### 3. GHA doesn't expose `--enrich-only` as a workflow_dispatch input

The current yml only exposes `dry_run` and `backfill`. To re-run enrichment alone
(without re-scraping), you have to dispatch the full run (it scrapes pages 1–2 then
auto-enriches new rows, which is fine). But for explicit enrichment-only control,
add a third input:

```yaml
enrich_only:
  description: "Skip scraping; only enrich un-enriched rows"
  required: false
  default: "false"
```

And in the run step:

```bash
if [ "${{ github.event.inputs.enrich_only }}" = "true" ]; then
  FLAGS="$FLAGS --enrich-only"
fi
```

### 4. Freshness probe column mismatch risk

`public.dbpr_press_releases` has `scraped_at` (not `inserted_at`). The cadence
registry `freshness_table` probe reads `MAX(inserted_at)` on non-dlt tables per the
existing pattern. Confirm or fix before the freshness probe starts alerting falsely.

**Quick fix:** add `inserted_at timestamptz default now()` to the table and populate
it in the upsert SQL alongside `scraped_at`.

### 5. SWFL is_swfl_relevant signal quality

The Sonnet enricher fires `is_swfl_relevant` on explicit geographic mentions in the
text. Statewide releases that affect SWFL industries (e.g. condo law, contractor
licensing changes) but don't name SWFL counties are currently marked `false`.

This is intentional conservatism — false negatives are better than false positives
for a regulatory signal. Revisit if the 90-day SWFL count reads consistently low.

---

## Routing / Consumer Options

The spec named two possible consumers:

1. **`news_swfl` brain (current)** — standalone regulatory pulse leaf
2. **`sector-credit-swfl`** — DBPR enforcement as credit-risk modifier

Both can be true simultaneously. The `news-swfl` pack is a leaf brain that produces
the raw signal. `sector-credit-swfl` could consume it via `input_brains: ["news-swfl"]`
to incorporate regulatory enforcement into sector credit scores for construction,
hospitality, real estate.

The most direct SWFL value: enforcement sweeps post-storm (unlicensed contractors)
= recovery activity signal. `cre-swfl` or `permits-swfl` would benefit more from this
than `sector-credit-swfl` directly.

---

## File Map

```
ingest/pipelines/dbpr_press_releases/
  constants.py     — BASE_URL, NAV_SLUGS, ENRICH_MODEL, ENRICH_BATCH_SIZE=10
  parser.py        — listing page → article rows (three date formats)
  enricher.py      — Sonnet tool-use extraction, 10 rows/batch
  pipeline.py      — orchestration, CLI (--pages, --backfill, --enrich-only, --dry-run)

.github/workflows/dbpr-press-releases-weekly.yml
ingest/cadence_registry.yaml          — dbpr_press_releases entry
docs/sql/20260601_dbpr_press_releases_create.sql

refinery/sources/dbpr-press-releases-source.mts
refinery/packs/news-swfl.mts
refinery/__fixtures__/news-swfl.sample.json
refinery/packs/index.mts              — newsSwfl registered
```
