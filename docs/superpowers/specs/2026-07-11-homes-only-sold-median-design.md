# Homes-only county-deed sold median per ZIP (Lee now, Collier fast-follow)

**Date:** 2026-07-11 · **Build slug:** `homes-only-sold-median` · **Live-verify check:** `homes_only_sold_median_live_verify`

Part of the 2026-07-11 pipeline-fixing effort (`docs/audit/2026-07-11-pipeline-problems/`). This spec
carries two payloads the operator asked for together:

1. **The build** — a homes-only sold median per ZIP computed from county deed records (real recorded
   sales, filtered to residential-improved use codes, arm's-length, 2024+). Lee ships now; Collier is a
   documented fast-follow gated on repairing its source.
2. **Source→ingest→brain coverage documentation** — for every source/pipeline/brain this build touches,
   what the source *could* give us vs what we *do* take vs what the brain *consumes*, plus freshness and
   known breakage. Operator directive (07/11): *"data doesn't equal green. The right data equals green.
   We need to know everything we could get from the source and everything we do get. Each pipeline and
   brain and source needs to be well documented so we can track problems easily."*

---

## 0. Premise correction (live evidence broke the original framing)

The kickoff framing was: *"one missing column per county — Lee has the sale price but no ZIP, Collier
has the ZIP but no sale price; both are fields we already pull, so it's finishing an ingest we already
run."* Live verification (all 07/11/2026) inverts this on both sides:

| | Original framing | Live reality (verified 07/11) |
|---|---|---|
| **Lee** | "has sale price, missing the ZIP column" | Sale price **already ingested and populated** (528,130/548,798 = 96%). ZIP is **not a column anywhere in the LeePA source** — no situs/address field on any of the 24 ParcelInfo MapServer layers, only parcel geometry. "Add the ZIP" means **derive** FOLIOID→ZIP (net-new), not finish a column. |
| **Collier** | "the easy add — one field on a pull we already run" | The pull we already run is **broken**. The FDOR Cadastral FeatureServer was republished and now **400s on every attribute-field WHERE** (`CO_NO=21`, `DOR_UC='01'`, `SALE_YR1>=2024`); only `where=1=1` works. `collier_parcels` silently no-ops (last real load 2026-06-06). Adding `SALE_PRC1` can't happen until the source is repaired. |

So the "easy" county (Collier) is the blocked one, and the "needs new work" county (Lee) already has
its data live. **Scope decision (operator, 07/11): Lee now, Collier fast-follow.**

---

## 1. Verified evidence (everything we could get vs everything we do get)

All results are live, 07/11/2026 — LeePA ParcelInfo MapServer + FDOR FeatureServers via direct
`requests` GET/POST (crawl4ai's browser render mangles multi-param REST query strings; a direct GET to
the same live vendor endpoint is the correct tool and is still vendor-first verification), and the
Supabase lake via the lake MCP.

### 1a. LeePA ParcelInfo MapServer (Lee source for `leepa_parcels`)

`https://gissvr.leepa.org/gissvr/rest/services/ParcelInfo/MapServer` — 24 layers, every layer keyed by
`FOLIOID` + `SHAPE` (polygon geometry) + its value fields. **No layer carries a situs/address/ZIP
field** (checked 0/9/10/12/23; the rest are value-label/land-type/delinquent-tax layers).

| What the source could give | What we ingest (`leepa_parcels`) | What the brain consumes (`properties-lee-value`) |
|---|---|---|
| L9 use code (`Code`,`Description`); L10 last qualified sale (`Amount`,`DoS`,`Instrument`,`ORBookPage`); L12 value bundle (`Just`,`Market`,`Assessed`,`Taxable`,`SOHCap`,`Building`,`Land`,`CapDifference`); **L23 Comparable Sales** (`SalePrice`,`SaleYear`,`SaleMonth`,`DeedType`,`dorcode`,`BedRooms`,`Bathrooms`,`YearBuilt`,`GrossArea`,`Pool`,`ImpCode`); parcel **geometry** (SHAPE, every layer) | `folioid, just_value, market_value, assessed_value, taxable_value, soh_cap, building_value, land_value, cap_difference, use_code, use_description, last_sale_amount, last_sale_date, last_sale_instrument, last_sale_book_page` (L9+L10+L12 joined on FOLIOID) | `folioid, just_value, taxable_value, cap_difference, last_sale_date, use_code` → sales-velocity z-score + SOH-gap median. **Does NOT read `last_sale_amount`.** No ZIP. |

**Gaps / findings:**
- **`last_sale_amount` is populated (96%)** — the pack's own caveat *"LeePA last_sale_amount is null"*
  (`properties-lee-value.mts:400`) and memory `leepa-no-sale-price` are **stale/wrong**. Fix both.
- **No ZIP in the source at all** → Lee ZIP requires derivation (see §4).
- **L23 (Comparable Sales) is unused** and richer than L10: it carries `SalePrice`, `BedRooms`,
  `YearBuilt`, `GrossArea`, `dorcode` per FOLIOID — a future price-per-sqft / bed-count lane. Not
  ingested. Documented for the roadmap, not built here.

**Live reproduction of the target number** (proves the data is real and homes-only is separable):

```
leepa_parcels, last_sale_date >= 2024-01-01 AND last_sale_amount > 20000, by use_code:
  01 SINGLE FAMILY RESIDENTIAL  44,578 sales  median $385,000
  04 CONDOMINIUM                10,879 sales  median $295,000
  00 VACANT RESIDENTIAL         17,612 sales  median  $50,000   <- the land that poisons a blended median
  02 MOBILE HOME                 1,966 sales  median $149,000
  08 MULTI-FAMILY <10            1,614 sales  median $487,750
```

### 1b. FDOR Statewide Cadastral (Collier source for `collier_parcels`)

`.../Florida_Statewide_Cadastral/FeatureServer/0` — the NAL-joined annual tax roll, all 67 counties
(10,831,924 rows statewide as of 07/11).

| What the source could give | What we ingest (`collier_parcels`) | What the brain consumes (`properties-collier-value`) |
|---|---|---|
| `PARCEL_ID, CO_NO, DOR_UC, PA_UC, JV, JV_HMSTD, AV_HMSTD, AV_SD, AV_NSD, TV_NSD, ` **`SALE_PRC1, SALE_YR1, SALE_MO1, SALE_PRC2, SALE_YR2, SALE_MO2, QUAL_CD1, VI_CD1`**`, PHY_ADDR1, PHY_CITY, `**`PHY_ZIPCD`**`, OWN_ZIPCD, FIDU_ZIPCD, …` (SALE_PRC1/PHY_ZIPCD confirmed present in the field list) | `parcel_id, jv, jv_hmstd, av_hmstd, av_sd, av_nsd, tv_nsd, sale_yr1, sale_mo1, qual_cd1, vi_cd1, phy_zipcd, dor_uc, pa_uc` — **`SALE_PRC1` is omitted from `OUT_FIELDS`** | parcel count + SOH gap median; per-ZIP detail table (`collier_parcels_by_zip`, off `phy_zipcd`). No sale price. |

**Gaps / findings:**
- **`SALE_PRC1` exists at source but is not in our `OUT_FIELDS`** — the one field Collier's sold median
  needs. But:
- **The source is query-locked.** `where=1=1` → 200 (10.8M rows); `CO_NO=21`, `DOR_UC='01'`,
  `SALE_YR1>=2024`, even `CO_NO IS NOT NULL` → HTTP 200 body `error 400 "Unable to perform query"`.
  `collier_parcels` filters `where=(CO_NO=21) AND OBJECTID>-1`, which now 400s → 0 features → aborts,
  keeps the 2026-06-06 load. **Tracked: `collier_parcels_fdor_query_lockdown`.**
- `phy_zipcd` is 100% populated in the existing `collier_parcels` (290,973 rows) — Collier's ZIP is
  already done; only the sale price is missing.

### 1c. FDOR Statewide Parcel Centroid (working Collier source for `parcel_subdivision`)

`.../Florida_Statewide_Parcel_Centroid_Version/FeatureServer/0` — a **different** FDOR layer than the
cadastral. `parcel_subdivision` (Collier-only, 220,875 home rows, 100% zip, fresh 2026-07-06) pulls it
with a pattern that survives the lockdown: **`returnIdsOnly=true`** (all OBJECTIDs in one call) then
fetch by **`objectIds`** in ~250-id batches (no `where`/`orderBy`/`resultRecordCount` — the shapes that
400). Carries `PARCEL_ID, S_LEGAL, DOR_UC, JV, PHY_ADDR1, PHY_CITY, PHY_ZIPCD`. **Whether it also
exposes `SALE_PRC1` is unverified** — a probe for the Collier fast-follow.

**Cross-layer fact (documented in this pipeline's constants, load-bearing for us):**
**Lee = `CO_NO=46`, and it is a broken partition on _both_ statewide FDOR layers** — "count works,
records don't (400)." So neither FDOR layer can supply Lee parcel rows. Lee ZIP cannot come from FDOR.

### 1d. Canonical home-type taxonomy (reuse, don't reinvent)

`parcel_subdivision/constants.py::DOR_HOME_TYPE` is the existing authority for "what is a home":

```
001 single-family · 002 mobile · 004 condominium · 005 cooperative · 007 misc-residential · 008 duplex-small-multifamily
```

FDOR uses 3-digit zero-filled codes (`001`); LeePA `leepa_parcels.use_code` uses 2-digit (`01`). The
mapping is `int(code)` — `'01'`↔`'001'`, `'04'`↔`'004'`. This build reuses this set as the home
definition ("one authority for a shared concept"), with **SF (01) + condo (04) as the headline pair**
and the full set available. Vacant residential (`00`/`000`) is explicitly excluded — it is the land
that collapses a blended median.

---

## 2. The "right data = green" principle (verification, not just presence)

Codify the operator's rule as this build's acceptance standard and a note for the pipeline-fixing effort:

> A check is green only when the **right** data is present — not merely when rows exist or a freshness
> timer hasn't tripped. Presence ≠ correctness.

Concrete illustration this build surfaced: `collier_parcels` reads **FRESH (35 d)** to the freshness
probe (`03-lake-live-state §1c`) purely because the 60-day tolerance hasn't expired — yet its source is
broken and it *cannot* refresh; it flips STALE ~08/05 with no one having touched the root cause. Green
timer, wrong (frozen) data. This build's live-verify (§6) asserts **correctness** (homes-only median at
a land-heavy ZIP reads ~$355k, not ~$35k; per-ZIP min-N respected; as-of correct), not row presence.

---

## 3. The build — Lee homes-only sold median per ZIP (ships now)

**Source:** `data_lake.leepa_parcels` (already live; no re-ingest of value/sale/use layers needed).

**Aggregate at source** (per `ingest/CLAUDE.md`): a Postgres view
`data_lake.leepa_sold_median_by_zip` computes the median in SQL; the pack is a pure reader. Mirrors the
existing `collier_parcels_by_zip` detail-table pattern in `properties-collier-value.mts`.

**Homes-only filter (row eligibility):**
- `use_code IN ('01','04')` for the headline metric (SF + condo); full home set (`01,02,04,05,07,08`)
  available as a broader variant. Vacant/commercial/land excluded.
- **Arm's-length:** LeePA L10 is already "Last Qualified Sale" (non-qualified transfers absent), PLUS a
  price floor `last_sale_amount > 20000` to drop the 7.9% nominal-consideration tail ($1–$9,999
  quitclaim/family transfers, confirmed in audit §4d). ">$20k" is a **price floor, not the qualified
  filter** — both apply.
- **Recency:** `last_sale_date >= '2024-01-01'`. This is each parcel's **latest** qualified sale (1
  row/parcel), so it is a *stock of most-recent sale prices*, **not a transaction-flow median** — a
  parcel that sold twice in 2024 contributes once. Stated as a caveat (this is *why* it differs from an
  MLS period median).

