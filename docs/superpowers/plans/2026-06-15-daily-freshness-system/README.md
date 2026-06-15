# Daily Freshness System — Implementation Plan (master index)

> **For agentic workers:** REQUIRED SUB-SKILL — use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement the build files below, one task at a time, with a review checkpoint between tasks. Every build file's steps use checkbox (`- [ ]`) syntax for tracking. **Do not start a build file until its `Depends:` files have landed.**

**Goal:** A daily, cited, self-validating freshness layer that asks reliable sources for today's number, cross-checks it, verifies it on the cited page, validates it against the authoritative vendor figure when that lands, lets the brains reason over it today, and shows the whole machine green/red on one board.

**Architecture:** One spine (`ingest/cadence_registry.yaml`) → a fallback-cascade engine (Gemini → Firecrawl → Spider → Claude) that writes a first-class Tier-2 table `data_lake.daily_truth` → a `freshness-pulse` brain that feeds Master "Today's Snapshot" and projects ZIP-grain `[INFERENCE]` points via a Baseline-Delta machine → daily crons + a probe-trigger → an against-vendor validation pass → a green/red control board on `/data-inventory`.

**Tech Stack:** Python (dlt + psycopg) ingest · DuckDB/Postgres lake · TypeScript refinery (brain packs, `bun`) · Next.js 15 App Router + Recharts (`/charts`) · GitHub Actions crons · Supabase (Tier-2 + checks ledger) · Gemini grounded search + Firecrawl/Spider + Claude Haiku · ops board in the separate `swfldatagulf-ops` repo.

---

## ⚠️ READ FIRST — this is the source of truth, the per-file docs are briefs

Per **RULE 2** and `feedback_parallel-session-drift`: the `⬜/✅` markers and "Status" lines in the build files rot the instant code ships. **Trust `git` + the code over any marker.** Open obligations live in the `checks` ledger (`scripts/check.mjs`), never in a plan-doc marker. This README's "Build status" table (bottom) is a convenience index, not an authority — verify done-ness against `git`.

---

## 0. Verification ledger — what the audit confirmed and corrected (CLAUDE.md C1 + Rule 1)

This plan was audited against the **live code** (5 read-only agents, 41 findings) and the **live vendor docs** (Gemini, FRED, OpenFEMA via in-session WebFetch/curl) on 2026-06-15. A plan that names a surface is a hypothesis — these are the receipts. **Build files cite the corrected facts below, not the original draft's guesses.**

### Vendor surfaces (Rule 1 — verified in-session)

| Surface | Verdict | Verified fact (use this verbatim) |
|---|---|---|
| Gemini grounding config | ✅ plan correct | Models `gemini-2.5-pro` / `gemini-2.5-flash` / `gemini-2.5-flash-lite`. Tool = `tools:[{ "google_search": {} }]` for current models (older = `google_search_retrieval`). Extract sources at `candidates[].groundingMetadata.groundingChunks[].web.uri` + `.web.title`; citations at `groundingMetadata.groundingSupports[]`; queries at `groundingMetadata.webSearchQueries[]`. Source URIs are `vertexaisearch.cloud.google.com` **redirect** URLs → must be resolved to the publisher URL. |
| Gemini grounding pricing | ✅ plan correct | **1,500 RPD free** (shared across Flash + Flash-Lite), then **$35 / 1,000** grounded prompts. **Caveat:** one request can fan out to multiple billed search queries. Free tier **is** used to improve Google products (only public-market questions are sent). At ~8–40 req/day we stay free. **New option:** Gemini 3 grounding is **5,000 prompts/mo free (shared), then $14/1k** — cheaper per query; re-verify model id + free quota live at build time before choosing. |
| FRED `MORTGAGE30US` | ✅ plan correct | "30-Year Fixed Rate Mortgage Average in the United States", **weekly, Thursday** release, source **Freddie Mac PMMS** (methodology changed 2022-11-17), units Percent. 6.52% as of 2026-06-11 (a Thursday). Reuse the `fred_g17` request shape (below). |
| OpenFEMA `reportedZipCode` | ❌ **plan's premise refuted** | Dictionary: **"5-digit Postal Zip Code of the insured property as reported by WYO partners."** It is the **insured-property (site) ZIP, NOT a mailing ZIP.** The plan's "NFIP = G1 violation (mailing ZIP)" rationale is wrong. Caveats: WYO-self-reported; `latitude`/`longitude` are privacy-coarsened to **1 decimal (~11 km)** → cannot independently verify ZIP via point-in-polygon; `countyCode` "may not reflect the individual county the property is located." |

