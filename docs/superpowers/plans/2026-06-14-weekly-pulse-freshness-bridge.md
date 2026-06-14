# Weekly Pulse — Freshness-Bridge Pipeline

**Status:** PLANNED (not yet implemented). Branch `claude/swfl-data-freshness-pipeline-w6pyim`.
**Date:** 2026-06-14

## Context

The `/charts` page reads vendor data (Zillow ZHVI / ZORI, monthly) that lags ~2 months — the
newest point reads "Apr 2026" on June 14. The operator wants **fresh data everywhere**,
especially graphs, and a current freshness token / "as of" on **every surface that needs one**.
`city_pulse` already brings fresh *narrative* data daily (Master uses it); the gap is fresh
*numeric* (chart) data and visible freshness.

This builds a weekly "pulse" that appends a current, **cited** data point to the home-value
chart and generalizes a reusable freshness footnote.

### Decisions locked with the operator
- **Authoritative-first source, not search-estimate.** The original spec extracted prices via
  search + `gpt-4o-mini`, which collides with the platform MOAT ("the system cannot invent a
  number"). Instead: median price from the **Redfin weekly public file**
  (`https://redfin-public-data.s3.us-west-2.amazonaws.com/redfin_covid19/weekly_housing_market_data_most_recent.tsv`
  — probed live; covers `Cape Coral, FL metro area` = Lee County exactly, `Naples, FL metro area`
  = Collier County exactly, with real `median_sale_price`/`median_sale_ppsf`, weekly rolling-4wk);
  mortgage rate from **FRED `MORTGAGE30US`** (Freddie Mac PMMS, weekly). A **mini-LLM estimate**
  is a *tagged fallback only* ("the mini fills in over time"), run on **Claude Haiku**
  (`claude-haiku-4-5`) via the existing `ANTHROPIC_API_KEY` — no new vendor/secret
  (`gpt-4o-mini` rejected).
- **Data-lake persistence, no bot commits.** New Tier-2 table `data_lake.weekly_pulse`; the cron
  writes via psycopg and stays `contents: read` (no `git push`/`git commit`), matching every
  other pipeline here.

## Honesty constraints (design around these)
- **ZHVI ≠ Redfin median sale price** — different metrics. The pulse renders as a **visually
  distinct dashed/ghost series** with its own label + tooltip naming the source/metric + source
  footnote — **never** a recolored continuation of the ZHVI line.
- **Every estimate row carries `source_tag='estimate'`** (vendor rows `'vendor'`); the UI renders
  estimate points as "Estimated", never blended blind (MOAT / Operation Dumbo Drop provenance).
- **Coverage:** Redfin has no separate Fort Myers metro (it's inside Cape Coral metro) → pulse
  covers `cape_coral` + `naples` only; `fort_myers` gets no pulse point. **No rent-pulse source**
  exists from Redfin/FRED → Home Values panel only for v1.

## Ordering / risk
- Migration (Step 1) lands + `NOTIFY pgrst` **before** first non-dry ingest. Idempotent
  (`CREATE TABLE IF NOT EXISTS`) → safe to re-run.
- **No `ingest/requirements.txt` change** (psycopg, anthropic, requests, firecrawl-py, pyyaml
  already pinned) → no Python lockfile churn → CI stays green.
- `pulse-provider` must **try/catch → empty** so a missing table never reddens `next build`
  (mirror every `loadX` in `app/charts/page.tsx`).
- **RSC boundary:** pulse keeps the serializable `valueFormat="usd"` token; tooltip/footnote
  driven by a serializable `pulseMeta` prop — never a function prop.
- No `refinery/packs/**` or vocab change → Gate-5/vocab gates not triggered (confirm by grep).

## Implementation steps

**1. SQL migration — `ingest/scripts/migrate_weekly_pulse.py` (new).** Reuse the `_uri()` +
`psycopg.connect` + `NOTIFY pgrst, 'reload schema'` pattern from
`ingest/scripts/migrate_nfip_flood_zone_current.py`. Idempotent DDL for `data_lake.weekly_pulse`:
columns `as_of_date date`, `period_begin date`, `period_end date`, `county text`
(`'Lee'|'Collier'|'SWFL'`), `region_name text`, `metric_kind text`
(`'median_sale_price'|'mortgage_rate'`), `median_price numeric`, `median_ppsf numeric`,
`mortgage_rate numeric`, `source_name text`, `source_url text`, `source_tag text`
(`'vendor'|'estimate'`), `_ingested_at timestamptz default now()`; **PK
`(period_end, county, metric_kind, source_name)`**. `GRANT SELECT ... TO service_role;` Verify via
`information_schema.columns`. Optional sibling `docs/sql/20260614_weekly_pulse.sql`.

**2. Ingest — `ingest/scripts/fetch_weekly_pulse.py` (new).** Reuse: FRED fetch shape from
`ingest/pipelines/fred_g17/resources.py`; upsert + `--dry-run` from
`ingest/pipelines/estero_edc/pipeline.py`; Redfin-TSV filter approach from
`ingest/pipelines/redfin_lee/`; `assert_min_rows` from `ingest/lib/guards.py`.
- **Probe-first narrow fetch** of the Redfin weekly TSV; keep `region_type=='metro'` and
  `region_name in {'Cape Coral, FL metro area','Naples, FL metro area'}`; map → county; latest
  `period_end`; extract `median_sale_price`, `median_sale_ppsf`, `period_begin/end`.
  `source_name='redfin_weekly'`, `source_tag='vendor'`.
- **FRED `MORTGAGE30US`** latest obs → one row `metric_kind='mortgage_rate'`, `county='SWFL'`,
  `source_name='fred_pmms'`, `source_tag='vendor'`.
- **Estimate fallback** behind `--with-estimate` (default off v1): Claude Haiku grounded by
  `ingest/lib/extract_client.py`, only for a metric/area vendor files miss; `source_tag='estimate'`.
- `assert_min_rows(vendor_rows, 2, "weekly_pulse")` before write; idempotent
  `ON CONFLICT (period_end, county, metric_kind, source_name) DO UPDATE`. CLI
  `python -m ingest.scripts.fetch_weekly_pulse [--dry-run] [--with-estimate]`.

**3. `ingest/cadence_registry.yaml`** — add `weekly_pulse` under `pipelines:` (tier-2,
`cadence_days: 7`, `tolerance_multiplier: 3.0`, `freshness_table: data_lake.weekly_pulse`,
`freshness_column: _ingested_at`, `expected_rows_min: 2`), mirroring `marketbeat_swfl`.

**4. `.github/workflows/pulse-cron.yml` (new).** Reuse `city-pulse-daily.yml` structure.
`cron: "0 0 * * 0"` (Sun 00:00 UTC), `workflow_dispatch` with `dry_run`/`with_estimate` inputs,
`permissions: contents: read`, **no commit**. Env: `FRED_API_KEY`, `ANTHROPIC_API_KEY`,
`FIRECRAWL_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `DESTINATION__POSTGRES__CREDENTIALS`.
Run idempotent migration as a guard step, then the ingest.

**5. `lib/charts/pulse-provider.ts` (new).** Reuse the
`createServiceRoleClient().schema("data_lake").from(...)` read from `app/charts/page.tsx` and the
`{entries, asOf, rowCount}` shape from `lib/charts/pivoted-series.ts`. Export
`loadWeeklyPulse(supabase)` (latest `period_end` per county/metric) **and a pure `mapPulseRows`**
(unit-testable). Map county→chart key (Lee→`cape_coral`, Collier→`naples`). Carry
`sourceName/sourceUrl/sourceTag`. **try/catch → `{points:[], asOf:undefined}`**.

**6. `app/charts/page.tsx`.** Add `loadWeeklyPulse` to the `Promise.all`. In a pure, testable
helper, append pulse points as **distinct keys** (`pulse_cape_coral`/`pulse_naples`) to the Home
Values wide-rows **only when pulse month > vendor `asOf`**. Add a `pulseSeries` `ChartSeriesDef`
(distinct color/dash, label "Weekly Pulse") and pass merged `series` + `data` + serializable
`pulseMeta` + freshness token/asOf to the panel.

**7. `components/charts/ZHVIAreaChart.tsx`.** Reuse per-series `<Line strokeDasharray={s.dash}>` +
inline `<Tooltip>` render-prop. Render pulse as an isolated dashed/ghost dotted point (own legend
entry). Tooltip branch keyed off `pulseMeta`: vendor → "Weekly Pulse — Redfin median sale price,
rolling 4-wk" + source; estimate → "Weekly Pulse (Estimated from search)" + source. Source
footnote (`source_name` + `source_url`) near the existing caption. Keep `valueFormat="usd"`.

**8. `components/FreshnessBadge.tsx` (new, shared).** Generalize the existing
`app/welcome/_components/FreshnessBadge.tsx`: accept a `token` (via `asOfFromToken` in
`lib/project/as-of.ts`) **or** plain `asOf`/`label` + optional `note`; keep pill styling.
Re-point the `app/welcome` usage (and `AnswerBlock.tsx`) at the shared component. Render it in
each chart panel header, fed by real `asOf`/token — satisfies `app/_design/07-charts-and-dataviz.md`
§3 ("Date every chart … never a hardcoded date").

**9. Tests.** Follow `lib/charts/pivoted-series.test.ts` (`bun:test`). New
`lib/charts/pulse-provider.test.ts` (latest-per-county selection, county→key map, vendor/estimate
passthrough, null/empty degradation, `asOf` anchor) + merge-helper test (appended only when newer;
`fort_myers` none).

## Verification (end-to-end)
1. `python -m ingest.scripts.fetch_weekly_pulse --dry-run` → 2 Redfin metro rows + FRED row + count.
2. `python -m ingest.scripts.migrate_weekly_pulse` → table + GRANT + NOTIFY; then a live ingest;
   then `SELECT county, metric_kind, source_tag, period_end, _ingested_at FROM data_lake.weekly_pulse
   ORDER BY _ingested_at DESC;` → ≥2 vendor metro rows + 1 mortgage row, estimates tagged.
3. `bun test lib/charts/` → green.
4. `npm run build` → `/charts` prerenders (pulse path degrades to empty if table absent).
5. Eyeball `/charts`: distinct dashed "Weekly Pulse" point past the last ZHVI month; tooltip names
   the Redfin source/metric (or "Estimated"); source footnote; freshness badge shows current "as of".

## Ship
Per RULE 0/2: top-of-file `SESSION_LOG.md` entry + `node scripts/safe-push.mjs` to the feature
branch. No PR unless requested. Open a `weekly_pulse_estimate_graduation` follow-up check for
extending the estimate fill-in + freshness footnote to remaining surfaces.
