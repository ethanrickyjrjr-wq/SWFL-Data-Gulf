# P3 — CONCEPT → AUTHORITY RATIFICATION TABLE

**Purpose:** take every recommendation in `docs/standards/data-authority-map.md` and make it
**ratification-ready** — one row per concept-purpose the operator can approve or reject in isolation.
Every root here is a *recommendation pending C1/C2 sign-off*, never a normative "X IS the authority."

**Basis:** the 6-agent authority map (`data-authority-map.md`) + the catalog (`data-roots.md`) + the
execution handoff (`2026-07-18-data-consolidation-execution.md`), with **every row-count and
consumer file:line re-verified live against the lake on 2026-07-18** by this stream (queries below the
tables, not trusted from the doc).

**Concept names are the verbatim `data-authority-map.md` section headers** so P2 joins mechanically.

**Doctrine that shapes the rows (handoff line 9):** ONE root **per PURPOSE** (current vs historical,
list-side vs sold-side, per-listing vs area), NOT one per concept. So single concepts fan into
multiple approvable rows, each carrying an explicit **"never substitute for [sibling]"** note.

**Hard constraints honored:** no DROP/DELETE emitted (deletion is operator-gated, RULE 1, and blocked
until `lee_parcels` lands + consumers repoint); no invented root — the two concepts with no clean
canonical are tagged `NO CANONICAL` rather than filled; every claim cites a live row-count or a code
`file:line`.

---

## Legend

- **Row count (live)** — verified `2026-07-18` via `mcp__lake__query_lake`. Tier-2 = `pg.data_lake.*`
  Postgres; Tier-1 = S3 parquet view (row count is of the served parquet).
- **Consumer (file:line)** — at least one real production reader, grep-verified this session.
- **STOP reading** — the sources a repointed consumer must no longer read for this purpose.
- **Tag** — `[NEEDS-SIGN-OFF]` on every row (nothing here is normative yet). Contested rows also carry
  `CONTESTED` and are expanded in §Contested. No-root rows carry `NO CANONICAL`.
- **Approve** — operator column: ✅ / ❌ / edit, row by row.

---

## §1 PRIMARY TABLE — the six authority-map concepts (row-by-row approvable)

### Days on market
*Three purposes. NEVER interchange list-side and sold-side — different questions, different denominators.*

| # | Purpose | Recommended ONE root | Row count (live) | Consumer (file:line) | STOP reading (for this purpose) | Tag | Approve |
|---|---------|----------------------|------------------|----------------------|--------------------------------|-----|---------|
| DOM-1 | Per-listing DOM (row-level) | `listing_dom` view + `lib/listings/dom.ts formatDom` | 33,267 (Tier-2) | `lib/listings/dom.ts`, `lib/listings/select.ts`, `lib/buyer-leverage/dom-read.ts:*`, `refinery/sources/housing-source.mts` | `listing_state.days_on_market` (0% populated), `active_listings_residential` (corpse) | `[NEEDS-SIGN-OFF]` | ☐ |
| DOM-2 | Market-typical, **list-side** | de-floored `listing_dom` aggregate cross-checked vs realtor `market_heat_core_swfl.median_days_on_market` | core 11,520 (Tier-1 parquet, vintage 2026-07-16) | `refinery/sources/market-heat-core-source.mts:39` → `refinery/packs/market-heat-swfl.mts:250` | `listing_active_stats.avg_days_on_market` (dead-NULL), `market_details_swfl.median_days_on_market` (dup of realtor) | `[NEEDS-SIGN-OFF]` | ☐ |
| DOM-3 | Market-typical, **sold-side** | `redfin_swfl.median_dom` | 10,072 rows / 9,617 non-null median_dom (Tier-1 parquet, vintage 2026-07-17) | `refinery/sources/housing-source.mts:108,133` → `refinery/packs/housing-swfl.mts` | never merge with DOM-2 (list-side) — different question | `[NEEDS-SIGN-OFF]` | ☐ |