### Code reuse anchors (5 agents — 30 verified, 5 partial, 1 uncertain, 5 corrected)

| Plan said | Reality (cite this) |
|---|---|
| `ingest/lib/zip_approx.py` | ❌ It's at **`ingest/utils/zip_approx.py`** — maps `(city, county, state) → nearest ZCTA5 centroid` via Census `onelineaddress` geocoder + TIGER 2024 internal-point centroids + `fixtures/swfl-zip-county.json` fast-path. Consumed by `franchise_outcomes` DuckDB pipeline. Tests at `ingest/utils/tests/test_zip_approx.py`. |
| Per-ZIP `detail_tables` exemplar = `env-swfl.mts` | ❌ env-swfl emits per-ZIP data as **templated `key_metrics`** (`swfl_zip_<zip>_…`), its only `detail_table` is per-storm. Canonical **per-ZIP `detail_tables` (grain `"zip"`)** exemplar = **`refinery/packs/housing-swfl.mts:525-530`** (`id: "housing_by_zip"`); also rentals/home-values/investor-zip/seller-stress/tier-divergence packs. |
| `BRAIN_CATALOG` + `PER_PACK_REGISTRY` both in `index.mts` | ❌ `PER_PACK_REGISTRY` is in `refinery/packs/index.mts` (`Record<id, PackDefinition>`, `[envSwfl.id]: envSwfl`). **`BRAIN_CATALOG` is in `refinery/packs/catalog.mts`** (lean `{ id, domain, scope, ttl_seconds }`, zero pack imports — MCP-safe). Gate-5 test = `refinery/packs/catalog.test.mts`. **A new pack edits BOTH files.** |
| Chart `dash` field defined but not wired | ❌ `dash` is **already wired**: defined `types/viz.ts:103`, consumed at `components/charts/ZHVIAreaChart.tsx:382` (`strokeDasharray={s.dash ? s.dash : undefined}`). Component's real name is **`MetroAreaChart`** (`ZHVIAreaChart` is a back-compat alias). Dash applies in the **`line`** variant only; the **`area`** variant uses `<Area>` (no dash). |
| Ops repo has no Supabase client | ❌ Ops repo **has a full Supabase service-role layer** (`lib/supabase.ts`, `lib/checks.ts`, `lib/goals.ts`, …, `app/api/checks/route.ts`, `app/api/notes/route.ts`) using bare `createClient(URL, KEY)`. **Only the `app/data-inventory` page** is static `_data.ts` + `section-actions.tsx` localStorage. → file 06 v1.5 reuses the existing client + an existing API route as the template; **no porting** from brain-platform. |
| FEMA `reported_zipcode` = mailing ZIP (G1 violation) | ❌ See vendor table — it's the **insured-property ZIP**; env-swfl **already** surfaces per-ZIP NFIP flood metrics. NFIP-at-ZIP is largely **done**, not a blocker and not an unbuilt quick-win. |
| `scrape_with_fallback` + `scrape_with_actions` both in `extract_client.py` | ◐ `scrape_with_fallback(url, *, only_main_content=True, formats=("markdown",))` + `extract()` + `ExtractError` are in `ingest/lib/extract_client.py` (Firecrawl primary, Spider fallback). **`scrape_with_actions(url, actions, …)` is in `ingest/lib/firecrawl_client.py`** (direct, no Spider analogue — Accela). |
| `assert_min_rows(rows, n, label)` | ◐ Exact: **`assert_min_rows(landed: int, minimum: int, label="")`** in `ingest/lib/guards.py` (takes an int, raises `VolumeGuardError`). Siblings: `assert_vs_canonical`, `assert_vs_baseline`. Per-column non-null guard is **inline** (see `fema/resources.py` `_promote_nfip_to_tier2`), not a `guards.py` fn. |
| `marketbeat_swfl` is the parked-ODD example | ◐ `marketbeat_swfl` **graduated** (active, `cadence_registry.yaml` L559-571). Parked-ODD examples = `sba_foia_franchise_outcomes` (under `not_yet_running:` L725-737) or any `probe_mode: odd_window` entry (`crexi_listings`, `lee_associates_swfl`, `estero_edc`, `fmb_recovery`, …). |
| `app/ops/data-inventory` in brain-platform was reverted | ◐ **Not reverted.** It is **live on `origin/main`** (`0e2244b` + `7a89e39`); absent locally only because local HEAD (`49d9c28`) is **4 commits behind** `origin/main`. There is a **real wrong-repo page on origin/main** that file 06 must remove (the correct board is `swfldatagulf-ops/app/data-inventory/`). |

