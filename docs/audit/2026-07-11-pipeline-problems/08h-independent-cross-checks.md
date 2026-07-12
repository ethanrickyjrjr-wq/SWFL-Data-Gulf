# 08h — Independent cross-checks (second-opinion agents)

**As-of:** 07/11/2026 · **Why this doc exists:** three research strands were re-run by a *second, independent* agent that did not see the first agent's answer. Where two independent agents agree, the finding is corroborated. Where the second found something the first missed, it is recorded here. **The `sql_expectation` cross-check below is the single most important finding of the entire research pass** — it kills a contract that would have shipped as a fake tripwire.

---

# 1. `sql_expectation` — INDEPENDENT ADVERSARIAL VERIFY

## VERDICT: contract A = **TOO-LOOSE / fatally broken (do not ship)** · contract B = band SOUND, structure INSUFFICIENT, and **not green on day one**

### 1a. The kill shot — contract A is a differential test against a copy of its own implementation

The proposed `land_drags_median_tripwire` recomputes a "correct" homes-only median and fires when the shipped median collapses below `0.5 ×` it. Run live: **52 joined rows, 0 fire.** The ratio column explains why:

| county | zip | shipped_median | homes_only_median | ratio |
|---|---|---|---|---|
| Collier | 34110 | 659,000 | 695,000 | 0.9482 ← min |
| Collier | 33971 | 337,900 | 320,000 | 1.0559 |
| Lee | 34110 | 1,599,500 | 695,000 | 2.3014 |
| Lee | 34119 | 4,147,500 | 689,900 | 6.0117 |
| *(all 48 others)* | | | | **exactly 1.0000** |

**49 of 52 rows have ratio identically 1.0.** The live view (`pg_get_viewdef`) is:

```sql
WHERE source_name='api_feed' AND state='active' AND sale_or_rent='sale' AND list_price IS NOT NULL
  AND (btrim(county) = ANY (ARRAY['Lee','Collier'])) AND property_type <> 'land' AND list_price >= 20000
```

The contract's `correct` CTE is a **byte-for-byte copy of that same WHERE clause**. It is not an oracle — it is the implementation compared against itself. `median < 0.5 × median` is **arithmetically unsatisfiable**. The three non-1.0 rows deviate only because of a *bug in the contract* (§1b).

### 1b. TOO-AGGRESSIVE vector (live today) — cross-county fan-out defeats the small-N guard

Three ZIPs exist under **both** counties (`34110`, `34119`, `33971`). The view groups by `(county, zip)`; the contract's CTE groups by **`zip_code` only**. `USING (zip_code)` therefore fans out — each county slice is compared against a median pooled across *both* counties, and `homes_cnt` is the **pooled** count:

| county | zip | view_cnt | homes_cnt (pooled) | passes `>=25`? |
|---|---|---|---|---|
| Lee | 34119 | **6** | 473 | **yes** ← guard bypassed |
| Lee | 34110 | **14** | 458 | **yes** ← guard bypassed |
| Collier | 33971 | **7** | 588 | **yes** ← guard bypassed |

A 6-listing slice median-tested against a 473-listing pool from a different county, small-N guard defeated. Today those slices sit high (6.01×, 2.30×, 1.06×) so nothing fires. Flip the mix — six ordinary Lee/34119 condos at ~$340k against Collier/34119's $689,900 pool → ratio 0.49 → **fires on a legitimate row.** The mechanism is live; only today's values keep it quiet.

### 1c. TOO-LOOSE — the known-bad rows contract A wrongly misses

**`property_type` is NOT vendor-supplied — it is DERIVED.** `extract_api.py:91-122` (docstring, verbatim): *"`/search` returns NO property-type field on any row (verified live 07/07/2026 against every real-estate endpoint) — property_type is a request-side FILTER only."*

```python
def map_property_type(raw): return PROPERTY_TYPE_MAP.get((raw or "").strip().lower(), "other")   # extract_api.py:69-70
...
if type_hint:                    ptype = map_property_type(type_hint)
elif beds is None and lot_sqft:  ptype = "land"
else:                            ptype = "other"
```

`PROPERTY_TYPE_MAP.get(..., "other")` **silently defaults any unmapped filter string to `'other'`** — never to `'land'`, never NULL, never an error. **This exact bug has already happened once:** `test_extract_api.py:64-65` — *"PROPERTY_TYPE_MAP was missing keys for the raw filter-value strings themselves."*

Simulating that label drift (land no longer tagged `'land'`), against live data:

| zip | homes_cnt | truth median | shipped after relabel | reality | **what contract A reports** |
|---|---|---|---|---|---|
| 33972 | 403 | 359,000 | **36,700** | ratio 0.102 — REAL CONTAMINATION | **ratio = 1.000, GREEN** |
| 33974 | 655 | 325,000 | **37,900** | ratio 0.117 — REAL CONTAMINATION | **ratio = 1.000, GREEN** |

**The original ~10× $35k bug returns in full, and the tripwire written to catch it reports green** — because the oracle applies the same `<> 'land'` predicate, which now matches nothing on either side. **Contract A has zero power against data drift. Its only power is against edits to the view's SQL — which a migration diff already catches.**

**It also guards only half the hotfix.** Simulating a `list_price >= 20000` floor-drop (land filter kept): **0 rows fire, min ratio 0.9482.** The 87 home-like sub-$20k rows move ZIP medians by **≤5%** — no median-ratio contract can ever guard that predicate.

**GROUPING SETS rows are unreachable.** The view emits 4 NULL-zip rows (2 county rollups, 1 grand total, plus a real 1-listing NULL-zip group); `USING (zip_code)` drops all 4 (`NULL = NULL` → no match). **County-grain medians are entirely unguarded.** *(Side finding: the view emits **two** `(Lee, NULL)` rows — the county rollup (14,032 listings) and a genuine NULL-zip listing (1) — indistinguishable without a `GROUPING()` flag. Real view defect.)*

### 1d. Contract B — the band is SOUND, but it is NOT green on day one

Run live, it returns **2 rows, not 0**:

```
zip_code | median_sold_price | median_rent_price | monthly_ratio
33920    |            88,750 |             3,900 |         22.76   <-- the proposal did not know about this one
33972    |            30,000 |             1,950 |         15.38
```

33920 (Alva) is a **true positive** of the same land-drag class (pre-hotfix it showed 124 listings / $26,750 median; post-hotfix only 19 homes / $359,000). Real upstream realtor.com contamination. **If doctor equates nonzero rows with failure, contract B is RED from commit #1** — seed these as known-accepted or the contract ships broken.

**Real live distribution — sold/rent monthly ratio, `market_details_swfl_latest`, n=49:**

| min | p5 | p25 | p50 | p75 | p95 | max |
|---|---|---|---|---|---|---|
| **15.38** | 86.72 | 116.88 | **136.82** | 176.09 | 229.75 | **253.66** |

The **50 floor is well-placed**: max-bad = 22.76, min-legit = 85.47 → it sits in a genuine **3.75× gap**. The **400 ceiling** has 1.58× headroom over max 253.66. Both defensible against the real distribution.

**But B's ceiling claim is false.** *"400 ceiling guards rent-column outage"* — the WHERE clause filters `median_rent_price IS NOT NULL AND > 0`, so an outage makes rows **vanish**, it does not trip the ceiling. **5 ZIPs already have NULL rent, 3 have NULL sold.** There is **no row-count floor**: if rent coverage collapsed from 49 ZIPs to 3, the contract returns 0 rows and reports **GREEN**.

**Monthly↔annual reconciliation — CONFIRMED exact.** `median_sold_price / median_rent_price / 12` equals the native `sold_to_rent_ratio` to 2dp on all 49 rows. The native column **is annual**. Monthly `[50, 400]` ≡ annual `[4.17, 33.33]`.

### 1e. CORRECTED contracts

**A — replace the oracle with a label-INDEPENDENT one (one change closes all three defects):**

```sql
WITH correct AS (   -- structural: land is beds-less AND sqft-less (6,802 of 6,806 land rows;
                    -- 0 of 5,629 condo, 0 of 526 townhouse, 1 of 12,687 single_family)
  SELECT btrim(county) AS county, zip_code,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY list_price) AS homes_only_median,
         count(*) AS homes_cnt
  FROM data_lake.listing_state
  WHERE source_name='api_feed' AND state='active' AND sale_or_rent='sale' AND list_price IS NOT NULL
    AND btrim(county) = ANY (ARRAY['Lee','Collier']) AND list_price >= 20000
    AND (beds IS NOT NULL OR sqft IS NOT NULL)        -- NOT property_type <> 'land'
  GROUP BY 1,2)
SELECT v.county, v.zip_code, v.median_list_price, c.homes_only_median, c.homes_cnt
FROM data_lake.listing_active_stats v
JOIN correct c ON v.county = c.county AND v.zip_code = c.zip_code   -- NOT USING (zip_code)
WHERE c.homes_cnt >= 25 AND v.median_list_price < 0.5 * c.homes_only_median;
```

