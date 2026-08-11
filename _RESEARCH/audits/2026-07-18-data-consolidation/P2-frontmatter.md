<!-- ====================================================================== -->
<!-- READ THIS FIRST — paste at the TOP of docs/standards/data-roots.md.     -->
<!-- The 1592-line catalog below is the searchable backing; this is the map. -->
<!-- ====================================================================== -->

# READ THIS FIRST — "where's the authority for X?" in 30 seconds

You are about to answer a data question or wire a consumer. **Do not grep for a table and read
the first one you find** — that is exactly how the same claim renders 2–14× apart across our
surfaces. Find the concept below, read its **recommended root**, route through its **brain**.

> **These picks are RECOMMENDATIONS from the 2026-07-18 lineage audit — NOT ratified architecture.**
> Declaring any source "the authority" is a C1/C2 architecture decision that needs operator
> sign-off. Everything tagged **[NEEDS-SIGN-OFF]** is a ratification-ready recommendation, not a
> settled fact. The catalog below still says "IS a root" in places; treat those as the audit's
> recommendation too until signed off. Source of the picks: `data-authority-map.md` ("Recommended
> authority by concept") + the DAILY/WEEKLY/MONTHLY/ANNUAL band lists in this file.

---

## How to answer a data question (the flow)

1. **Is it a SWFL question?** (economy, real estate, permits, traffic, tourism, flood, corridor,
   county→ZIP.) No → answer normally, no lake framing. Yes → continue. Hard guard: never invent a
   SWFL number finer than ZIP grain.
2. **Fetch the master brain, speak view:**
   `https://www.swfldatagulf.com/api/b/master?view=speak&tier=2&v=5`.
   **Quote its `freshness_token` verbatim** in your first response — that is your proof it's live.
3. **Master routes you to a named leaf brain.** Fetch THAT leaf at the same tier — don't answer
   detail off master's summary.
4. **Need the underlying number or you're WIRING a new consumer?** Read the **registered ROOT**
   (table/view) for the concept from the table below — **never a raw base table**, never the first
   table your grep turned up. One root per concept per cadence.
5. **Read rates as written** (never recompute a rate from raw counts). Tag projections `[INFERENCE]`
   with the audited base + one falsifier. No smoothing.

**Anti-patterns — each of these has already burned a real surface:**
- Reading a **corpse**: `active_listings`, `active_listings_residential`(+`_zip_stats`) feed nothing.
- Wiring by a source's **NAME string**: the `active-listings-swfl` brain's `SOURCE_ID` *says*
  `active_listings_residential` but actually reads `listing_active_stats`. Wire by data, not name.
- Trusting an **aggregate DOM** today (63% of the active book is a censored `first_seen` floor).
- **Conflating the four value notions** (assessed ≠ list ≠ sold ≠ index — they diverge 3–14× per ZIP).
- Calling **ZHVI a "median"** (it's a typical-value INDEX).
- Using **momentum's all-types count** as "active listings" (it carries ~7,300 land parcels, ~3.2× high).
- Interchanging **list-side and sold-side DOM** (different questions, different roots).
- Grabbing **`market-temperature-swfl` for market temperature** — it's misnamed (see traps below).

---

## Decision table — CONCEPT → recommended ROOT → BRAIN → DO-NOT-READ  **[NEEDS-SIGN-OFF]**

Cells are terse on purpose; the "Traps" list below and the catalog carry the detail. "no single
brain" = a view/spine read directly by many surfaces, not owned by one pack (do not invent an owner).

| Concept | Recommended root (view/table) | Brain that carries it | DO-NOT-READ (dead / dup / wrong) |
|---|---|---|---|
| **DOM — per-listing, list-side** | `listing_dom` view (`lib/listings/dom.ts formatDom`) | no single brain — read by /r/how-long-has-it-sat, should-i-sell, chat comps, homepage map, email (data-roots:130-132) | `listing_state.days_on_market` (0% pop) · `listing_active_stats.avg_days_on_market` (NULL) · `listing_active_homes.days_on_market` (NULL) · `active_listings_residential`(+`_zip_stats`) (corpse) · `market_details_swfl.median_days_on_market` (realtor dup) — **T1** |
| **DOM — market-typical, list-side (history)** | `listing_dom_historical` 🔴 not built → ONE external: `market_heat_swfl` (realtor, ZIP×month + YoY) | market-heat-swfl | don't interchange w/ sold-side |
| **DOM — sold-side** | `redfin_swfl.median_dom` | housing-swfl | never interchange w/ list-side |
| **Value — assessed / just value** | `leepa_parcels` (Lee) · `collier_parcels` (Collier) | properties-lee-value · properties-collier-value | per-ZIP assessed answerable for Collier, NOT Lee (real asymmetry, not a dead source) |
| **Value — list / asking price** | `listing_state.list_price` (median-by-zip) | no single brain (list spine) | `active_listings_residential` asking median (stale seed — `price_source_wire_off_stale_seed_table`) |
| **Value — sold / recorded-sale** | **no single source** — grain+vendor dependent: `redfin_lee`/`redfin_collier`, `redfin_city_swfl` (city), LeePA/FDOR deeds | properties-value brains / housing-swfl | don't treat any one as canonical — **pick per surface + LABEL it** |
| **Value — home-value INDEX** | `zhvi_*` (Zillow ZHVI) | home-values-swfl | label **"typical home value," NEVER "median"** (live bug `market-context.ts:65`) — **T2** |
| **Price cut — EVENT (per-listing)** | `listing_transitions.price_delta` (forward-only) | no single brain (rollups: `listing_pulse_daily`, `listing_transitions_recent_zip_stats`) | — |
| **Price cut — SHARE (area)** | `listing_momentum_stats.price_reduced_share` (**0–100**) | listing-momentum-swfl *(carrier unverified — verify before asserting)* | `market_details_swfl` (has no cut field) — **T3** |
| **Active inventory count — for-sale HOMES** | `listing_active_stats.listing_count` (homes-only, Lee/Collier) | active-listings-swfl | `listing_momentum_stats.active_listing_count` (all-types, +~7,300 land, ~3.2×) · `active_listings_residential`(+`_zip_stats`) (dead) |
| **Rent — INDEX (monthly)** | `zori_*` (Zillow ZORI) | *carrier unverified* — consumers: investor-zip-swfl (inside yield calc) + email reads `zori_zip_latest` direct (bypass) | don't conflate w/ the weekly own-sweep |
| **Rent — our own inventory (weekly)** | `rentals_swfl` | active-rentals-swfl | live bug: `_latest` view is Collier-only, drops Lee (`rentals_latest_view_completeness_guard`) |
| **Rent — yield** | generic → realtor sold-to-rent (via market-temperature-swfl) · investor → `investor-zip-swfl.gross_rent_yield_pct` (ZORI×12 ÷ ZHVI) | market-temperature-swfl (generic) · investor-zip-swfl (investor) | 3 rent numbers/ZIP disagree up to ~7× — LABEL which |
| **Market-state / "temperature"** | recommended: `market-heat-swfl` (YoY verdict) | market-heat-swfl | **`market-temperature-swfl` — MISNAMED, emits rent-yield NOT heat** · momentum + 2 others = neutral `0` reporters — **T4** |
| **Seller-stress verdict** | seller-stress-swfl (2019–21 z-score) | seller-stress-swfl | incompatible baseline vs market-heat — can point opposite for one region |

**Traps (the nuance the cells can't hold):**
- **T1 — aggregate DOM is not trustworthy today.** Row-level `listing_dom` is fine; the *aggregate*
  is censored — 63% of the active book is a `first_seen` floor (07/18 backfill de-flooring it, ~15%
  done). A 30-second "typical DOM" off the aggregate is confidently wrong right now.
- **T2 — ZHVI is a typical-value INDEX, not a median.** Mislabeled "Median home value" in ≥3 places
  (email `market-context.ts:65`, /charts, brain label). Same ZIP: assessed $244,810 / ZHVI $261,247
  / deed-sold $269,900 / list $309k–$340k (33901) — never blend them.
- **T3 — the 0–1 vs 0–100 unit trap.** `price_reduced_share` is **0–100** in our
  `listing_momentum_stats` (20.1) but a **0–1 fraction** in realtor's `market_heat_core_swfl` (0.232).
  Both packs convert correctly today; any future swap is a silent 100× cross-wire.
- **T4 — the single most dangerous name in the system.** `market-temperature-swfl` does NOT carry
  market temperature — it emits a rent-yield ratio. For "how hot is the market," use
  `market-heat-swfl`. A cold Claude grabbing by name gets exactly the wrong brain. (And heat vs
  seller-stress run on incompatible baselines — they can disagree; that's a real `contradicts[]`, not a bug.)

---

## PARCELS — four tables, easy to confuse (live-probed 2026-07-18)  **[NEEDS-SIGN-OFF]**

Four ingests, mostly the same FDOR layer — the redundancy poster child. Read the RIGHT one:

| Table | Rows / cols (probed 07/18) | What it is | Read for | Note |
|---|---|---|---|---|
| `collier_parcels` | 290,973 / **104** | FDOR statewide cadastral, Collier (CO_NO=21). Comprehensive, **DONE** | properties-collier-value (+ communities reads the FDOR layer) | do not re-widen — already all-type/104-col |
| `leepa_parcels` | 548,798 / **19** | Lee **Property Appraiser** — a **DIFFERENT source** (valuation + sale only) | properties-lee-value | distinctive cols: `folioid`, `building_value`, `soh_cap`/`cap_difference` (last two DERIVABLE from FDOR `jv_hmstd−av_hmstd`). Framed as a **cross-check of FDOR, NOT slated for deletion** |
| `lee_parcels` | **DOES NOT EXIST YET** (`to_regclass` null) | FDOR statewide cadastral, Lee (CO_NO=46) — ingest **in flight** | properties-lee-value (planned) | **DO-NOT-WIRE until it lands.** OUT_FIELDS byte-identical to `collier_parcels` → on landing = the full 104-col Collier-shape table. `lee-parcels-source.mts` reads a `lee_parcels_summary` view (1 row) framing FDOR as a deliberate cross-check of LeePA |
| `parcel_subdivision` | 604,362 / **28** | FDOR statewide **homes-only** subset, both counties | communities-swfl | ONE distinctive col: `subdivision_name` (a parse of `legal_description` the wide tables carry raw) |

- **ONE-ROOT TARGET (recommended, [NEEDS-SIGN-OFF]):** a single canonical FDOR parcel table
  (Lee CO_NO=46 + Collier CO_NO=21, shared schema) that properties-lee-value + properties-collier-value
  + communities all read. **Pending:** `lee_parcels` landing, then a decision on whether the LeePA
  appraiser feed stays (it carries appraiser-only fields FDOR lacks) or is retired.
- **DELETION IS OPERATOR-GATED (RULE 1) and BLOCKED** until `lee_parcels` lands, consumers repoint,
  and numbers verify. Never `DROP`/`DELETE`/`TRUNCATE` here — produce guarded SQL as text for sign-off.

---

## Provenance & voice

- Concept picks: `data-authority-map.md` §"Recommended authority by concept" + the DAILY/WEEKLY/
  MONTHLY/ANNUAL band lists in this file. Every brain name above was confirmed to exist as a real
  pack in `refinery/packs/`. Parcel row-counts/cols are live-probed (2026-07-18); a known 102-vs-104
  col discrepancy exists in the catalog text below — trust the probed 104.
- Anything marked *unverified* is a carrier the audit did not pin to a single brain — verify before
  you assert it. No pick here is normative until operator sign-off (C1/C2).
- Cadence bands, full field-scope, and every downstream route live in the per-source detail below —
  this front-matter is the index into it, not a replacement.