**Verified-as-written (cite directly):** `migrate_nfip_flood_zone_current.py` (`_uri()` + `psycopg.connect` + `NOTIFY pgrst, 'reload schema'` + idempotent DDL) · `fred_g17/resources.py` (`https://api.stlouisfed.org/fred/series/observations`, params `{series_id, api_key, file_type:"json", observation_start, sort_order:"asc"}`, iterates `SERIES_IDS`) · `check_freshness.py` (824 lines, age-vs-cadence classify, writes `$GITHUB_STEP_SUMMARY`, **always exit 0**; does **not** compare to vendor publish date) · `cadence_registry.yaml` schema (`name, lane, cadence_days, tolerance_multiplier, freshness_table, freshness_column, source_name, expected_rows_min, probe_mode, first_expected_by, liveness_view, note` + a `not_yet_running:` section) · `zip-resolver.mts` `resolveZip(zip): ZipResolution{ in_scope, counties, primary_county, … }` · `fixtures/swfl-zip-county.json` (~109 ZIPs, 6 counties, Census 2020 ZCTA→county, straddle ZIPs carry 2 counties) · `brain-vocabulary.json` (`concepts` dict + `slug_index` dict; resolver reads `slug_index`; `meta.concept_count` is **stale**) · `check-vocab-coverage.mts --all` (reads rendered `brains/*.md`; pre-push hook runs it) · `master.mts` upstreams in **two** arrays — `sources` (`makeBrainInputSource("<id>")`) + `input_brains` (`{ id, edge_type:"input"|"modifier", critical? }`); cycle error `DAG: cycle detected — {a → b → a}` · `brain-output.mts` (`BrainOutputProducerResult` leaf shape: required `conclusion, key_metrics, caveats, direction, magnitude, overrides, contradicts, drivers`; optional `detail_tables`, `exogenous_signals: []`; **leaves omit `confidence`/`conditional_claims`** — Stage 4 computes them) · `app/charts/page.tsx` (6 loaders in one `Promise.all`) · `createServiceRoleClient` at **`@/utils/supabase/service-role`** (not `lib/supabase`) · `redfin_lee/resources.py` + `redfin_collier/resources.py` → `data_lake.redfin_lee_market`/`redfin_collier_market`, dlt **merge** PK `(region, period_end, property_type)`, cols incl. `property_type` + `median_sale_price` + `…_yoy` + `months_of_supply` + `median_dom` (county-grain, idempotent, non-destructive) · `.github/workflows/city-pulse-daily.yml` (cron `0 9 * * *`, `workflow_dispatch`, `permissions: contents: read`, env secrets) · `daily-rebuild.yml` (`0 6 * * *`) + `freshness-probe-daily.yml` (`0 14 * * *`) are the two flappers · `scripts/check.mjs` (`list`/`open`/`close`/`update`) · `scripts/{safe-push,worktree}.mjs` · `public/maps/fl_zips.geojson` (22 MB, 983 FL features, ZIP = `ZCTA5CE10`, `INTPTLAT10/LON10` present — usable for point-in-polygon) · every scheduled workflow has `workflow_dispatch` (59/59).

