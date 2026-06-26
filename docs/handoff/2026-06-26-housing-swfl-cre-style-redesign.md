# Handoff — /r/housing-swfl → CRE-style cards + surface all housing data

**Date:** 2026-06-26
**Status:** Scoped against live code. No code written yet. Awaiting go on scope (Tier A vs Tier A+B).

---

## What you asked for (verbatim)

> add all new housing pipelines data we have to /r/housing-swfl
> make it look more like /r/cre-swfl
> so they have same cards and looks

Two asks:
1. **Surface the housing data** we hold but don't show on `/r/housing-swfl`.
2. **Restyle** the page to match `/r/cre-swfl` — the StatBox/StatGrid cards + the collapsible drill-down, instead of the current flat table.

---

## What I finally found (all verified against live files this session)

### 1. Why the two pages look different — it's ONE generic page with a CRE special-case

`/r/housing-swfl` and almost every other `/r/<slug>` are rendered by the **generic** `app/r/[slug]/page.tsx`. That file has a hardcoded `slug === "cre-swfl"` branch (lines ~206–223) that swaps in:
- `CREMarketBeatChart` (sector-clickable chart)
- `CRESummaryBoxes` → `StatGrid`/`StatBox` cards (the dark teal cards you like)
- `CRECorridorBreakdown` → collapsible **County → City briefcase → Corridor row → metric boxes** drill-down

Every other slug (housing included) falls through to the `else`: a flat `MetricsTable` of the region-wide metrics only, then everything else is hidden behind the `SourcesGate` ("Members only") teaser. **That's the whole visual gap** — housing just never got its own branch.

CRE's card components live in:
- `app/r/cre-swfl/CREMetricsExplorer.tsx` — `StatBox`, `StatGrid`, `CRESummaryBoxes`, `CRECorridorBreakdown`, `CityBriefcase`, `CorridorRow`
- `app/r/cre-swfl/cre-metrics.ts` — shared types + label parsers (`parseMBCityLabel`, `shortenSummaryLabel`)
- shared chrome: `app/r/_components/report-shell.tsx` (`ReportShell`, `ReportHeader`, `SectionTitle`, etc.)

### 2. The housing brain ALREADY holds far more than the page shows

`brains/housing-swfl.md` (v6, built **2026-06-03**, token `SWFL-7421-v6-20260603`) contains:
- **6 region-wide `key_metrics`** — median sale price ($400k, −3.5% YoY), median DOM (72d), months of supply (6.0), sale-to-list (95.2%), % sold above list (4.4%), % off-market in 2 weeks (20.8%). *These are the only thing the page shows today.*
- **A rich `housing_by_zip` detail_table — 125 ZIP rows, currently rendered NOWHERE.** Each row has: `metro`, `median_sale_price`, `median_sale_price_yoy_pct`, `median_dom`, `median_dom_yoy_days`, `avg_sale_to_list_pct`, `months_of_supply`, `homes_sold`, `inventory`, `low_sample`. The 4 metros: **Cape Coral, Naples, Punta Gorda, North Port**.

So "all the data" is mostly **already in the brain and just hidden.** A metro-grouped, drill-to-ZIP view (the housing analog of CRE's county→city→corridor) is pure frontend — no pipeline work.

### 3. There IS genuinely new data NOT yet in the brain

The pack `refinery/packs/housing-swfl.mts` and source `refinery/sources/housing-source.mts` reveal data the brain doesn't carry:

**a) Unused fields the source already queries** (`housing-source.mts:33–118`) but the pack never emits:
`median_list_price`, `median_ppsf`, `price_drops` (fraction), `pending_sales`, `median_sale_price_mom`.

**b) Three brand-new Redfin pipelines that first ran 2026-06-14 — AFTER the brain was built (2026-06-03), so they're absent from it.** From `ingest/cadence_registry.yaml`:
- `redfin_price_drops` → `lake-tier1/market/redfin_price_drops.parquet` — 9,955 rows / 126 ZIPs ✓
- `redfin_contract_cancellations` → `lake-tier1/market/redfin_contract_cancellations.parquet` — 9,955 rows / 126 ZIPs ✓
- `redfin_delistings_relistings` → `lake-tier1/market/redfin_delistings_relistings.parquet` — 9,955 rows / 126 ZIPs ✓

**c) Adjacent pipelines with their own packs/grain:**
- `market_heat_swfl` (realtor.com Core Inventory + Market Hotness, ZIP grain — has its own `market-heat-swfl.mts` pack)
- `fred_listing_swfl` (8 Realtor.com series, **MSA grain only**, no ZIP)

The pack does compute a `by_metro` aggregate (`housing-swfl.mts:43, 213`) inside the snapshot but does **not** emit it as `key_metrics` — so even the metro rollups aren't in the output as metrics.

---

## The two-tier scope (this is the decision)

