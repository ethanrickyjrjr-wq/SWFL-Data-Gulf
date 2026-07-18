# Data Authority Map — recommended canonical source per concept

**Basis:** 6-agent live-verified lineage audit, 2026-07-18 (queried the lake, did not trust the code).
Load-bearing data claims below were spot-re-verified by the synthesizer against the live lake and
against the existing `checks` ledger — see the annotations.

**Status: RECOMMENDATIONS, not ratified architecture.** The canonical picks below are the audit's
recommendation; declaring a source "the authority" is an architecture decision (rules C1/C2) that needs
operator sign-off before it becomes normative. Until then this file is a *descriptive* map of where each
concept lives and which source the audit recommends — read it before wiring a new consumer.

**Why this exists:** the platform holds **87 lake tables** feeding **~50 brains**, and the same concept
(days-on-market, "value", price-cut share, active count, rent, market-heat) is computed in several places
with different definitions. Consumers grab whichever they find first, so the same claim renders 2–14×
apart across surfaces.

---

## Findings hit-list — what's already tracked vs genuinely new

The audit surfaced ~36 drift findings across 6 concepts. The honest result after deduping against the
`checks` ledger: **most were already known and tracked.** That's good news — it means the wiring is
messy but not un-watched. Grouped:

**ALREADY TRACKED (do NOT open duplicates — existing check named):**
- `active_listings_residential` orphan corpse (40k rows, feeds nothing, still cron-scraped) → `active_listings_ship_or_delete`
- Stale seed table serving an inflated $309k–$1.14M median → `price_source_wire_off_stale_seed_table`
- `listing_active_stats.avg_days_on_market` dead-NULL, consumers treat it live → `listing_active_stats_dom_repoint`
- Duplicate ZIP rows in `listing_momentum_stats` / `listing_active_stats` → `listing_momentum_33936_duplicate_zip_row`, `active_stats_zip_median_dup_rows`
- `market_details_swfl` land-blended vendor medians + DOM dup → `market-details-swfl-land-blend-and-dupes`
- Out-of-region / dual-county ZIPs in momentum + active-listings → `active_listings_zip_county_contamination`
- Buyer-leverage DOM aggregate understates typical (floored/immature) → `buyer_leverage_zip_benchmark_maturity_gate` (self-resolving as the 07/18 listed_date backfill completes)
- Cross-brain DOM sourcing (realtor-monthly vs own-data) → `buyer_leverage_zip_dom_authority_audit`

**GENUINELY NEW — LIVE, confirmed by the synthesizer, checks opened 2026-07-18:**
1. **Active-rentals silently dropped all of Lee County.** Confirmed live: `rental_listings_swfl_latest`
   GROUP BY county returns **Collier only (3,082 rows), zero Lee** — the "latest" view keys off
   `MAX(captured_date)` with no completeness guard, so a Collier-only capture hides Lee, yet the brain
   still claims Lee+Collier. Highest user-facing harm. → `check: rentals_latest_view_completeness_guard`
2. **ZHVI mislabeled "Median home value."** Confirmed: `lib/email/market-context.ts:65` labels the Zillow
   ZHVI figure "Median home value" (source "Zillow ZHVI"). ZHVI is a *typical-value index*, not a median.
   One-line label fix. → `check: zhvi_median_mislabel_email`

