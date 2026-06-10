# CRE `/r/` site — supplementary-metrics handoff

**Date:** 2026-06-09
**Author:** Claude (branch `claude/cre-market-analysis-firecrawl-9ny137`)
**Status:** Handoff / scouting brief — no code shipped yet. This is the map for wiring the next wave of CRE data + charts.
**Grounded by:** in-session code audit (schemas, source connectors, pack, render path read directly — file:line below) + a web-scouting pass over the live SWFL CRE publishers ("send firecrawl out"). Every "we have / we lack" claim was checked against the repo, not remembered.

---

## THE GOAL

Turn the CRE report at `/r/cre-swfl` (and its corridor children) from a three-number read (vacancy · NNN asking rent · net absorption) into a **highly predictive market analysis with at-a-glance graphs**. The operator's wishlist groups the supplementary metrics into four families:

1. **Construction pipeline & deliveries** — space under construction, pre-leased %, net deliveries. *(Vacancy/absorption only mean something measured against new supply.)*
2. **Market velocity & demand** — availability rate (leading indicator), gross vs net absorption, tenant tiers / industry focus, Class A vs B.
3. **Financial adjustments & concessions** — effective rents (asking − concessions), TI allowances, free-rent months.
4. **Macro drivers** — office-using / logistics job growth, cap rates, sale volume & pricing power.

The proof must stay in the data: every chart bar and every claim cites a source row in the lake (Rules of Engagement #1). Charts are **deterministic** (computed from `key_metrics`/`detail_tables`), prose is qualitative — Brain Factory rule 2.

---

## TL;DR — the gap in one paragraph

The chart engine is **already live** (Tier A `computeMetricChart` → `/r/` + `/api/b`), so "graphs on the CRE site" is mostly a *data* problem, not a render problem. The lake holds the three core metrics plus cap rate, and — critically — the `marketbeat_swfl` table **already has columns for the construction pipeline and sales volume** (`under_construction`, `deliveries`, `inventory_sf`, `sale_price_psf`, `sales_volume`, `vol_growth`, `ytd_absorption_sqft`) that are **dark**: never read by the source connector, never emitted by the pack, never populated. The richer wishlist items — **pre-leased %, availability rate, effective rents, TI allowances, free-rent months** — have **no column anywhere**. The publishers that carry these (C&W MarketBeat, Colliers, LSI Companies, CBRE Cap Rate Survey) all **block plain HTTP fetch (403)** — which is exactly why the repo's Firecrawl stealth-proxy ingest path exists. This session could not run a live scrape (`FIRECRAWL_API_KEY` and `.dlt/secrets.toml` are absent from this fresh clone — they live in GHA secrets / the operator's `.env.local`), so the firecrawl run itself is a follow-up; this doc names the exact targets, columns, and wiring so it's a fill-in-the-blanks job.

---

## WHAT WE HAVE (confirmed in code)

### Tables (`data_lake.*`)
| Table | DDL | Rows (per SESSION_LOG 2026-06-09) | Feeds |
| --- | --- | --- | --- |
| `corridor_profiles` | `20260525_marketbeat_swfl.sql` (+ narrative cols) | verified corridor corpus | `refinery/sources/cre-source.mts` |
| `marketbeat_swfl` | `20260525` + `20260605` ext + `20260609` ext | 20 (lee_associates) + 132 (colliers) + MHS rows | `refinery/sources/marketbeat-swfl-source.mts` |
| `active_listings_cre` | `20260609_active_listings_cre.sql` | empty (crexi writes here) | `refinery/sources/active-listings-source.mts` |
| `local_cre_context` | `20260609_local_cre_context.sql` | 14 (Estero EDC + FMB recovery) | `refinery/sources/local-cre-context-source.mts` |
| `bls_oews_swfl` (+ laus/qcew grants) | `20260530_bls_oews_swfl_create.sql` | — | labor/macro brains |

### Metrics SURFACED today (emitted by `cre-swfl` pack → render)
From `corridor_profiles` (median across corridors) and per-submarket MarketBeat:
- **Cap rate** (`cap_rate_pct`, corridor-level only) — `cre-swfl.mts:718`
- **Vacancy rate** (`vacancy_rate_pct` corridor median + `vacancy_rate_marketbeat_<place>` per submarket) — `cre-swfl.mts:726, 1083`
- **Net absorption** (`absorption_sqft`) — `cre-swfl.mts:734`
- **Asking rent NNN / PSF** (`asking_rent_psf` corridor + `asking_rent_nnn_marketbeat_<place>`) — `cre-swfl.mts:742, 1051`
- Per-sector isolation (retail / industrial / office surfaced as distinct slugs, never blended) — `cre-swfl.mts:618-626`
- Corridor narrative fields: `tenant_mix`, `dominant_tenant_types`, `seasonal_index`, active flags — `cre-source.mts:75-122`