### Tier A — Frontend only. Zero pipeline risk. Delivers most of the ask.
Mirror the CRE pattern onto housing using data **already in the brain**:
- `app/r/housing-swfl/housing-metrics.ts` — types (`MetricBox`, `MetroNode`, `ZipRow`) + a `shortenHousingLabel()` helper.
- `app/r/housing-swfl/HousingMetricsExplorer.tsx` — `StatBox`/`StatGrid` for the 6 headline metrics + collapsible **Metro card → ZIP rows → per-ZIP metric boxes** (the housing analog of CityBriefcase→CorridorRow). Reuse CRE's exact card styling.
- `app/r/housing-swfl/page.tsx` — dedicated server page (takes priority over `[slug]`): reads `brains/housing-swfl.md`, maps the 6 `key_metrics` → summary boxes, groups the `housing_by_zip` rows by `metro` → breakdown, computes metro-level aggregates server-side. `low_sample` ZIPs get a "thin sample" chip.
- No pack edit, no vocab change, no brain rebuild. Surfaces the 125-ZIP × 8-metric table that's hidden today.

### Tier B — Pipeline work. Needs your go (RULE 1 = ask first) + carries rebuild risk.
Get the genuinely new data into the brain:
- Add the unused source fields + the 3 new parquets as new `key_metrics` / detail columns in `housing-swfl.mts` (new DuckDB sources for the 3 parquets).
- Register every new metric slug in `refinery/vocab/brain-vocabulary.json` **in the same commit** (orphan linter blocks the GHA rebuild otherwise).
- Run `bun test refinery/lib/corridor-aliases.test.mts` + `bun refinery/tools/check-vocab-coverage.mts --all` (pre-push Gate 2) and the pack catalog/bun:test (Gate 5).
- **Rebuild the brain** — this needs lake access and may hang at stage 3 on egress (the known cre-swfl pattern). Use `--target-only` to avoid clobbering parallel sessions.
- Per **RULE 1**, pack edits that change `key_metrics` shape/math are "ask first" — so Tier B does not happen unsupervised.

**Recommendation:** ship Tier A now (it's the bulk of "all our data" + the entire "looks like cre-swfl" ask, with no risk), then do Tier B as a separate, supervised pass.

---

## Your graphify question — "is there no graphify running on these tables?" — I WAS WRONG

**There IS graphify on these tables, and it's published live at `https://swfldatagulf-ops.vercel.app/graph`.** I initially said graphify is code-only and doesn't index the data tables. That was wrong — corrected here after looking at the live page and the graph data.

The `/graph` page ("Brain Graph", 649 nodes / 564 edges) models BOTH planes:
- **DATA PLANE:** Brains (29), Slugs (275), **Pipelines (63)**
- **APP PLANE:** Pages (41), Components (77), API Routes (70), Hooks (12), **Tables (82)**

The three new Redfin pipelines are already nodes in it: `pipeline:redfin_price_drops`, `pipeline:redfin_contract_cancellations`, `pipeline:redfin_delistings_relistings` (plus `pipeline:redfin_swfl`). Source: `graphify-out/graph.json`, published to the ops repo by `scripts/graphify-publish.mjs` (`TYPE_CONFIG` includes `pipeline` and `table` types).

**The real gap is EDGES, not nodes.** Of the 63 pipeline nodes, only **2** have any edge at all — `pipeline:bls_oews_swfl → table:bls_oews_swfl` and `pipeline:zori_swfl_tier2 → table:zori_swfl` (both `relation: "writes"`, from `cadence_registry.yaml`). Every Redfin pipeline — including the working `redfin_swfl` that the housing brain genuinely consumes — has **zero edges**. They float.

So the graph corroborates the Tier-A/Tier-B finding from a different angle:
- `brain:housing-swfl` IS edge-wired to its 8 metric/column slugs (`housing_median_sale_price_swfl`, `median_dom_yoy_days`, `median_sale_price_yoy_pct`, etc.) — generated from `refinery/packs/housing-swfl.mts`.
- The 3 new Redfin pipelines have NO edge to that brain (or anything) — visual confirmation they're ingested-but-not-consumed (Tier B).

**What's genuinely missing in graphify:** the pipeline→table→brain provenance edges. Only 2 of 63 pipelines emit a `writes` edge, so "what feeds housing-swfl" is NOT yet answerable from the graph's edges — the wiring exists in code (the pack reads the parquet) but the graph generator doesn't derive that edge. That's a graphify-generator gap worth closing, separate from this UI task.

Also available for table/pipeline introspection: `ingest/cadence_registry.yaml` (authoritative pipeline list + paths + first-run dates) and the lake MCP (`mcp__lake__list_views`, `describe_view`, `query_lake`).

---

## Files referenced (all read/verified this session)
- `app/r/[slug]/page.tsx` (generic page + cre-swfl branch)
- `app/r/cre-swfl/CREMetricsExplorer.tsx`, `app/r/cre-swfl/cre-metrics.ts`
- `app/r/_components/report-shell.tsx`
- `brains/housing-swfl.md` (v6, 125-ZIP detail table)
- `refinery/packs/housing-swfl.mts` (6 metrics emitted, `by_metro` computed-not-emitted)
- `refinery/sources/housing-source.mts` (5 queried-but-unused fields)
- `ingest/cadence_registry.yaml` (3 new Redfin parquets, first run 2026-06-14)