**Grain + robustness:**
- Per **ZIP** (requires FOLIOID→ZIP, §4) with a **county fallback**.
- **Per-ZIP min-N gate:** a ZIP with fewer than **N=20** qualifying sales never reports a raw
  small-sample median — its cell shows the **county median, explicitly flagged as a county fallback**
  (not silently substituted). N is a documented constant.
- **As-of:** stated per county, MM/DD/YYYY, once (RULE 5) — Lee is continuous (LeePA refreshes ~monthly);
  Collier (when it lands) is annual. Never mix them into one as-of.

**Brain wiring (`properties-lee-value`):**
- New key metric `lee_sold_median_homes_only` (county-level, `variable_type: intensive` — a price
  level, `display_format: currency`) + a `detail_tables` entry `lee_sold_median_by_zip` (columns: ZIP,
  home sales n, median sale, as-of), mirroring `collier_parcels_by_zip`.
- Source citation says **"Lee County Property Appraiser (recorded deeds)"** — no vendor/MLS id
  (`listing-citations-say-swfl-data-gulf` convention; this is our own county-records lane).
- **G3:** the consuming metric + view ship in the **same PR** as any new column.
- Register every new emitted vocab slug in `brain-vocabulary.json` in the **same commit** (Gate 2/5).

---

## 4. Lee ZIP derivation (the one net-new component)