> **DOM-1 aggregate caveat (rides with the row):** per-listing rows are trustworthy; the *aggregate*
> is NOT trustworthy today — ~63% of the active book is a censored `first_seen` floor; the 07/18
> backfill is de-flooring it (~15% done per the map). Approve DOM-1 for row-level use; the market-typical
> aggregate answer is DOM-2/DOM-3, not a naive `AVG(listing_dom)`.

### Home value & prices
*FOUR distinct notions — the map's headline warning is "never conflate." Same ZIP diverges 3–14× across
these (33901: assessed $244,810 / ZHVI $261,247 / deed-sold $269,900 / list $309k–$340k).*

| # | Purpose | Recommended ONE root | Row count (live) | Consumer (file:line) | STOP reading (for this purpose) | Tag | Approve |
|---|---------|----------------------|------------------|----------------------|--------------------------------|-----|---------|
| VAL-1 | Assessed / just value — **Collier** | `collier_parcels` (+ `collier_parcels_zip_summary`) | 290,973 rows / 104 cols (Tier-2) | `refinery/sources/collier-parcels-source.mts:28` → `properties-collier-value` | any vendor "value" for assessed | `[NEEDS-SIGN-OFF]` | ☐ |
| VAL-2 | Assessed / just value — **Lee** | `leepa_parcels` (valuation+sale, 19 col) **until** `lee_parcels` (FDOR, 104 col) lands | leepa 548,798 / 19 col (Tier-2); `lee_parcels` = **PHANTOM, 0 (table absent)** | `refinery/sources/leepa-sold-median-source.mts:12`, `lib/should-i-sell/property-tax.ts:9` | — (per-ZIP assessed answerable for Collier, **not Lee** today — real asymmetry) | `[NEEDS-SIGN-OFF]` `CONTESTED` | ☐ |
| VAL-3 | **List** price | `listing_state.list_price` | 33,565 (Tier-2) | `lib/desk/loaders.ts:432,442` | never read a "value" table for list price | `[NEEDS-SIGN-OFF]` | ☐ |
| VAL-4 | **Sold / recorded-sale** price | **NO CANONICAL** — grain+vendor dependent (LeePA/FDOR deeds, Realtor, Redfin); pick per surface and label it | n/a — no single root exists | (multiple: `leepa-sold-median-source.mts`, `collier-sold-median-source.mts`, `redfin_swfl`) | n/a — do NOT force one | `[NEEDS-SIGN-OFF]` `NO CANONICAL` | ☐ |
| VAL-5 | Home-value **index** | Zillow `zhvi_*` (`zhvi_zip_latest`) — label **"typical home value," never "median"** | zhvi_swfl 34,031; zhvi_zip_latest 109 (Tier-2) | `lib/email/market-context.ts:53` (**mislabels it "Median home value" at :65 — one-line fix, check `zhvi_median_mislabel_email`**) | never call ZHVI a "median"; never use it for assessed or sold | `[NEEDS-SIGN-OFF]` | ☐ |

### Price cuts / reductions
*Event vs area-share are different purposes. Latent 100× unit trap: `price_reduced_share` is a **0–1
fraction** in realtor's `market_heat_core_swfl` (0.232) but a **0–100 percentage** in our
`listing_momentum_stats` (verified live: min 0, max 100, avg 13.9) — guard on any future swap.*

| # | Purpose | Recommended ONE root | Row count (live) | Consumer (file:line) | STOP reading (for this purpose) | Tag | Approve |
|---|---------|----------------------|------------------|----------------------|--------------------------------|-----|---------|
| CUT-1 | Per-listing cut **EVENT** | `listing_transitions.price_delta` (same-state negative move; forward-only) | 54,788 (Tier-2) | `lib/buyer-leverage/cut-history.ts` | — | `[NEEDS-SIGN-OFF]` | ☐ |
| CUT-2 | Area cut **SHARE** | `listing_momentum_stats.price_reduced_share` (own live inventory; **0–100 scale**) | 79 (Tier-2); confirmed 0–100 | `refinery/packs/listing-momentum-swfl.mts`, `lib/should-i-sell/load-market-snapshot.ts`, `lib/desk/loaders.ts` | `market_details_swfl` (has NO price-cut field); the 0–1 realtor `price_reduced_share` for this scale | `[NEEDS-SIGN-OFF]` | ☐ |