### Columns we HAVE but are DARK (in schema, never read/emitted) ⚠️ highest-leverage
In `data_lake.marketbeat_swfl` (`20260605_marketbeat_swfl_mhs_extension.sql` + `20260609_marketbeat_ytd_and_mf_os_rents.sql`):
- `inventory_sf` (BIGINT)
- **`under_construction`** (BIGINT) — construction pipeline ✅ column exists
- **`deliveries`** (BIGINT) — net deliveries ✅ column exists
- `sale_price_psf` (NUMERIC) — pricing power ✅
- **`sales_volume`** (BIGINT) — investment volume ✅
- `vol_growth` (NUMERIC) — sale-volume YoY ✅
- `ytd_absorption_sqft` (INTEGER) — proxy toward gross absorption ✅
- `asking_rent_mf`, `asking_rent_os` (NUMERIC) — rent by industrial subtype ✅

> **Confirmed dark:** `grep` over `refinery/sources/marketbeat-swfl-source.mts` and `refinery/packs/cre-swfl.mts` for these names = **zero hits**. The source connector's documented column list (`marketbeat-swfl-source.mts:20-25`) reads only `vacancy_rate, asking_rent_nnn, absorption_sqft`. So populating + surfacing these is **cheap** — no migration, just connector + pack + vocab work.

### The chart/render path — ALREADY LIVE (Tier A)
- Producer: `refinery/lib/chart-from-metrics.mts` → `computeMetricChart(output)` (≥3 comparable numeric points → bar, else `null`).
- Render: `app/r/[slug]/page.tsx:162` `{display.chart && <ReportChart .../>}` → `ChartBlockView` → `HBarChart`.
- API/MCP: `lib/fetch-brain.ts:207` sets `Dossier.chart`.
- Spec (Tiers B/C unbuilt): `docs/superpowers/specs/2026-06-07-chart-generation-three-tier-design.md`.
- **Implication:** the more comparable per-submarket metrics `cre-swfl` emits in one `display_format` group, the richer the auto-chart. Build queue item "Charts Tier A" is largely satisfied for cre; the lever is feeding it more metric families.

---

## WHAT WE NEED / WHAT'S MISSING

| Wishlist metric | Family | Lake status | Path to get it |
| --- | --- | --- | --- |
| Space under construction | 1 | **column exists, DARK** | populate + read `under_construction`; emit metric + vocab |
| Net deliveries | 1 | **column exists, DARK** | populate + read `deliveries` |
| Pre-leased % | 1 | **no column** | new col + source (CBRE/JLL/Colliers carry it for some assets) |
| Availability rate | 2 | **no column** | new col `availability_rate`; C&W/CoStar report it distinct from vacancy |
| Gross absorption | 2 | partial (`ytd_absorption_sqft` only) | new col `gross_absorption_sqft` |
| Tenant tiers / industry / Class A·B | 2 | partial (`tenant_mix`, `dominant_tenant_types` narrative) | structure into facets; Class split needs source data |
| Effective rents | 3 | **no column** | new col; usually broker/CompStak, rarely in free PDFs |
| TI allowances | 3 | **no column** | new col; broker commentary / CompStak |
| Free-rent months | 3 | **no column** | new col; broker commentary |
| Cap rates (submarket) | 4 | partial (corridor-level only) | populate submarket cap rate from LSI/CBRE |
| Sale volume / pricing | 4 | **columns exist, DARK** | read `sales_volume`/`sale_price_psf`/`vol_growth` |
| Office-using / logistics job growth | 4 | **HAVE** (separate brains) | already in `bls_oews_swfl`, `labor-demand-swfl`, `macro-swfl`, `econ-dev-swfl` → master aggregates. Cross-link into the CRE read rather than re-ingest. |

**Reality check on Family 3 (effective rents / TI / free rent):** these are the hardest. Major brokerages rarely publish them in free quarterly PDFs — they live in CompStak, CoStar, or broker-direct commentary. Expect these to be **Operation Dumbo Drop** candidates (manual-drop scaffold: empty-tolerant consumer, parked cadence entry, Tier-1 cold target, `source_tag` provenance) rather than auto-scrape. See `docs/superpowers/plans/2026-06-05-operation-dumbo-drop.md`.

---

## FIRECRAWL SCOUTING RESULTS ("send firecrawl out")

Scouting pass over live SWFL CRE publishers. NOTE: `WebFetch` was **403-blocked** on cpswfl.com, colliers.com, and the LSI PDF — these sites reject plain fetch, which is precisely the case the repo's `scrape_with_fallback()` (Firecrawl primary + stealth proxy) and `scrape_with_actions()` are built for (`ingest/lib/extract_client.py`, `firecrawl_client.py`). Coverage below is from search-result snippets; confirm field-by-field on the first real Firecrawl run.