**Requirement:** a `FOLIOID → zip_code` mapping for Lee parcels, **site ZIP only** (G1 — never
`OWN_ZIPCD`/mailing). FDOR is out (Lee partition broken, §1c). Two candidate mechanisms; the
implementation plan probes and picks primary, but the spec commits to the robust fallback existing:

- **(A) LeePA situs/address export**, if one exposes a site ZIP keyed to FOLIOID (LeePA is the property
  appraiser and holds situs; the ParcelInfo MapServer doesn't surface it, but a LeePA data download /
  CAMA export or a sibling service may). Cheapest if it exists — a table join like Collier's
  `phy_zipcd`. **Probe first.**
- **(B) Centroid → ZCTA spatial join** (robust fallback, no external dependency): pull LeePA parcel
  centroids (L12 `SHAPE`, keyed by FOLIOID) and point-in-polygon against Census TIGER ZCTA boundaries
  (free, public). Produces `data_lake.leepa_parcel_zip` (FOLIOID, zip_code, method='centroid_zcta').
  Deterministic, ours, no rate limit.

This mirrors the intent of the never-built `lee_parcel_subdivision` (follow-up F1) — if that lands, it
becomes source (A). Either way the output is a FOLIOID→ZIP crosswalk the median view joins on.

---

## 5. Collier fast-follow (documented now, built later — tracked, not in this PR)