---

## 1. Operator decisions locked this session (these drove the design)

1. **First-class, no exemption.** Sourced data is a standard Tier-2 citizen the brains reason over. Table = `data_lake.daily_truth`. The **brain-first gate is satisfied, not waived**: `refinery/packs/freshness-pulse.mts` ships in the **same PR** as the table (file 03 ⨉ file 01).
2. **ZIP-grain everywhere via a Baseline-Delta machine.** Every in-scope ZIP gets a pulse point: a fresh county-level delta applied to that ZIP's real vendor baseline. Derived points are `source_tag='approx'`, rendered `[INFERENCE]`, and **never a bare guess** (they carry baseline source + county-delta source + a falsifier).
3. **Single spine.** Sourced metrics register in `ingest/cadence_registry.yaml` (a `live_search_config:` sub-block) **alongside** vendor data — no second "question catalog" file, no two-sources-of-truth drift. Brains already read the registry for lineage.
4. **Full fallback cascade.** Gemini → Firecrawl → Spider → Claude. Cross-check for agreement; store `NULL + reason` only when all legs fail. **Never store a bare model number.**

---

## 2. Architecture — the daily loop

```
SINGLE SPINE: ingest/cadence_registry.yaml
  └─ each sourced metric → live_search_config: { questions[], allowed_domains[],
       vendor_anchor_table, unit, expected_range, tolerance_pct }   (no separate catalog)
                        │
                        ▼
ENGINE (01) — fallback CASCADE, MOAT core → writes data_lake.daily_truth (Tier-2):
  1. Gemini grounded search → number + groundingChunks[].web.uri   (resolve vertex redirect)
  2. Firecrawl extract()/scrape_with_fallback + Claude parse   ┐ cross-check: ≥2 legs agree
  3. Spider deep-scrape fallback                               ┘ within tolerance_pct?
  4. Claude (Haiku) reason/extract = last resort (source_tag tagged)
  5. VERIFY-ON-PAGE: re-scrape the cited URL → numeric ±tolerance match on an ALLOWLISTED domain
  6. store ONLY if sourced + verified → value + source_url + source_tag='live_search'
     else NULL + reason. Never a bare number.
                        │
       ┌────────────────┼─────────────────────────────┐
       ▼                ▼                              ▼
FRESHNESS-PULSE     BASELINE-DELTA (03)            CHARTS pulse (07, existing branch)
BRAIN (03)          per-ZIP projection:            dashed "Weekly Pulse" point past last
freshness-pulse.mts zip_today = zip_baseline ×     ZHVI month; reads daily_truth (Redfin
→ "Today's Snapshot" (1 + county_delta); tagged    read-through as v1 stopgap); shared
→ Master daily       source_tag='approx',          FreshnessBadge + /terms /privacy
  sentiment (upstream) [INFERENCE] + falsifier
                        │
                        ▼
DAILY CRON (04): live-search-daily.yml runs the engine per registry entry · PROBE-TRIGGER:
  dispatch a vendor ingest within hours when a fresher vendor file is detected (ETag/Last-Modified)
                        │
                        ▼
VALIDATION (05): when the AUTHORITATIVE vendor number lands → daily_truth within X%?
  yes → CONFIRMED (board green) · no → FLAG (board red + public.checks via scripts/check.mjs)
                        │
                        ▼
CONTROL BOARD (06, ops repo): per metric → cron · question(s) · sites asked · last value+source+
  retrieved-at · validation delta · GREEN when covered+verified  (v1 localStorage → v1.5 Supabase)
```

**MOAT guardrails (baked into 01/03/05 — non-negotiable, this is the brand):**