Verified live: **0 rows today** (min ratio 0.9664 → 1.93× margin) — and **fires at 0.102 / 0.117 on 33972 / 33974 under the relabel the current contract sleeps through.** Joining on `(county, zip)` also drops the three thin slices (6/14/7) below `homes_cnt >= 25`, killing the cross-county false-positive vector. Keep `0.5`. Honest caveat: this trades one assumption (the `property_type` label) for another (beds/sqft presence) — but `beds`/`sqft` are **raw vendor fields**, so the oracle is genuinely independent of `PROPERTY_TYPE_MAP`, which is where the drift lives. Strict improvement, not perfect.

**A2 — the `list_price >= 20000` predicate needs its own ROW-LEVEL expectation** (no median contract can guard it). Today: **87 rows / 19 ZIPs** (min $1,800, median $11,900) — the known rent-mislabels. Report-only, sized and expected.

**B — keep the band `[50, 400]`, ship three amendments:**
1. **State that it fires on 2 rows on day one** (33972, 33920 — both true positives, upstream, unfixable by us). Seed as known-accepted.
2. **Add a companion coverage expectation** — `median_rent_price` non-null count ≥ 45 of 54 ZIPs (today 49). Without it, the band is satisfiable by having no data at all.
3. *(Free)* Assert `abs(sold_to_rent_ratio - (median_sold_price/median_rent_price)/12) < 0.05` — agrees on all 49 rows today, and catches the vendor silently changing the ratio's units.

---

# 2. Spine chunk — the contaminated writers (independent extraction)

**Zero Spine fields exist today** — grepping `workflow:` / `consuming_pack:` / `nightly:` / `min_rows:` / `coverage_exempt:` over all 1756 registry lines returns **0**. Every value below is *derived*, not read.

| pipeline | lane | workflow | consuming_pack | source_tag | evidence (file:line) | timeout | nightly |
|---|---|---|---|---|---|---|---|
| `crexi_listings` | tier-2-nondlt | `ingest-crexi-listings.yml` | `cre-swfl` | N/A (uses `source_name`) | `crexi_listings/distill.py:19` `_SOURCE_NAME="crexi"` | 30 | false |
| `brevitas_listings` | tier-2-nondlt | `ingest-brevitas-listings.yml` | `cre-swfl` | N/A | `brevitas_listings/distill.py:24` `_SOURCE_NAME="brevitas"` | 20 | false |
| `lee_associates_swfl` | tier-2-nondlt | `ingest-lee-associates-swfl.yml` | `cre-swfl` | N/A | `lee_associates_swfl/extract.py:33` | 15 | false |
| `estero_edc` | tier-2-nondlt | `ingest-local-cre-context.yml` | `cre-swfl` | N/A | `estero_edc/pipeline.py:27` | 15 | false |
| `fmb_recovery` | tier-2-nondlt | `ingest-local-cre-context.yml` | `cre-swfl` | N/A | `fmb_recovery/pipeline.py:28` `SOURCE_NAME="fmb_planning"` | 15 | false |
| `news_swfl` | **tier-2-dlt** (only one) | `news-swfl-ingest.yml` | **none** (app-surface) | **PHANTOM** `news_crawl` | registry `:1460`; **no literal in code** | 30 | false |
| `active_listings` | tier-2-nondlt | `active-listings-daily.yml` | **none — ORPHANED (D7)** | N/A | `active_listings/distill.py:20` `_SOURCE_NAME="active_listings_seed"` | 30 | true* |
| `listing_lifecycle` | tier-2-nondlt | `listing-lifecycle-daily.yml` | `active-listings-swfl` (via `listing_active_stats`) | N/A | `listing_lifecycle/constants_api.py:18` `API_SOURCE_NAME="api_feed"` | 60 | **true** (min_rows **28000**) |
| `market_aggregates_histogram` | tier-2-nondlt | `ingest-market-aggregates-histogram.yml` | `price-distribution-swfl` | **`realtor.com`** | `market_aggregates/constants.py:24` | 10 | false (**weekly**) |
| `market_aggregates_details` | tier-2-nondlt | `ingest-market-aggregates-details.yml` | `market-temperature-swfl` | **`realtor.com`** | `market_aggregates/constants.py:24` | 15 | false (**monthly**) |

### D7 — HEADLINE: `active_listings` is a daily writer whose table feeds NOTHING live