Blocked on `collier_parcels_fdor_query_lockdown`. Repair path, in order of preference:
1. **Switch `collier_parcels` retrieval to the working `returnIdsOnly` + `objectIds` pattern** already
   proven in `parcel_subdivision` — and probe whether the Cadastral or Centroid layer still serves
   `SALE_PRC1` that way. If the Centroid layer carries `SALE_PRC1`, Collier's price + zip + use come
   from one working source.
2. **FDOR bulk-file download** (shapefile/GDB export item referenced in the layer description) → local
   filter. Sidesteps the query surface entirely; matches "a county records file rate-limits nothing."

Then: add `SALE_PRC1`→`sale_price` to the Collier ingest (+ Tier-2 column), build
`collier_sold_median_by_zip` off `phy_zipcd` (already present) with the identical homes-only /
arm's-length / min-N logic, wire into `properties-collier-value`. Collier's ZIP is already done — only
the sale price is missing.

---

## 6. Verification — what "green" means for this build

Live-verify (`homes_only_sold_median_live_verify`) closes only on live proof, not row presence:
1. **Homes-only correctness:** a land-heavy Lee ZIP (e.g. 33972 Lehigh Acres) returns a homes-only sold
   median in the **~$355k** band (SF reality), **not ~$35k** (the land-blended number the active-listing
   path still ships, §7). This is the whole point of the build.
2. **Min-N respected:** no ZIP with < 20 qualifying sales reports a raw ZIP median.
3. **Provenance + as-of:** citation reads "Lee County Property Appraiser (recorded deeds)"; as-of is Lee's
   snapshot date, MM/DD/YYYY, stated once; no internal ids/§/tokens in the customer-facing string
   (display-leak / speaker-hygiene).
4. `bunx next build` green; pack `bun:test` + `catalog.test.mts` green (Gate 5).

---

## 7. Related / tracked (per "track everything")

- **`collier_parcels_fdor_query_lockdown`** (opened) — broken Collier source; the "FRESH-but-frozen"
  false-green; repair path in §5.
- **`active_listing_median_land_blend`** (opened) — `listing_active_stats` blends land into the active
  "median asking price" (33972 → $35k vs $355k SF); no `property_type` filter (audit §4a). This is the
  **active-asking** land-blend, a sibling of the **sold**-median this build fixes. The interim guard the
  kickoff referenced = a `property_type` filter on `listing_active_stats`. **Decision to confirm with
  operator:** fix that filter as part of this build, or keep it as its own tracked task. (Recommend: its
  own task — different table, different brain, different PR; this spec fixes the sold side.)
- **Stale docs to correct in-PR:** `properties-lee-value.mts:400` caveat + memory `leepa-no-sale-price`
  (both claim `last_sale_amount` is null — it isn't). Fix `collier_parcels_by_zip`'s stale
  "6-county footprint" note if the pattern is templated (SCOPE is Lee+Collier, minor Hendry).
- **Roadmap (documented, not built):** LeePA L23 Comparable Sales (price/sqft, beds, year-built);
  never-built `lee_parcel_subdivision` (F1).

---

## 8. Out of scope (YAGNI)

- Repeat-sales / transaction-flow medians (LeePA snapshot is 1 row/parcel — impossible from this source).
- Any new mandatory pre-materialization gate (C2) — this extends existing seams (a view + the existing
  pack + the existing detail-table pattern).
- Charlotte/other counties — SCOPE is Lee + Collier (minor Hendry).
- Fixing `collier_parcels` in this PR — it's the fast-follow, tracked separately.
