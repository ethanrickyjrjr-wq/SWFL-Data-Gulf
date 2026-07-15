# FEMA Flood Data — Usage Handoff (07/14/2026)

**One doc, three consumers.** How to correctly use our FEMA flood data in (1) the AI
email/deliverable builder, (2) user-facing pages, and (3) charts. Every table name,
column, grain, join key, and citation below was read out of the code and the live lake
on 07/14/2026 — not memory.

**Read this first if you're in a hurry:**
- We ingest ONE federal dataset today: **OpenFEMA `FimaNfipClaims`** (paid flood-insurance
  claims). Everything else FEMA offers is NOT yet ingested — see GET THE REST.
- Base table `data_lake.fema_nfip_claims`, **grain = one row per paid claim**, plus two
  derived SQL views (`fema_nfip_county_year`, `fema_nfip_zip_window_agg`).
- **The claims table is currently 0 rows** (a killed run emptied it on 07/14; a
  `replace_strategy` fix landed and it is repopulating). Two consumers break in two
  DIFFERENT ways while it's empty — see "Current row status" and "Known bugs".
- FEMA is a **named federal source** → cite it as **"OpenFEMA FimaNfipClaims"**, not
  "SWFL Data Gulf". (The `data_lake.*` table name is scrubbed to `[internal]` at display.)

---

## 1. CURRENT STATE — what we hold

### 1a. The ingest pipeline

`ingest/pipelines/fema/` (Python dlt). **Do not edit — a live session owns it.** Cite only.

- `constants.py:1` — `NFIP_CLAIMS_URL = "https://www.fema.gov/api/open/v2/FimaNfipClaims"`
- `resources.py:_fetch_all_nfip_claims` (line 185) — paginates OpenFEMA `FimaNfipClaims`
  filtered to **`$filter=state eq 'FL'`** (national is 2M+ rows and 503s above ~900k
  offset; FL-only is ~400k). Pulls a **narrow `$select` of exactly the 16 fields** the
  normalizer reads, `$top=10000` per page.
- `resources.py:_promote_nfip_to_tier2` (line 124) — normalizes and writes the Tier-2
  table `data_lake.fema_nfip_claims`, `write_disposition="replace"`.
- **`replace_strategy="insert-from-staging"` (resources.py:176)** — a session just added
  this. dlt's postgres default `truncate-and-insert` empties the live table before/while
  inserting, so a run killed mid-load (GHA timeout/cancel) leaves it EMPTY with no atomic
  swap. `insert-from-staging` loads a staging table first and only swaps on success →
  a killed run leaves the live table untouched. This is the root-cause fix for the 07/14
  data-loss incident (check `fema_nfip_claims_data_loss_replace_strategy`).
- Volume/shape guards run BEFORE the destructive replace:
  - `assert_min_rows(len(rows), 403_542)` (resources.py:261) — FL-statewide claim-count floor.
  - `assert_vs_canonical(..., floor=0.95)` — new pull must be ≥95% of the current live count.
  - `reported_zipcode` non-null ≥ 50% (resources.py:136) and `flood_zone` (rated) non-null
    ≥ 50% (resources.py:153) — guards against a silent vendor field-name break nulling a
    whole column while the row count looks fine.
- Tier-1 cold archive: full raw CSV.gz → `raw-tabular-cold` bucket + `_tier1_inventory`
  pointer row, tagged `pack_id="env-swfl"`. Non-fatal (a Tier-1 failure never blocks Tier 2).

### 1b. Base table — `data_lake.fema_nfip_claims`

**Grain: one row per NFIP paid claim.** Scope: **all of Florida** (`state='FL'`) — the base
table is statewide; SWFL filtering happens downstream. 16 real columns (+ `_dlt_load_id`,
`_dlt_id` internal), verified live via `information_schema`:

| Column | Type | Notes / OpenFEMA source field |
|---|---|---|
| `id` | varchar (PK) | OpenFEMA `id` — **regenerated every refresh, no stable key → full replace, never incremental** |
| `year_of_loss` | bigint | `yearOfLoss` — primary time key |
| `date_of_loss` | date | `dateOfLoss` — real DATE; enables the Helene/Milton same-year split |
| `state` | varchar | always `FL` today |
| `county_code` | varchar | `countyCode` — **5-char FIPS** (the county join key) |
| `reported_city` | varchar | `reportedCity` |
| `reported_zipcode` | varchar | `reportedZipCode` — **5-digit ZIP** (the ZIP join key) |
| `flood_zone` | varchar | `ratedFloodZone` (zone rated at loss time — the stable, claim-tied value) |
| `flood_zone_current` | varchar | `floodZoneCurrent` (current FEMA-mapped zone; more redacted) |
| `occupancy_type` | bigint | `occupancyType` |
| `number_of_floors_insured` | bigint | `numberOfFloorsInTheInsuredBuilding` |
| `amount_paid_on_building_claim` | double | `amountPaidOnBuildingClaim` |
| `amount_paid_on_contents_claim` | double | `amountPaidOnContentsClaim` |
| `amount_paid_on_ico_claim` | double | `amountPaidOnIncreasedCostOfComplianceClaim` |
| `building_property_value` | double | `buildingPropertyValue` — feeds insurance-vs-NOI ratio |
| `building_damage_amount` | double | `buildingDamageAmount` |

**"Paid claims (B+C+ICO)" everywhere in this codebase means**
`amount_paid_on_building_claim + amount_paid_on_contents_claim + amount_paid_on_ico_claim`,
with each `COALESCE(...,0)`.

Join keys: `county_code` (FIPS), `reported_zipcode` (5-digit), `year_of_loss`, `date_of_loss`.

### 1c. Derived SQL views (NOT dlt-written)