Registry `:1482` claims: *"Consumer brain: refinery/packs/active-listings-swfl.mts."*
Reality: `refinery/packs/active-listings-swfl.mts:232` → `sources: [activeListingsResidentialSource]` → `refinery/sources/active-listings-residential-source.mts:27` → `const VIEW = "listing_active_stats"` — which reads `data_lake.listing_state` filtered `source_name='api_feed'`, i.e. **`listing_lifecycle`'s output, not `active_listings_residential`.** The `SOURCE_ID = "active_listings_residential"` is a legacy *fragment id*, not a table read.
Corroborated twice: `lib/email/sole-spine.test.ts:8` `const DEAD_VIEW = "active_listings_residential"`, and `lib/landing/load-home-map-data.ts:13` ("…scraper table is ABANDONED here"). Matches `03` §4c independently.
**Net: a daily-scheduled writer (4 county crons) whose 38,728-row table feeds nothing live. `consuming_pack: none`. Needs a ship-or-delete decision, not a gate.**

### N2 — the nightly row gate must target `listing_state`, NOT `active_listings_residential`
Gating the dead table would guard a corpse while the real one silently empties. Floor: `listing_lifecycle` → `min_rows: 28000` (≈90% of the 31,709 api_feed count at registry `:1504-1506`).

### D12 — `market_aggregates_*` are NOT nightly
Histogram is **weekly** (`:13` `0 11 * * 1`), details is **monthly** (`:14` `0 13 4 * *`). They are contaminated writers but must **not** carry `nightly: true` or the night-chain row gate demands a daily landing that by design never comes. The four nightly sources are exactly the spec's: active-listings, listing-lifecycle, city-pulse, live-search.

### N3 — `source_tag` is the WRONG Spine field name for 8 of 10
The identity string `check_freshness.py` actually reads is **`source_name`** (`:238`, `:382` — both the freshness `MAX()` and the volume `COUNT(*)` are `WHERE source_name = %s`-scoped). **`source_tag` is read by NOTHING** in `ingest/scripts/` or `ingest/lib/`. `news_swfl`'s `source_tag: news_crawl` (`:1452`) is the *only* `source_tag:` field in the registry — and it is a phantom (no such literal in the code). This is exactly the class the spec cites (registry `:52-54`, `daily_truth` false-REDding for weeks). **The Phase-2 cross-check must verify WHICH COLUMN THE TARGET TABLE ACTUALLY HAS, not just that a literal matches.**

### N6 — an enum contract on `sale_or_rent` is vacuously green
Both `listing_state` writers hardcode it: `extract_api.py:139` `"sale_or_rent": "sale"` and `extract.py:144` `"sale_or_rent": "sale",  # Source B is for-sale only`. The rental contamination is a **price** signal, not a label signal. The contract must be a WHERE-scoped `range` on `list_price`, not an enum on `sale_or_rent`.

### D3 — `news_swfl` secret read but not wired (fails open silently)
`news_swfl/novelty.py:33` reads `os.environ.get("DATABASE_URL")`; `news-swfl-ingest.yml:45-46` sets only `DESTINATION__POSTGRES__CREDENTIALS`. On a runner `.dlt/secrets.toml` doesn't exist → `_get_conn()` raises → caught → `BASELINE_UNAVAILABLE` → `carry_first_seen` returns rows unchanged. **The novelty guard can never trip in CI.**

### Other drifts
- **D6** `crexi_listings` registry note says *"NOT YET ACTIVATED"* — contradicted by a live cron and 61 rows landed 07/05. It graduated; the note never flipped.
- **D8** `fmb_recovery`: registry says `cadence_days: 90` / *"GHA: monthly"*, workflow cron is monthly, header comment claims quarterly — **three sources, three answers**.
- **D10** `market_aggregates_*` carry a real `SOURCE_TAG = "realtor.com"` the registry omits entirely.
- **D11** `04-brains-consumers.md` over-lists one edge: `active-rentals-swfl` does NOT read `market_details_swfl` (single source → `rental_listing_stats`). `market_aggregates_details` → `market-temperature-swfl` **only**.

---

# 3. Reconciliation — registry vs workflows (independent count)

Pinned to committed `HEAD` (`915bd3c7`), not the working tree.

**The spec's `74 ↔ ~78 ↔ 77` is STALE. The real triple is `74 ↔ 75 ↔ 83 (79 firing)`.**

```
104  workflow files at HEAD
-12  no cron at all (ci, deptry, smoke-prod, heal-cron-failure, log-cron-incident, …)
= 92  contain a cron line
- 9  cron commented out (outreach-demo, outreach-drip, social-scheduler, watch-*, collier-permits, corridor-pulse…)
= 83  active cron in source
- 4  disabled_manually at the API DESPITE a live cron   <-- INVISIBLE TO BOTH SIDES
= 79  workflows that actually fire
```
Registry: **72 `pipelines:` + 3 `not_yet_running:` = 75.** Census = **74** → delta is exactly `leepa_parcel_zip` (added by `fd271022` *after* the census snapshot). **The census is one entry stale, not wrong.**