- **Never store a bare model number.** Store the number a *named reliable source published*, re-fetched and found on the cited page (numeric ±tolerance on an allowlisted domain). Unverifiable → `NULL + reason`.
- **Provenance precedence.** Every row carries `source_url` + `source_tag`; sourced data **always loses to vendor data** when both exist. A `daily_truth` value flagged by validation (05) is demoted, not trusted.
- **`approx` ZIP points are `[INFERENCE]`, not facts.** They cite the ZIP baseline + the county delta, state a falsifier ("superseded when the next ZIP-grain vendor file lands"), and the speaker renders them as projections. We never label a county figure as a ZIP figure (data-protocol v3 rule 7 + the MOAT line). The Baseline-Delta is the sanctioned inference shape.
- **Two independent "is it right?" checks:** intra-day cascade agreement (01) + against-vendor within-X% (05).

---

## 3. Canonical contracts — defined ONCE here, every build file references these verbatim

> Type/name drift across files is the #1 plan-failure (writing-plans self-review). These are the locked names. If a build file needs a new field, change it **here first**, then in the file.

### 3a. `data_lake.daily_truth` (Tier-2 Postgres) — defined by file 01

| column | type | notes |
|---|---|---|
| `metric_key` | `text` | e.g. `median_sale_price`, `mortgage_30yr_fixed` |
| `area` | `text` | `cape_coral` / `fort_myers` / `naples` / `lee` / `collier` / `swfl` / a ZIP |
| `period` | `date` | the period the value refers to (period_end) |
| `value` | `numeric` | the verified number (or `NULL` when all legs fail) |
| `unit` | `text` | `usd` / `pct` / `count` |
| `source_url` | `text` | resolved publisher URL (not the vertex redirect) |
| `source_title` | `text` | page/source title |
| `engine` | `text` | `gemini` / `firecrawl` / `spider` / `claude` |
| `query_text` | `text` | the question asked |
| `retrieved_at` | `timestamptz default now()` | freshness column |
| `agreement_n` | `int` | cascade legs agreeing within tolerance (≥2 = cross-checked) |
| `verified_on_page` | `boolean` | re-scrape numeric ±tolerance match passed |
| `source_tag` | `text` | `live_search` / `approx` / `estimate` / `vendor` |
| `status_reason` | `text` | when `value IS NULL`: why (all legs failed / out-of-range / unverifiable) |
| `metric_config` | `jsonb` | per-metric `{ unit, vendor_anchor_table, tolerance_pct, expected_range, allowed_domains }` snapshot |

**Idempotent merge key:** `(metric_key, area, period, source_tag)`. `GRANT SELECT ... TO service_role; NOTIFY pgrst,'reload schema';`. A new metric/area is a **data row**, not a schema change (per-metric config rides in `metric_config`).

### 3b. `live_search_config:` block in `cadence_registry.yaml` — defined by file 02

Every sourced metric carries a `fetch_mode`: **`search`** (the Gemini→Firecrawl→Spider→Claude cascade + verify-on-page) or **`api`** (a deterministic pull from an authoritative API — single reliable source, trivially verified). Median price = `search`; 30-yr mortgage = `api` (FRED), because searching for a number FRED publishes deterministically would be less honest than pulling it.

```yaml
# under pipelines: → <metric_id>:   (search mode — median price)
live_search_daily_median_price:
  lane: tier-2
  cadence_days: 1
  freshness_table: data_lake.daily_truth
  freshness_column: retrieved_at
  source_name: live_search
  expected_rows_min: 1
  live_search_config:
    fetch_mode: search
    areas: ["cape_coral", "fort_myers", "naples"]
    metric_key: median_sale_price
    questions:
      - "What is the current median home sale price in Cape Coral, Florida?"
      - "Cape Coral FL median sale price this month"
    allowed_domains: ["redfin.com", "zillow.com", "realtor.com"]
    vendor_anchor_table: data_lake.redfin_lee_market   # null for no-anchor metrics
    unit: usd
    expected_range: [200000, 900000]
    tolerance_pct: 10

# (api mode — 30-yr mortgage)
live_search_daily_mortgage:
  lane: tier-2
  cadence_days: 1
  freshness_table: data_lake.daily_truth
  freshness_column: retrieved_at
  source_name: live_search
  expected_rows_min: 1
  live_search_config:
    fetch_mode: api
    areas: ["swfl"]
    metric_key: mortgage_30yr_fixed
    api_config: { provider: fred, series_id: MORTGAGE30US, source_url: "https://fred.stlouisfed.org/series/MORTGAGE30US" }
    vendor_anchor_table: null   # FRED IS the authority → it's its own anchor
    unit: pct
    expected_range: [2.0, 12.0]
    tolerance_pct: 5
```