Two plain Postgres views defined in `docs/sql/` and applied via `scripts/run-agg-migrations.py`.
They exist so consumers read ~200 pre-aggregated rows instead of paging the ~86k **SWFL-county**
claim rows (the ~400k statewide table filtered to the view's county set).

**`data_lake.fema_nfip_county_year`** (`docs/sql/20260623_fema_nfip_county_year_view.sql`)
- **Grain: (county_code, year).** Columns: `county_code`, `year` (= `year_of_loss`),
  `claim_count`, `paid_total_usd` (SUM of B+C+ICO).
- Filter: `state='FL' AND county_code IN ('12071','12021','12015','12043','12051','12115')`
  — **6 counties** (see the scope table below; this is a known leak).

**`data_lake.fema_nfip_zip_window_agg`** (`docs/sql/20260623_fema_nfip_zip_window_agg_view.sql`)
- **Grain: (zip, county_code) over a rolling 10-year window.** Columns: `zip`
  (= `reported_zipcode`), `county_code`, `paid_total_in_window_usd`, `claim_count_in_window`,
  `median_building_property_value_usd` (PERCENTILE_CONT 0.5), `window_end_year`.
- Window anchors on `MAX(year_of_loss)` computed INSIDE the view (`year >= max_yr - 9`), so
  it stays current as new data arrives with no code change. Same 6-county filter; ZIP must
  match `^\d{5}$`.

### 1d. Current row status (queried live 07/14/2026)

| Object | Live rows 07/14 | Notes |
|---|---|---|
| `data_lake.fema_nfip_claims` | **0** | emptied by the 07/14 killed run; schema intact; repopulating now |
| `data_lake.fema_nfip_county_year` | **0** | view over the empty base table |
| `data_lake.fema_nfip_zip_window_agg` | **0** | view over the empty base table |

Table and views EXIST (columns/grants intact). They return 0 rows only because the base
table is empty. Expect ~400k FL claim rows post-repopulation; ~200 county-year rows;
~120 SWFL ZIP-window rows.

### 1e. Scope by surface — READ THIS (grain + county coverage differ per surface)

The single most confusing thing about this data: **different surfaces cover different
counties.** FIPS: Lee=`12071`, Collier=`12021`, Hendry=`12051`, Charlotte=`12015`,
Glades=`12043`, Sarasota=`12115`. CLAUDE.md SCOPE (locked 07/07/2026): **core = Lee +
Collier, minor = Hendry; Charlotte/Glades/Sarasota are NOT real coverage.**

| Surface | Counties | FIPS | Scoped correctly? |
|---|---|---|---|
| `fema_nfip_claims` (base) | all FL | `state='FL'` | statewide by design; filter downstream |
| `fema_nfip_county_year` (view) | 6 | 12071,12021,12015,12043,12051,12115 | ⚠️ predates the 07/07 lock |
| `fema_nfip_zip_window_agg` (view) | 6 | same | ⚠️ view is 6-county; env-swfl re-scopes to core |
| env-swfl county-year fragments + SWFL $-rollup metrics | **6 (LEAK)** | reads the view UNFILTERED | ✗ includes Charlotte/Glades/Sarasota — see Known bug #2 |
| env-swfl per-storm totals (`storm_timeline`) | 3 core | 12071,12021,12051 | ✓ re-filtered `.in("county_code", SWFL_FIPS)` |
| env-swfl per-ZIP (`flood_by_zip`, top-6 metrics) | Lee+Collier core | `isCoreScope()` | ✓ `scopeZipWindowToCore()` |
| hurricane-tracks-fl (all metrics) | 3 core | 12071,12021,12051 | ✓ `SWFL_FIPS_SQL` in SQL WHERE |
| `lib/charts/hurricane-series.ts` chart | **5** | +Charlotte,+Sarasota | intentional, asterisked (operator request) |

---

## 2. WHO CONSUMES IT (the two brains)

### 2a. `env-swfl` — `refinery/packs/env-swfl.mts` (+ `refinery/sources/fema-nfip-source.mts`)

Reads BOTH modeled flood exposure (FEMA NFHL polygons, a different source) AND realized
flood loss (NFIP claims). The NFIP-derived metrics:

- SWFL-wide rollup metrics (from the `nfip-swfl-aggregate` fragment):
  - `swfl_storm_year_claims_usd` — cumulative B+C+ICO across named storm years
  - `swfl_nonstorm_claims_baseline` — median annual non-storm paid ("boring-times floor")
  - `swfl_storm_frequency` — named-storm-year count since 2000
  - `swfl_post_ian_claims_ratio` — latest complete year ÷ non-storm baseline
  - ⚠️ the three DOLLAR metrics above are computed over the **6-county** view (leak); the
    year-count is county-independent.
- Per-ZIP metrics (top-6 highest-AAL SWFL ZIPs, core-scoped) — 5 per ZIP:
  `swfl_zip_<zip>_flood_aal_usd_per_insured_property`, `_flood_aal_pct_swfl_rank`,
  `_barrier_island_score`, `_flood_cap_rate_adj_bps`, `_insurance_pct_typical_noi`.
  - **AAL formula** (`fema-nfip-source.mts:160`): `sum(B+C+ICO over 10-yr window) / 10 /
    (ZIP 2020 population × 0.30 NSI penetration proxy)`. The 0.30 is a v1 stand-in for real
    NFIP penetration — surfaced in a caveat; v2 replaces it with the OpenFEMA penetration
    dataset (see GET THE REST #1).
- Two detail tables (`env-swfl.mts:1105`+):
  - **`storm_timeline`** — one row per named SWFL hurricane: `year`, `paid_usd` (B+C+ICO),
    `date` (landfall). 3-core-county scope. 2024 split Helene/Milton by `date_of_loss` at
    `2024-10-09` (`HELENE_MILTON_SPLIT_DATE`).
  - **`flood_by_zip`** — one row per core SWFL ZIP with ≥1 claim in the 10-yr window:
    `aal_usd_per_insured_property`, `pct_rank`, `claim_count_in_window`, `county`.

### 2b. `hurricane-tracks-fl` — `refinery/packs/hurricane-tracks-fl.mts`

Cross-tier brain: NOAA HURDAT2 best-track (Tier-1 Parquet) **pre-joined in DuckDB** against
`pg.data_lake.fema_nfip_claims` (Tier-2 Postgres). Metrics:
`hurricane_landfalls_30yr`, `hurricane_cat3plus_passes_within_50mi_30yr`,
`hurricane_nfip_paid_per_landfall_storm_avg_usd`, `hurricane_worst_storm_county_year_nfip_paid_usd`,
`hurricane_most_recent_landfall_date`, `hurricane_closest_pass_5yr_min_mi`. 3-core-county scope.

**⚠️ This is the LIVE BUG the data fixes.** The SQL builds an `nfip_county_year` CTE and
**`LEFT JOIN`s** it, then **`COALESCE(nfip_paid_usd_storm_year, 0)`** (lines 141–175). When
`fema_nfip_claims` is empty (its current state), the HURDAT2 rows still survive the join and
every NFIP figure COALESCEs to **$0** — so the brain emits `nfip_paid_per_landfall_storm_avg =
$0` and `worst_storm_county_year = $0` that LOOK like real reads. Fabricated $0 flood metrics.
Repopulating the claims table is what makes these numbers real again.

---

## 3. FOR THE AI BUILDER (emails / PDFs / deliverables)

**There are two figure paths. Use the one that matches the surface.**

### Path A — a deliverable recipe (email/PDF): `fetchBrain(...)`

`lib/fetch-brain.ts` → `fetchBrain(slug, { tier })` returns
`{ text, freshness_token, output, display }`, where `output` is the parsed `BrainOutput`
(`.key_metrics`, `.detail_tables`). This is the exact helper the live recipes use — e.g.
`lib/deliverable/recipes/market-pulse.ts:753` does `fetchBrain("home-values-swfl", { tier: 2 })`
then reads `output.detail_tables`.

**To pull FEMA figures in a recipe:**
1. `const brain = await fetchBrain("env-swfl", { tier: 2 }).catch(() => null);`
   (for hurricane-storm figures use `"hurricane-tracks-fl"`).
2. Read a detail table, e.g. find the `storm_timeline` table in `brain.output.detail_tables`
   (`grain === "storm"`), or `flood_by_zip` (`grain === "zip"`), or read a `key_metric` by
   slug. **Never invent a row the table doesn't hold** — a ZIP/storm not present ships as an
   EMPTY slot, never a zero (this is the RULE 0.7 four-lane discipline).
3. Compute every count/ranking/relation IN CODE. If prose is involved, the narrator is handed
   settled sentences, never the raw rows (the market-pulse "claim gate" pattern —
   `lib/deliverable/claims.ts`).

**Citation string — use the real one, don't hand-write it.** Each detail table / key_metric
carries `source.citation`. For `storm_timeline` it is literally
(`env-swfl.mts:1138`):

```
OpenFEMA FimaNfipClaims via data_lake.fema_nfip_claims, FL, SWFL core counties
(FIPS 12071+12021+12051). Per-named-storm paid totals (building + contents + ICO).
2024 storms split by date_of_loss at Milton landfall (2024-10-09); null-date 2024
claims are excluded from per-storm rows. Storm-list reviewed 2026-05-17.
```

For customer display, run it through `publicCitation()` (`market-pulse.ts:273`, trims at a
`Tier N cache` boundary + keeps the source-naming sentence), and note the display layer
scrubs the internal `data_lake.*` table name to `[internal]`
(`refinery/render/speaker.mts:447`). The reader sees **"OpenFEMA FimaNfipClaims"** as the source.

> **Citation convention — important correction.** FEMA is a **named federal source**. The
> metric / detail-table `source.citation` on every NFIP figure names **"OpenFEMA
> FimaNfipClaims"** — that is the string a recipe should surface (via `publicCitation()`), not
> "SWFL Data Gulf". The house brand `SOURCE_BRAND = "SWFL Data Gulf"` (`speaker.mts:727`) is
> only the FALLBACK when a citation scrubs down to nothing. Do not relabel a FEMA figure's
> citation as "SWFL Data Gulf"; that hides the real, verifiable source.
> (Caveat: the `/r` brain-page path renders `m.sourceLabel ?? "SWFL Data Gulf"` in
> `lib/narratives/brain-inputs.ts` — if a metric's display `sourceLabel` ever resolves null,
> that page would show the house brand. The `source.citation` itself always names OpenFEMA; a
> null display `sourceLabel` on FEMA metrics is worth confirming when the brain rebuilds.)

**Concrete correct example (recipe):** a "SWFL storm-loss" email pulls the `storm_timeline`
row for Ian → renders `NFIP paid claims (B+C+ICO)` as a `currency` figure, captioned
`OpenFEMA FimaNfipClaims — per-storm paid claims · as of MM/DD/YYYY`. (For reference, the
committed 5-county storm series in `lib/charts/hurricane-series.ts`, verified live 07/09/2026,
has Ian 2022 = **$4,425,085,393 / 40,259 claims** — a real number, not invented; the brain's
3-core-county `storm_timeline` figure is the same claims filtered to Lee+Collier+Hendry.)

### Path B — the Email Lab grid builder: the NFIP concoction

`lib/concoctions/defs/nfip-storm-years.ts` is a `ConcoctionDef` (`id: "nfip-storm-years"`,
label "Flood claims by storm year") that queries **`data_lake.fema_nfip_county_year`
directly** via Supabase and exposes `county_code`, `year`, `claim_count`, `paid_total_usd`
with a `defaultLayout` (hero / bar image / list / sources). `sourceLine: "OpenFEMA NFIP
claims (county-year)"`. Filter by `countyCode` param (e.g. Lee `"12071"`). This is the
primitive the grid/visual builder binds — use it, don't re-query the lake by hand.

**Builder caveat while the table is empty:** Path A on `env-swfl` currently **throws** in live
mode (see Known bug #1) and Path B / the concoction returns 0 rows (its measure guards
`minDistinct: 3` will suppress it). Both degrade to "no FEMA figure available" — a recipe
should fall through to the generic author, never ship a $0.

---

## 4. FOR USER PAGES

- **Brain report pages `/r/[slug]`** — `env-swfl.md` and `hurricane-tracks-fl.md` each render
  as a live page through the display layer (`lib/narratives/brain-inputs.ts` →
  `toDisplayBrain`; metrics table `app/r/_components/metrics-table.tsx`). Fields to render:
  the NFIP key_metrics (§2a), the `storm_timeline` and `flood_by_zip` detail tables. Grain
  available: **SWFL-wide → per-county (Lee, Collier) → per-ZIP (top-6) → per-storm.** The
  page can never cite a figure it doesn't hold — facts come from the same display projection.
- **Flood-loss ZIP chart embed** — `app/embed/charts/page.tsx:26` `loadFloodZips()` reads
  `brains/env-swfl.md`, extracts the per-ZIP AAL metrics, and renders "Flood loss by ZIP" via
  `adaptFloodZipsToHBar` → `HBarChart`. Grain: ZIP; field: `aal_usd_per_insured_property`.
- **Hurricane damage chart** — `app/charts/page.tsx` renders `HurricaneRingChart`
  (`components/charts/HurricaneRingChart.tsx`) from `HURRICANE_STORM_DAMAGE`. Grain: per named
  storm; field: NFIP paid (B+C+ICO). 5-county, asterisked.
- **ZIP report `/r/zip-report/[zip]`** — `lib/zip-report/*` (`load-ranked-signals.ts`,
  `assemble.ts`, `candidates.ts`) surface flood as a ranked signal per ZIP.

**Four-lane provenance rule (renders on every surface):** fill a number from our data →
user's upload → named web source → user-supplied figure, **in that order, never invent.**
For flood, lane 1 is `data_lake.fema_nfip_claims` cited as OpenFEMA. NFIP is
**policyholder-only** — uninsured/non-NFIP losses are NOT in the archive; every flood surface
already carries that caveat and user pages must keep it.

---

## 5. FOR CHARTS

**Never say "can't chart."** If a shape isn't pre-wired, a **bar or a table is always
available** — the generic `ChartBlock` renderer (`refinery/lib/chart-adapter.mts`) has
`adaptToHBar` (bar) and `adaptToTable` (table fallback for any block), and `pickRenderer`
falls back to `table` for anything it doesn't recognize (`area`/`scatter` are table stubs today).

**Already-wired FEMA chart frames:**

| Shape | Frame | Where it lives | Grain |
|---|---|---|---|
| Flood AAL by ZIP (ranked bar, high AAL = coral/bearish) | `adaptFloodZipsToHBar` → `HBarChart` | `chart-adapter.mts:170`; live at `/embed/charts` | ZIP |
| NFIP paid by named storm (ring) | `HurricaneRingChart` ← `HURRICANE_STORM_DAMAGE` | `app/charts/page.tsx`; `lib/charts/hurricane-series.ts` | storm |
| Paid / claims by year (grid: hero + bar + list) | `nfip-storm-years` concoction `defaultLayout` | `lib/concoctions/defs/nfip-storm-years.ts` | county-year |
| Ranked-delta / generic bar | `bindRankedDeltaSpec`, `adaptToHBar` | `lib/deliverable/ranked-delta-bind.ts` | any detail table |

**Chartable shapes from what we hold today (all real, no new ingest):**
- **Claims-by-year / payout-by-year** time series — from `fema_nfip_county_year`
  (`paid_total_usd`, `claim_count` by `year`). Bar today; area once the area adapter lands.
- **Payout-by-ZIP** — `flood_by_zip` / `fema_nfip_zip_window_agg` → `adaptFloodZipsToHBar`. WIRED.
- **Payout-by-storm** — `storm_timeline` / `HURRICANE_STORM_DAMAGE`. WIRED.
- **Paid-by-county** — `fema_nfip_county_year` grouped by `county_code`. Bar or table.
- **Flood-zone mix** — count/paid grouped by `flood_zone` (rated zone). Table today.

Value-format hints (`formatChartValue`, `chart-adapter.mts:27`): `usd`, `aal` (`$X/yr`),
`percent`, `count`, `number`, `currency`. Flood uses `aal`.

---

## 6. GET THE REST — 5 more FEMA datasets to scope (NOT yet ingested)

National row counts verified live from the OpenFEMA API on **07/14/2026**. These are
**candidates, ranked by value for our SWFL buyer/agent audience** — do NOT build them here;
this section exists so the operator can green-light. **Brain-first gate:** no Tier-2 table
lands without its consuming `PackDefinition` in the SAME PR.

### #1 — `NfipResidentialPenetrationRates` — HIGHEST VALUE, SMALLEST INGEST
- **3,159 rows, county grain.** % of residential structures with an active NFIP policy.
- **Why it's #1:** it directly replaces the fabricated `0.30` NSI penetration proxy in the
  env-swfl per-ZIP AAL denominator (`fema-nfip-source.mts:161`) — the single biggest accuracy
  gap in our flood numbers, called out in an env-swfl caveat. County grain is coarser than our
  per-ZIP AAL wants (note that), but a real per-county penetration rate beats a flat statewide 0.30.
- **Consuming brain:** extend `env-swfl` (no new brain). **Small add.**

### #2 — `NfipCommunityStatusBook` — HIGH VALUE, SMALL/MEDIUM
- **25,119 rows, community grain.** NFIP participation status + **CRS class → flood-premium
  discount %** for each community.
- **Why:** CRS discount is a dollar a buyer/agent actually feels (5–45% off the flood premium),
  and it's a clean per-community lookup. Pairs naturally with the AAL surface.
- **Consuming brain:** `env-swfl` extension or a small new `community-flood-swfl` brain.
  **Small–medium.**

### #3 — `NfipMultipleLossProperties` — MEDIUM
- **240,263 rows, per-property.** Repetitive-loss structures (flooded repeatedly).
- **Why:** repetitive-loss = an agent red flag (uninsurable / premium-spiking). Distinct signal
  from paid claims. Larger table; FL-filter + aggregate at source.
- **Consuming brain:** new `repetitive-loss-swfl` or an env-swfl detail table. **Real build.**

### #4 — `FimaNfipPolicies` — HIGH VALUE, HEAVY INGEST
- **73.6M policy transactions.** The TRUE insured-property denominator (the proper v2 fix for
  the 0.30 proxy, at ZIP grain).
- **Why the caution:** 73.6M national rows is a heavy pull — MUST FL-filter + aggregate at
  source (mirror the claims pipeline's narrow `$select` + `$filter=state eq 'FL'`), never haul
  raw rows. Highest-fidelity denominator but the biggest lift.
- **Consuming brain:** `env-swfl` (v2 AAL denominator). **Real build.**

### #5 — `IndividualAssistanceMultipleLossFloodProperties` — MEDIUM/LOW
- **1.09M rows, per-property.** Repeat flood-damage properties under FEMA **Individual
  Assistance** (a different program than NFIP).
- **Why lower:** overlaps #3 conceptually but is IA, not NFIP — cross-program joins add framing
  risk, and IA is uninsured-owner aid, less directly a transaction signal for our audience.
- **Consuming brain:** new brain (kept separate from NFIP). **Real build.**

---

## 7. KNOWN BUGS / ACTION ITEMS (surfaced for central triage)

1. **Claims table is 0 rows (07/14 data-loss incident).** Root cause fixed
   (`replace_strategy="insert-from-staging"`, resources.py:176); repopulating. **Two distinct
   failure modes while empty:** env-swfl's live NFIP fetch **THROWS** (fail-loud — `fetchLive`
   errors on the county-year view returning 0 rows, and `assertClaimsNonEmpty` throws), whereas
   hurricane-tracks-fl silently emits **fabricated $0** NFIP metrics (LEFT JOIN + COALESCE to 0).
   Verify the served bytes after repopulation (a code fix isn't live until the brain rebuilds).
2. **Scope leak — the two SQL views + env-swfl SWFL $-rollup metrics cover 6 counties, not the
   3-county core.** The views (`docs/sql/20260623_*`) predate the 07/07/2026 scope lock and
   still filter `IN ('12071','12021','12015','12043','12051','12115')`. `fema-nfip-source.mts`
   `fetchLive()` reads the county-year view **without** an `.in("county_code", SWFL_FIPS)`
   re-filter, so Charlotte/Glades/Sarasota flow into `swfl_storm_year_claims_usd`,
   `swfl_nonstorm_claims_baseline`, and `swfl_post_ian_claims_ratio`. Per-storm totals, per-ZIP,
   and hurricane-tracks-fl are correctly 3-core (they re-filter). Fix candidate: narrow both
   views to `('12071','12021','12051')`, or re-filter in `fetchLive()`. **Open a `checks` entry
   (RULE 2.4).**
3. Stale comment: `resources.py:284` says "15-column"; the real shape is **16** columns
   (`_normalize_nfip` + `information_schema` both agree). Cosmetic.