**63 ingest workflows cover 69 entries** (5 are many-to-one: `marketbeat-pdf-ingest`→3, `bls-oews-annual`→2, `ingest-fl-dbpr-licenses`→2, `ingest-local-cre-context`→2, `live-search-daily`→2). **72 vs 63 is structure, not error.**

### The class NEITHER side can see — 4 workflows with live crons that never fire
`gh workflow list --all`: `dbpr-sirs-monthly`, `fgcu-reri-monthly`, `marketbeat-pdf-ingest`, `rsw-airport-monthly` are **`disabled_manually`** while their YAML still carries an uncommented cron. **They orphan 6 registry entries** (`dbpr_sirs_submissions`, `fgcu_reri_indicators`, `marketbeat_swfl`, `colliers_industrial`, `mhs_databook`, `rsw_airport_monthly`) — and both registry and YAML claim they're scheduled. **A `gh workflow enable` resumes them instantly with no code-level guard.**

> **SCOPE BOUNDARY — load-bearing.** Spec §6 `--static` reads workflow **files**; `--live` reads **`data_lake`**. *Neither reads `gh api .../workflows[].state`.* These 4 therefore pass **both** Phase-2 modes clean. **Do NOT assign this class to Phase 2** — it belongs to the §7 3a manifest's `disabled` field (`scripts/build-watch-lists.mjs`), the only artifact that can see it. Getting this wrong is the tempting error right after finding them.

### `usgs_tier2` is a ZOMBIE — the registry names a writer that does not exist
Registry claims `dlt_schema_name: usgs` / `count_table: data_lake.usgs_daily`. The only USGS workflow runs `ingest.duckdb_pipelines.usgs.pipeline`, which writes **Tier-1 Parquet only** (its own comment: *"Avoids the post-ingest psycopg2 UPDATE that the old dlt pipeline needed"*). **There is no `ingest/pipelines/usgs/`.** The Postgres table has been frozen since 2026-05-19 — yet `env-swfl.mts` **reads it live**, and it reads FRESH only because 30d × 2.0 tolerance = 60d hides it. **A pure freshness check misses this. The Phase-2 assertion must be "some pipeline WRITES this table", not "the table is recent."**

### `parcel_subdivision` — confirmed zero-coverage
Real dlt pipeline (`ingest/pipelines/parcel_subdivision/`, `write_disposition="merge"`), **220,875 rows, last load 2026-07-06**, zero registry mentions, **no workflow references it — it runs by manual dispatch only.** Invisible to a workflow-file scan by definition; only a dir⇄registry⇄workflow three-way join catches it.

### `coverage_exempt:` must exist as a real field
Otherwise the zero-coverage check false-floods on `data_lake.view_vintages` (written by `view-vintages-monthly.yml`, a derived snapshot), `public.data_targets`, `social_pulse_scans`, and the 5 tables named only in the registry's **prose** exclusion block (`:1705–1770`) — which is **comments, not machine-readable**. Phase 2 must promote that block to structured `coverage_exempt:` entries or it cannot tell *"real source gap (`parcel_subdivision`)"* from *"intentional non-source write."*

### What Phase-2 `--live` must assert
1. **Uncovered live lake table → RED** — must fire on `parcel_subdivision` (220,875 rows); must NOT fire on the 426 dead `leepa_t2_*` / `collier_parcels_t2_*` hash-churn schemas.
2. **Ghost registry target → RED** — `redfin_city_swfl` (a dry-run writes nothing).
3. **`dlt_schema_name` never landed → RED** — same case from the dlt side; also flushes `news_swfl`'s dead `dlt_schema_name: data_lake`.
4. **Row floor → RED** — `dbpr_re_licensees` (0 rows vs floor 15,000).
5. **Zombie entry (registry names a writer no code path executes) → RED** — `usgs_tier2`.
6. **`coverage_exempt:` field must exist** or (1) false-floods.

**Phase-2 `--static` additionally:** `workflow:` resolves to a file that exists **and that file has an uncommented `cron:`**, else the entry must carry `parked:`/dispatch-only. That one rule fires on `collier_permits`, `city_pulse_corridors`, `city_pulse_corridors_tier2`, and inversely on `sba_foia_franchise_outcomes` (parked entry, **live** workflow firing Jul 15).