### 3c. Charts `PulsePoint` / `MarketContext` — defined by file 07 (reconciles the two 2026-06-14 docs)

The 2026-06-14 `freshness-sonnet-handoff.md` **wins** over `weekly-pulse-freshness-bridge.md`: **no separate `weekly_pulse` table.** Lock `periodEnd` (not `asOf`); add `yoy`; extend `sourceTag` for the future:

```ts
export type PulsePoint = {
  chartKey: "cape_coral" | "naples";
  county: "Lee" | "Collier";
  periodEnd: string;        // "2026-05-31"
  medianSalePrice: number;  // 360000
  yoy: number | null;       // -0.021 (fraction)
  sourceName: string;       // "Redfin County Market Tracker"
  sourceUrl: string;
  sourceTag: "vendor" | "live_search" | "approx";
};
export type MarketContext = {
  pulsePoints: PulsePoint[];
  mortgage: { rate: number; asOf: string } | null;  // { rate: 6.52, asOf: "2026-06-11" }
  freshnessToken?: string;
};
```

### 3d. `ingest/lib/zip_stamp.py` — defined by file 08

```python
def stamp_zip(rows, *, mode, lat_col=None, lon_col=None, address_cols=None,
              source_tag="derived"):  # mode ∈ {"geocode","pip","crosswalk"}
    """Scope-gated (swfl-zip-county.json) post-ingest ZIP stamper.
    Returns rows with a `zip_code` (site location only, G1) + `zip_source` provenance.
    Out-of-scope rows are dropped, never invented."""
```

### 3e. freshness-pulse vocab slugs — defined by file 03

County-grain cited facts (Tier-1, `live_search`): `freshness_median_sale_price_<area>_usd`, `freshness_mortgage_30yr_fixed_pct`. Per-ZIP `approx` (`[INFERENCE]`): `swfl_zip_<zip>_pulse_median_price_approx_usd`. Each is registered as a `concepts` entry (`prefLabel` + `scope_note`) **and** a `slug_index` entry in the **same commit** (resolver reads `slug_index`).

---

## 4. Build files — model / repo / wave / deps

| # | File | Model | Repo | Wave | Depends | One-liner |
|---|---|---|---|---|---|---|
| 00 | `00-audit-and-catchup.md` | Opus | brain-platform | 0 (solo) | — | Probe → real stale list; `gh workflow run` the behind ones; triage the 2 flappers; seed board status |
| 01 | `01-daily-truth-engine.md` **[SPINE]** | Opus | brain-platform | 1 | 00 | Fallback-cascade ask→verify→store engine + `data_lake.daily_truth` migration |
| 02 | `02-registry-and-questions.md` | Opus | brain-platform | 1 ∥01 | — | Extend `cadence_registry.yaml` with `live_search_config:` per metric (single spine) |
| 03 | `03-freshness-pulse-brain.md` **[gate]** | Opus | brain-platform | 2 | 01, 02 | `freshness-pulse.mts` → Today's Snapshot → Master; Baseline-Delta ZIP. **Same PR as 01.** |
| 04 | `04-daily-crons-and-probe-trigger.md` | Opus | brain-platform | 2 | 01, 02 | `live-search-daily.yml` matrix runs engine per registry entry; probe-triggered vendor ingest |
| 05 | `05-validation-within-x-pct.md` | Opus | brain-platform | 3 | 01, 04, vendor landing | When vendor lands, grade within X%; flag bad sources to board + checks ledger |
| 06 | `06-ops-control-board.md` | Sonnet | **swfldatagulf-ops** | 2 | 02 | `/data-inventory` daily-truth section (v1 localStorage, v1.5 Supabase); remove the wrong-repo brain-platform page |
| 07 | `07-charts-bridge.md` | Opus+Sonnet | brain-platform (branch) | 1 ∥ | — | Fold into `925e125`; reconcile the 2-doc contradiction; pulse reads daily_truth (Redfin read-through v1); badge + `/terms` `/privacy` |
| 08 | `08-zip-machine-core.md` | Opus | brain-platform | 1 (indep) | — | Consolidate 3 geocoders + `zip_approx` into one stamper; point-in-polygon + submarket→ZIP crosswalk |
| 09 | `09-zip-routing.md` | Sonnet ×N | brain-platform | 2 | 08 | Route ~11 non-ZIP datasets; **NFIP is G1-clean** (corrected); start with site-located datasets |
| 99 | `99-deferred.md` | — | — | — | — | Parked scope |