> **CUT-2 open sub-item (from the map, not yet independently confirmed):** `/r/should-i-sell` may
> co-render two different cut shares for one ZIP (Redfin ~32.8% + own ~15.7%). Ratifying CUT-2 as the
> area-share root implies that page reads only CUT-2. Verify at repoint time.

### Active listing inventory / counts
| # | Purpose | Recommended ONE root | Row count (live) | Consumer (file:line) | STOP reading (for this purpose) | Tag | Approve |
|---|---------|----------------------|------------------|----------------------|--------------------------------|-----|---------|
| ACT-1 | For-sale **HOME** inventory (homes-only, Lee/Collier) | `listing_active_stats.listing_count` | 66 (Tier-2) | `lib/desk/loaders.ts:276`, `refinery/packs/active-listings-swfl.mts` | land-blended `listing_momentum_stats` count (keeps ~7,300 land parcels → 3.2× inflation; both labeled "Active listings") | `[NEEDS-SIGN-OFF]` | ☐ |
| ACT-2 | **All-property-types** count | **NO CANONICAL** — momentum includes land; define explicitly if ever needed; do NOT reuse the homes-only number | n/a — no clean root exists | n/a | `active_listings_residential_zip_stats` (dead) | `[NEEDS-SIGN-OFF]` `NO CANONICAL` | ☐ |

> **ACT-1 hard caveat (verified live this session, must ride with the root):** `listing_active_stats`
> **mixes rollup rows into the per-ZIP grain** — `zip_code IS NULL` region total = 21,053; per-county
> rollups (Lee 14,365 / Collier 6,688) sit alongside true per-ZIP rows (max real ZIP ≈ 994). A consumer
> repointed to ACT-1 that does not filter `zip_code IS NOT NULL` will grab the region total or
> double-count. **Any repoint to ACT-1 must add the `zip_code IS NOT NULL` guard.**

### Rent & yield
*Three rent numbers per ZIP coexist and disagree up to ~7× (34102: $1,550 index / $7,848 / $11,000) —
label which. The map treats rent-yield as TWO intentional canonicals routed by keyword, not one.*