**AUDIT-FLAGGED, NOT YET INDEPENDENTLY CONFIRMED (documented here so it's not lost — verify before opening tracked work):**
- `/r/should-i-sell` may co-render two different price-cut shares for one ZIP (Redfin ~32.8% + own ~15.7%).
- Master may serve a buried heat-vs-stress contradiction (`market-heat-swfl` bullish vs `seller-stress-swfl`
  bearish, incompatible baselines) in its `contradicts[]` receipt.
- The `active_listings_zip_county_contamination` check covers out-of-region ZIPs; the *land-inclusion*
  count inflation (momentum keeps ~7,300 land parcels → 3.2× vs homes-only `listing_active_stats`, both
  labeled "Active listings", co-rendering on `/desk`) is a related-but-distinct facet — confirmed live
  (33972: 1,286 vs 402; 33909: 1,293 vs 681). Decide whether it folds into that check or needs its own.

**CORRECTED (a finding that did NOT survive verification):**
- The "Redfin price-drop share renders 200%" alarm is **not a systemic bug.** Live: of 10,072 rows, only
  **7 (0.07%) exceed 100%** (min 1.96, avg 32.8); the column is a Redfin drops-in-window ÷ active-snapshot
  ratio that can legitimately exceed 100 in thin-denominator ZIPs. At most a "clamp rare >100% outliers"
  display note — not tracked as a data bug.

**Latent unit trap (documented, not a live bug):** the identically-named `price_reduced_share` is a
**0–1 fraction** in realtor's `market_heat_core_swfl` (0.232) but a **0–100 percentage** in our
`listing_momentum_stats` (20.1). Both packs currently convert correctly — but any future swap is a silent
100× cross-wire. Guard when touching either.

---

## Recommended authority by concept

Each pick is the audit's recommendation, pending sign-off.

### Days on market
- **Per-listing DOM** → `listing_dom` view + `lib/listings/dom.ts formatDom`. Row-level trustworthy;
  **aggregate NOT trustworthy today** — 63% of the active book is a censored `first_seen` floor (07/18
  backfill de-flooring it, ~15% done).
- **Market-typical, list-side** → de-floored `listing_dom` cross-checked against realtor list-side
  `market_heat_core_swfl` (month history + YoY).
- **Market-typical, sold-side** → `redfin_swfl.median_dom`. Different question from list-side — never interchange.
- **Dead/redundant, do not read:** `listing_state.days_on_market` (0%), `listing_active_stats.avg_days_on_market`
  (NULL), `active_listings_residential` (corpse), `market_details_swfl.median_days_on_market` (dup of realtor).

### Home value & prices — FOUR distinct notions, never conflate
- **Assessed / just value** → `leepa_parcels` (Lee) / `collier_parcels` (Collier). (Per-ZIP assessed is
  answerable for Collier, not Lee — a real asymmetry.)
- **List price** → `listing_state.list_price`.
- **Sold / recorded-sale price** → no single source; grain+vendor dependent (LeePA/FDOR deeds, Realtor,
  Redfin). Pick per surface and label it.
- **Home-value index** → Zillow `zhvi_*` — label "typical home value," never "median."
- Same ZIP diverges 3–14× across these (33901: assessed $244,810 / ZHVI $261,247 / deed-sold $269,900 /
  list $309k–$340k). ~30 storage locations / 7 providers.

### Price cuts / reductions
- **Per-listing cut EVENT** → `listing_transitions.price_delta` (same-state negative move; forward-only).
- **Area cut SHARE** → `listing_momentum_stats.price_reduced_share` (own live inventory; **0–100**).
- **Do not read for cut share:** `market_details_swfl` (has no price-cut field).

### Active listing inventory / counts
- **For-sale HOME inventory** → `listing_active_stats.listing_count` (homes-only, Lee/Collier).
- **All-property-types count** → no clean source (momentum includes land). Define explicitly if needed;
  don't reuse the homes-only number.
- **Do not read:** `active_listings_residential_zip_stats` (dead).

### Rent & yield
- **Market rent (index)** → Zillow `zori_*`.
- **Rent yield** → two intentional canonicals by keyword routing: generic → realtor sold-to-rent
  (`market-temperature-swfl`); investor → Zillow composite (`investor-zip-swfl.gross_rent_yield_pct` =
  ZORI×12 ÷ ZHVI, verified live to the cent). Three rent numbers per ZIP coexist, disagree up to ~7×
  (34102: $1,550 / $7,848 / $11,000) — label which.

### Market-state composites (heat / temperature / momentum / stress)
- Of 5 brains, only two carry a real verdict: `market-heat-swfl` (YoY) and `seller-stress-swfl` (2019–21
  z-score); the other three are `neutral`/`0` reporters.
- **Recommended authority for "market temperature":** `market-heat-swfl`. (`market-temperature-swfl` is
  misnamed — it emits a rent-yield ratio, a real "nobody knows what's what" trap.)
- The two verdicts run on incompatible baselines and can point opposite for the same region.

---

## Root cause & structural fix

Every finding is one shape: **no enforced "one canonical source per concept" contract at the point a
surface reads a metric.** Partial mitigations exist (`singleSourcePerMetric` in email + zip-report,
`listing_active_stats_land_blend_tripwire`) but they're per-surface and key on a label string, so two
sources of the same concept with different keys both survive.

Recommendation (`check: data_authority_single_source_registry`): a small concept → canonical-source
registry, enforced where consumers read, extending the existing `singleSourcePerMetric` seam (not a new
gate — architecture rule C2). This is a design effort (brainstorm first), not a wire-up. Until it exists,
this file is the manual registry.