**Model logic:** Opus = MOAT / architecture / brain / cross-system (00–05, 08). Sonnet = contract-bounded execution (06 board, 09 per-dataset routing, the UI/legal half of 07).

**Atomicity (brain-first gate):** **01 (table) + 02 (registry) + 03 (brain) land in ONE PR.** `freshness-pulse.mts` must be empty-tolerant so it ships before data accumulates. Master gains `freshness-pulse` as an upstream (both `sources` + `input_brains` arrays in `master.mts`; a leaf must NOT name master — the DAG throws). Every emitted slug is registered in `brain-vocabulary.json` (`concepts` + `slug_index`) in the same commit; the pack is added to **both** `PER_PACK_REGISTRY` (`index.mts`) **and** `BRAIN_CATALOG` (`catalog.mts`) without drifting domain/scope/ttl (Gate 5). Run `bun refinery/tools/check-vocab-coverage.mts --all` before push.

---

## 5. Future-proofing for any NEW data (operator's explicit ask)

1. **One spine.** Every new source — vendor or sourced — registers in `cadence_registry.yaml` first; sourced metrics add a `live_search_config:` block. The freshness probe + ops board both derive from this one file.
2. **Zero-code graduation (ODD shape).** A new sourced metric = a new registry entry + (if it needs its own brain) an empty-tolerant consumer. `daily_truth` keys on `(metric_key, area, period)` and carries per-metric `unit/anchor/tolerance` in `metric_config` jsonb — a new metric/area is a data row, not a schema change. **Validate by adding one extra metric end-to-end during the build and noting any code touch required.**
3. **Generalized table.** `daily_truth` is metric-agnostic; non-numeric/categorical signals ride in `metric_config` / `status_reason`, not new columns.
4. **Honesty scales with grain.** The Baseline-Delta machine turns any county-grain fresh number into ZIP-grain `approx` projections automatically — tagged, sourced, falsifiable — so new county-only sources still light the whole ZIP map without inventing precision.

---

## 6. Ship protocol (RULE 0/1/2 — every build file)

- **Two repos, never mixed:** ingest/engine/brain/charts/zip = **brain-platform**; the control board = **swfldatagulf-ops** (`vercel --prod`). Stage **explicit paths only** (never `git add -A` — RULE 1.5).
- **Brain-first PR:** 01 + 02 + 03 land together (table + registry + `freshness-pulse.mts` + source connector + vocab + both registries + master upstream). Atomic type-lift if `BrainOutput`/`PackDefinition` changes.
- **Pre-push gates (hook-enforced):** lockfile (`bun install` + `git add bun.lock` if deps change); vocab `--all` + Gate-5 pack⇆catalog (03/09 touch packs); ingest non-null guard before any destructive write (daily_truth merge is non-destructive → N/A, but the migration is idempotent); secrets wired into **every** `env:` (file 04 wires `GEMINI_API_KEY`). `SESSION_LOG.md` top entry + `node scripts/safe-push.mjs`; `checks` ledger + `build-queue.md` reconciled in the **same** push. **Never `--no-verify`, never force-push `main`.**
- **Vendor-first (Rule 1):** 01 re-verifies the Gemini grounding surface live before coding (it may have drifted from §0); 07 re-verifies the Redfin/FRED field shapes before relying on them.
- **Parallel-session isolation (RULE 1.5):** any Sonnet on brain-platform uses a local worktree (`node scripts/worktree.mjs new <label>`). The ops board (06) is a different repo → no collision. **Note:** local `main` is currently 4 commits behind `origin/main`; `safe-push` rebases at ship time — these doc additions are conflict-free.