| # | Purpose | Recommended ONE root | Row count (live) | Consumer (file:line) | STOP reading (for this purpose) | Tag | Approve |
|---|---------|----------------------|------------------|----------------------|--------------------------------|-----|---------|
| RENT-1 | Market rent (**index**) | Zillow `zori_*` (`zori_zip_latest`) | zori_swfl 5,277; zori_zip_latest 94 (Tier-2) | `refinery/packs/investor-zip-swfl.mts` (ZORI leg); charts read `zori_pivoted` (undocumented twin, verify-1 #13) | realtor median rent + weekly observed-range as the "index" | `[NEEDS-SIGN-OFF]` | ☐ |
| RENT-2 | Rent **yield — investor** route | `investor-zip-swfl.gross_rent_yield_pct` = ZORI×12 ÷ ZHVI ×100 (verified formula, vocab scope_note) | computed per card; `investor-zip-swfl.mts:207,238,542` | `refinery/packs/investor-zip-swfl.mts:207,238` | generic sold-to-rent for the investor question | `[NEEDS-SIGN-OFF]` | ☐ |
| RENT-3 | Rent **yield — generic** route | realtor sold-to-rent (`market-temperature-swfl.sold_to_rent_ratio_swfl`) | `market_details_swfl_latest` 54 (Tier-2) | `refinery/packs/market-temperature-swfl.mts:64-70` | investor ZORI composite for the generic question | `[NEEDS-SIGN-OFF]` `CONTESTED` | ☐ |

> **RENT-2/RENT-3 note:** the map calls these "two intentional canonicals by keyword routing" — the
> sign-off item is **ratifying the routing rule** (generic→realtor, investor→Zillow), not picking one
> over the other. RENT-3's source pack is separately contested on its NAME — see §Contested C1.
> **RENT completeness caveat:** `rental_listings_swfl_latest` = 3,082 rows is the **confirmed
> Collier-only / Lee-dropped** bug (map finding #1, check `rentals_latest_view_completeness_guard`) —
> any rent row that touches that view inherits the "Lee silently missing" caveat.

### Market-state composites (heat / temperature / momentum / stress)
*Of 5 brains, only two carry a real verdict (`market-heat-swfl`, `seller-stress-swfl`); the other three
are `neutral`/`0` reporters. This concept is the most contested — see §Contested C1 & C2.*

| # | Purpose | Recommended (audit) | Row count (live) | Consumer (file:line) | STOP reading | Tag | Approve |
|---|---------|---------------------|------------------|----------------------|--------------|-----|---------|
| MKT-1 | "Market **temperature**" verdict | `market-heat-swfl` (YoY) — **NOT** `market-temperature-swfl` (misnamed; emits a rent-yield ratio) | `market_heat_core_swfl` 11,520 (Tier-1) | `refinery/packs/market-heat-swfl.mts:250` | `market-temperature-swfl` as a "temperature" verdict; the 3 neutral/0 reporters | `[NEEDS-SIGN-OFF]` `CONTESTED` | ☐ |

---

## §2 PARCELS (task-added concept — table consolidation, blocked & partly contested)

Four parcel tables hold overlapping notions. This is **inherently blocked**: `lee_parcels` (the FDOR
Lee table that would mirror Collier's 104-col shape) **does not exist yet** — confirmed live
(`information_schema.tables` name-search for `%lee_parcel%` returns only `leepa_parcels` +
`collier_parcels` + `parcel_subdivision`; no `lee_parcels`). Deletion of any parcel table is
operator-gated and blocked until `lee_parcels` lands + consumers repoint + verify.

| Table | Row count (live) | Cols | What it is / distinctive col | Recommended disposition | Tag |
|-------|------------------|------|------------------------------|-------------------------|-----|
| `collier_parcels` | 290,973 | 104 | FDOR NAL, comprehensive, all property types — Collier. DONE. | ONE root for Collier parcel value/attributes | `[NEEDS-SIGN-OFF]` |
| `leepa_parcels` | 548,798 | 19 | Lee Property Appraiser — valuation + sale only (distinct cols: `folioid`, `building_value`, `soh_cap`/`cap_difference` [last two derivable from FDOR `jv_hmstd`−`av_hmstd`]) | interim Lee root **until** `lee_parcels` lands; `lee-parcels-source.mts` frames FDOR as a CROSS-CHECK of LeePA, not a replacement | `[NEEDS-SIGN-OFF]` `CONTESTED` |
| `lee_parcels` | **0 — PHANTOM (absent)** | (would be 104) | FDOR NAL for Lee — ingest OUT_FIELDS byte-identical to Collier (CO_NO=46); lands as Collier-shape when the 07/18 FDOR run completes | future ONE root for Lee comprehensive; **cannot ratify or delete anything until it lands** | `[NEEDS-SIGN-OFF]` `BLOCKED` |
| `parcel_subdivision` | 604,362 | 28 | FDOR statewide homes-only subset, both counties; ONE distinctive col = `subdivision_name` (a parse of `legal_description` the wide tables carry raw) | keep for `subdivision_name` join only; not a value authority | `[NEEDS-SIGN-OFF]` |

> **Parcels tie-breaker (do NOT resolve here — handoff item 5):** "leepa vs lee_parcels" is an open
> operator decision. `leepa_parcels` is the LARGER row set (548,798) but valuation-only (19 col);
> `lee_parcels` will be COMPREHENSIVE (104 col) but does not exist yet. The `lee-parcels-source.mts`
> docstring's own framing (FDOR as a deliberate cross-check of LeePA) argues for KEEPING BOTH, not
> replacing one. Present both; let the operator pick after `lee_parcels` lands.

---

## §3 CONTESTED PICKS — both options + tie-breaker (NOT resolved here)

### C1 — "Market temperature" root: `market-heat-swfl` vs `market-temperature-swfl` (misnaming)
- **Option A — `market-heat-swfl` is the temperature verdict.** Reads realtor `market_heat_core_swfl`
  (11,520 rows, Tier-1) at `market-heat-swfl.mts:250`; emits a YoY hotness verdict.
- **Option B — `market-temperature-swfl` is the temperature verdict.** VERIFIED FALSE by its own code:
  `market-temperature-swfl.mts:19-23` states its ONE headline is `sold_to_rent_ratio_swfl` (a gross-yield
  read); everything else (median sold/list/rent/DOM/hotness) "DUPLICATES data we already hold free" and
  "rides as CITED CONTEXT … never as a headline vote."
- **Tie-breaker:** the name lies. The *market-state verdict* authority is **`market-heat-swfl`**;
  `market-temperature-swfl`'s legitimate scope is its rent-yield field (RENT-3), not a temperature call.
  **Sign-off item = ratify `market-heat-swfl` as the temperature verdict AND flag the rename** of
  `market-temperature-swfl` (→ e.g. `rent-yield-swfl`). Do not decree the rename unilaterally.

### C2 — Two realtor monthly feeds (which is the market-state root)
- **Feed A — `market_heat_swfl`** (Tier-1 parquet `market_heat_core_swfl` 11,520 rows) → `market-heat-swfl`.
- **Feed B — `market_aggregates_details`** (Tier-2 `market_details_swfl_latest` 54 rows) → `market-temperature-swfl`
  (a HIGH-FANOUT node: brain + charts + landing DOM + email + desk, most reading `_latest` directly).
- **Tie-breaker (data-roots.md:152):** decide which is the market-state root; **the loser's DOM/heat
  columns collapse** to the winner. Tier/cadence/field-coverage is the axis: Feed A is the richer
  per-ZIP heat/DOM history (11,520 rows); Feed B's unique value is `sold_to_rent_ratio` (RENT-3) + it
  fans out to 5 surfaces that must be repointed if it loses. **Do not resolve — operator picks.**

### C3 — Heat vs Stress (incompatible baselines — likely BOTH survive)
- **`market-heat-swfl`** — list-side realtor hotness, **YoY** baseline.
- **`seller-stress-swfl`** — Redfin seller-capitulation z-score, **2019-01-01 pre-COVID baseline**
  (verified `seller-stress-swfl.mts:32` `BASELINE_START = "2019-01-01"`).
- **Tie-breaker:** they answer DIFFERENT questions on INCOMPATIBLE baselines and can point opposite for
  the same region. The trap is folding them into one composite. **Recommendation: keep BOTH, label
  distinctly, never merge** — and (map, unconfirmed) master may serve a buried heat-vs-stress
  contradiction in its `contradicts[]` receipt; verify whether that surfaces cleanly. Sign-off item =
  ratify "two distinct signals, no merge," not "pick one."

---

## §4 SECONDARY — duplications from the completeness sweep (verify-3), NOT in the original map

*Kept visually separate: these came from the 3-Sonnet completeness sweep, not the authority map. Each
recommends DEDUP pending sign-off; none decrees deletion.*

| # | Concept double-counted | Duplicate root/brain | Canonical it echoes | Recommended disposition | Tag | Approve |
|---|------------------------|----------------------|---------------------|-------------------------|-----|---------|
| DUP-1 | 7 concepts (airport, tourist-tax, taxable-sales, unemployment, permits, home-sales, home-prices, active-listings) | `fgcu-reri` shadow VOTE engine — `refinery/packs/fgcu-reri.mts:27-30,139-182` emits 8 polarity votes into master (`polarityAdjusted` :44-45,187-224) | each already has a dedicated root+brain (rsw-airport, tourism-tdt, sector-credit, macro-swfl, permits-swfl, properties-*-value, home-values-swfl, active-listings-swfl) | strip fgcu-reri's master vote to a CROSS-CHECK only, not a second independent vote (biggest missed dup — 8 concepts) | `[NEEDS-SIGN-OFF]` | ☐ |
| DUP-2 | Lee+Collier employment level/YoY | `labor-demand-swfl` OEWS (`labor-demand-swfl.mts:85-235`, `{cape_coral\|naples}_total_employment_yoy_pct`, MSA grain) | `macro-swfl` QCEW (`macro-swfl.mts:423-444`, `qcew_{lee\|collier}_private_employment`, county grain, **critical** edge) | pick ONE employment authority per grain; QCEW (county, critical) vs OEWS (MSA) — both roll into master | `[NEEDS-SIGN-OFF]` | ☐ |

---

## §5 CAVEATS THAT RIDE WITH SPECIFIC ROOTS (must travel to any repoint)

1. **ACT-1 rollup-row trap (verified live):** `listing_active_stats` mixes `zip_code IS NULL` rollups
   (region 21,053; Lee 14,365; Collier 6,688) with per-ZIP rows. Repoint MUST add `zip_code IS NOT NULL`.
2. **RENT completeness:** `rental_listings_swfl_latest` (3,082) is Collier-only / Lee-dropped
   (`rentals_latest_view_completeness_guard`). Any rent surface touching it inherits the caveat.
3. **DOM-1 aggregate immaturity:** ~63% of active DOM is a censored `first_seen` floor; use DOM-2/DOM-3
   for market-typical, not `AVG(listing_dom)`, until the 07/18 backfill completes.
4. **VAL-5 ZHVI mislabel:** `lib/email/market-context.ts:65` labels ZHVI "Median home value" — one-line
   fix to "typical home value" (`zhvi_median_mislabel_email`).
5. **CUT unit trap:** `price_reduced_share` is 0–1 (realtor `market_heat_core_swfl`) vs 0–100 (our
   `listing_momentum_stats`, verified). Any swap is a silent 100× cross-wire — guard on touch.
6. **Parcels blocked:** no parcel-table deletion until `lee_parcels` lands + consumers repoint + verify.

---

## §6 LIVE VERIFICATION LOG (this stream, 2026-07-18)

Row counts via `mcp__lake__query_lake` (Tier-2 `pg.data_lake.*`; Tier-1 parquet views):
`listing_dom` 33,267 · `listing_active_stats` 66 (rollup rows confirmed: NULL-zip 21,053) ·
`listing_momentum_stats` 79 (price_reduced_share min 0 / max 100 / avg 13.9) ·
`listing_transitions` 54,788 · `listing_state` 33,565 · `market_details_swfl_latest` 54 ·
`collier_parcels` 290,973 · `leepa_parcels` 548,798 · `parcel_subdivision` 604,362 ·
`neighborhood_stats` 31,110 · `zhvi_swfl` 34,031 · `zhvi_zip_latest` 109 · `zori_swfl` 5,277 ·
`zori_zip_latest` 94 · `rental_listings_swfl` 17,326 · `rental_listings_swfl_latest` 3,082 (Collier-only) ·
`active_listings_residential` 40,423 (corpse) · `tier_divergence_swfl` 39,308 ·
`redfin_swfl` 10,072 / median_dom 9,617 non-null · `market_heat_core_swfl` 11,520.
`lee_parcels`: **absent** (name-search returns zero) — PHANTOM confirmed.

Consumers grep-verified: as cited per row (file:line). Contested-pick evidence:
`market-temperature-swfl.mts:19-23` (misnaming), `data-roots.md:152` (two realtor feeds),
`seller-stress-swfl.mts:32` (2019 baseline), `fgcu-reri.mts` + `macro-swfl.mts` + `labor-demand-swfl.mts`
(secondary dups).

---

## Approval summary — rows the operator ratifies one by one

**Clean recommendations (approve/reject as-is):** DOM-1, DOM-2, DOM-3, VAL-1, VAL-3, VAL-5, CUT-1,
CUT-2, ACT-1 (with the `zip_code IS NOT NULL` guard), RENT-1, RENT-2.

**No canonical — needs operator DEFINITION, not just approval:** VAL-4 (sold price), ACT-2 (all-types count).

**Contested — operator picks between options, do NOT approve a default:** MKT-1 / C1 (heat vs misnamed
temperature), C2 (two realtor feeds), C3 (heat vs stress — recommend keep-both), RENT-3 (routing rule),
VAL-2 / Parcels (leepa vs FDOR-lee, BLOCKED on `lee_parcels` landing).

**Secondary dedup (sweep-found, approve dedup direction):** DUP-1 (fgcu-reri shadow vote), DUP-2
(QCEW vs OEWS employment).

Every row is `[NEEDS-SIGN-OFF]`. Nothing here is normative until the operator signs (C1/C2).