| Source | URL pattern | Cadence | Carries (wishlist) | Ingest status |
| --- | --- | --- | --- | --- |
| **C&W MarketBeat — Fort Myers/Naples** (office/industrial/retail) | `cushmanwakefield.com/.../fort-myers-naples-marketbeats`; PDFs via `cpswfl.com/market-beats/` | quarterly | vacancy, **availability**, **under construction**, **deliveries**, net absorption, asking rent | **WIRED** (`cw_marketbeat`, `marketbeat_pdf` pipeline) — but new columns dark |
| **Colliers — SWFL Industrial** | `colliers.com/en/research/ft-myers/southwest-florida-industrial-market-report-YYYY-qN` | quarterly (~26th of month after Q close) | vacancy, **under construction**, net absorption, asking rent NNN | **WIRED** (`colliers_industrial`, 132 rows) — new columns dark |
| **LSI Companies — "Market Trends"** ⭐ NEW TARGET | `lsicompanies.com/wp-content/uploads/YYYY/MM/lsi-market-trends-qN-YYYY.pdf` | quarterly | **cap rates** (e.g. 6.09%), **sales $/PSF** ($212–215), **under-construction SF**, vacancy, asking rent NNN — comprehensive SWFL | **NOT INGESTED** — best single new target; comprehensive + SWFL-native |
| **CBRE — US Cap Rate Survey** ⭐ NEW TARGET | `cbre.com/insights/reports/us-cap-rate-survey-*` | semi-annual (H1/H2) | **cap rates** by sector/class (regional) | **NOT INGESTED** — anchors Family 4 cap rates |
| **Lee & Associates — SWFL** | `lee-associates.net/.../market-report` | quarterly | vacancy, rent, absorption, sales, cap rate, under-construction | **WIRED** (`lee_associates`, 20 rows) |
| Premier Commercial / SVN Florida | — | — | no structured market reports (brokerage/deal news only) | dead-ends (confirmed in cadence registry) |

**Net-new firecrawl targets to add:** (1) **LSI Market Trends** quarterly PDF — highest value, fills cap rate + sales volume + under-construction in one SWFL-native doc; (2) **CBRE Cap Rate Survey** — semi-annual cap-rate anchor. Both fit the existing `marketbeat_pdf` / fallback-scrape pattern.

---

## ENVIRONMENT BLOCKERS (why the live scrape didn't run here)
- **No `FIRECRAWL_API_KEY` / `SPIDER_API_KEY`** in this session's env (only `.env.example` present). Live scrape runs in GHA with repo secrets, or locally with the operator's `.env.local`.
- **No `.dlt/secrets.toml`** in this fresh clone → can't open the Postgres `data_lake` to confirm row-level population of the dark columns or write a migration from here.
- **No Supabase creds** → the `checks` ledger read errored at session start; couldn't reconcile an `open` check for this work (do it from a session that has creds).

---

## RECOMMENDED NEXT STEPS (priority order)

1. **Light up the dark columns (no migration needed).** Extend `marketbeat-swfl-source.mts` to read `under_construction`, `deliveries`, `inventory_sf`, `sales_volume`, `sale_price_psf`, `vol_growth`, `ytd_absorption_sqft`; emit them as per-sector `key_metrics` in `cre-swfl.mts`; register every new slug in `refinery/vocab/brain-vocabulary.json` **in the same commit** (pre-push gate #2 — run `bun refinery/tools/check-vocab-coverage.mts --all`). This alone gives the auto-chart 3 new comparable families (construction, deliveries, sales volume) and ships construction pipeline + investment volume.
2. **Verify population.** From a creds-bearing session, query `data_lake.marketbeat_swfl` to see which of those columns the Colliers/MHS loads actually filled vs. which need the firecrawl re-extract.
3. **Wire LSI Market Trends pipeline** (`marketbeat_pdf` pattern) → fills submarket cap rate + sales volume + under-construction, SWFL-native.
4. **Add availability_rate + gross_absorption_sqft columns** (one idempotent migration) and extract from C&W/Colliers — availability is the leading indicator the operator specifically wants.
5. **Family 3 (effective rents / TI / free rent) → Operation Dumbo Drop scaffold** (manual-drop ready, Tier-1 cold, `source_tag`) — these aren't in free PDFs.
6. **Cross-link macro:** surface the office-using / logistics job-growth read we already compute (`labor-demand-swfl` / `bls_oews_swfl`) into the CRE narrative instead of re-ingesting.
7. **Charts:** once steps 1/3 land, `computeMetricChart` auto-produces richer per-submarket bars on `/r/cre-swfl` — no render work required. Optional: a second comparable group (e.g. under-construction-by-submarket) if we want a dedicated supply chart.

---

## KEY FILES (read these first)
- Pack: `refinery/packs/cre-swfl.mts`
- Sources: `refinery/sources/{marketbeat-swfl,cre,active-listings,local-cre-context}-source.mts`
- DDLs: `docs/sql/20260525_marketbeat_swfl.sql`, `…20260605_marketbeat_swfl_mhs_extension.sql`, `…20260609_*.sql`
- Cadence: `ingest/cadence_registry.yaml` (CRE Group E, lines ~538-611)
- Scrape infra: `ingest/lib/{extract_client,firecrawl_client,spider_client}.py`
- Chart: `refinery/lib/chart-from-metrics.mts`, `app/r/[slug]/page.tsx:162`, spec `docs/superpowers/specs/2026-06-07-chart-generation-three-tier-design.md`
- Vocab gate: `refinery/vocab/brain-vocabulary.json`, `refinery/tools/check-vocab-coverage.mts --all`
- ODD: `docs/superpowers/plans/2026-06-05-operation-dumbo-drop.md`