### End-to-end smoke (after 01+02+03 land — proves the whole loop)

```bash
python -m ingest.scripts.migrate_daily_truth                                  # table exists
python -m ingest.pipelines.live_search.pipeline --dry-run --metric live_search_daily_median_price  # cascade returns number+source
python -m ingest.pipelines.live_search.pipeline --metric live_search_daily_median_price            # live write
# SELECT metric_key,area,value,source_tag,verified_on_page FROM data_lake.daily_truth ORDER BY retrieved_at DESC;  -> no bare numbers
npm run refinery -- freshness-pulse --target-only                              # brain renders (empty-tolerant)
bun refinery/tools/check-vocab-coverage.mts --all                             # no orphan slugs
bun test refinery/packs/catalog.test.mts                                      # Gate-5 parity
bun test lib/charts/                                                          # pulse provider (on the charts branch)
npm run build                                                                  # /charts prerenders; pulse degrades to empty if absent
# eyeball /charts (dynamic as-of + dashed pulse) + /data-inventory (board green)
```

---

## 7. Open decisions (defaulted; flag if you disagree)

1. **X% threshold** — default **10%**, per-metric override in `live_search_config.tolerance_pct`; soft flag to board + checks ledger (not a hard gate).
2. **First metrics** — median sale price (Cape Coral / Fort Myers / Naples) + 30-yr mortgage (anchored to Redfin/FRED, so the validation loop is provable). Expand to no-anchor metrics only after the loop's accuracy is measured.
3. **Ops shared status** — v1 keeps localStorage; v1.5 graduates to Supabase as its own scoped sub-task (table + write API + read hydration in the **ops** repo, reusing its existing `createClient` + `app/api/checks/route.ts` pattern).
4. **Table name** — `data_lake.daily_truth` (operator's name). Engine internals log `source_tag ∈ ('live_search','approx','estimate','vendor')`.

---

## 8. Build status (convenience index — verify against `git`, not these marks)

Open obligations live in the `checks` ledger, not here. This table tracks the build of the **plan files themselves**.

**"Authored" = the build brief exists. It is NOT "the code is built."** When a build file's CODE ships, verify against `git`/the board, not this column.

| # | File | Authored | Notes |
|---|---|---|---|
| — | `README.md` (this) | ✅ | canonical contracts + verification ledger |
| 00 | audit-and-catchup | ✅ | Wave 0 — run before anything else |
| 01 | daily-truth-engine | ✅ | SPINE — defines `daily_truth`; same PR as 02+03 |
| 02 | registry-and-questions | ✅ | single spine; `fetch_mode` search/api |
| 03 | freshness-pulse-brain | ✅ | brain-first gate — same PR as 01 |
| 04 | daily-crons-and-probe-trigger | ✅ | Gate-3 `GEMINI_API_KEY` |
| 05 | validation-within-x-pct | ✅ | api-mode skipped; idempotent check_key |
| 06 | ops-control-board | ✅ | ops repo; ops already has Supabase; remove brain-platform dup |
| 07 | charts-bridge | ✅ | fold into branch; kill `weekly_pulse` table; `dash` already wired |
| 08 | zip-machine-core | ✅ | `zip_approx` is in `ingest/utils/` |
| 09 | zip-routing | ✅ | **NFIP `reportedZipCode` = site ZIP (corrected)** |
| 99 | deferred | ✅ | NFIP parcel-join item resolved/moot |
