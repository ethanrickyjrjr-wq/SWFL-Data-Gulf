# Community stats → deliverable wiring — design

**Date:** 2026-07-15
**Repos touched:** `brain-platform` only.
**Operator ask (verbatim intent):** "fix it all first before we resync anything" — close the real gaps found in a same-day community-data audit, hold off firing the `master` resync dispatch until they're done.

## Problem

A same-day audit (`docs/handoff/2026-07-14-community-data-into-builder-handoff.md`, prior conversation turn) found two parallel "community data" systems that don't talk to each other:

1. **Vendor-scrape community facts** (`ListingFacts.community` / `communitySourceLine`) — golf/gated/pool/amenities parsed off a specific listing's own MLS detail page. Already wired into all six standard listing-lifecycle recipes via the shared narrator.
2. **Our own lake data** (`data_lake.parcel_subdivision` → `data_lake.neighborhood_stats`, 604,362 / 31,110 rows, both live) — universal home_count + median_just_value per neighborhood, resolvable from any street address via `lib/listings/community-lookup.ts`. Built, unit-tested, **wired into nothing** — zero deliverables read it.

Three concrete, bounded gaps close that second system's last mile without touching the larger, separately-tracked pieces (the `community_profiles` Tier-2 marketed-community scrape, the master resync, Gap 2's general lookup-by-name surface):

- The subdivision-name alias reconciler exists (`refinery/lib/subdivision-aliases.mts` + `ingest/lib/community_aliases.py`) but the live `neighborhood_stats` aggregation never calls it.
- `resolveCommunityForListing` (address → neighborhood stats) is built and tested but not wired into `ListingFacts` or any recipe.
- One open check (`community_facts_remaining_recipes`) misstates current wiring; a second (`fdor_parcel_layer_only_7_of_120_fields`) was already stale and has been closed as part of this audit (evidence in the check ledger, 07/15/2026).

## What already exists (do not rebuild)

- `lib/listings/community-lookup.ts` — `resolveCommunityForAddress`, `resolveCommunityStats`, `resolveCommunityForListing`. Fan-out rule already enforced (ambiguous multi-subdivision address → no match, never a guess). Reads `data_lake.parcel_subdivision` + `data_lake.neighborhood_stats` via the untyped service-role client (that schema is intentionally outside the typed Supabase client).
- `lib/deliverable/recipes/shared.ts` — `resolveSubject()` is the ONE subject resolver every listing-lifecycle recipe calls; `authorListingNarrative()` is the ONE shared narrator six of seven recipes call (`market-comps` deliberately opts out).
- `lib/listings/listing-detail.ts` — `communitySourceLine()`, the existing pattern for turning a structured fact into a citable, restate-only prompt line. The new neighborhood-stats line mirrors this, doesn't replace it.
- `ingest/duckdb_pipelines/neighborhood_stats/agg.py` — `aggregate_stats()`, pure DuckDB GROUP BY, already unit-tested against an in-memory table.
- `fixtures/community-aliases.json` — the single alias source of truth both the TS (`subdivision-aliases.mts`) and Python (`community_aliases.py`) readers already share. **Currently seeds exactly one community: `heritage-bay`.**
- `ingest/pipelines/parcel_subdivision/resources.py` / `constants.py` — already widened 07/14/2026 (RULE 0.4 FULL-SCOPE-FIRST) to pull 25 of 120 available FDOR fields into `data_lake.parcel_subdivision`, including `sale_price_1/2` + dates + qualification codes, `living_area_sqft`, `actual_year_built`, `effective_year_built`, `land_value`, `building_count`, `residential_unit_count`, `neighborhood_code`, `market_area`, `assessment_year`. **None of this beyond `just_value`/`property_type` currently reaches `neighborhood_stats` or `communityStats`** — noted for future extension, not built this round.
- `cadence_registry.yaml`'s `source_scope` block per pipeline (renders on `/ops/census`) is the existing, correct mechanism for "what does the source supply vs. what do we pull" — already accurate for `parcel_subdivision`. This design adds pointers to it, not a parallel tracking system.

## Explicitly out of scope this round

- The `master` resync dispatch (operator: hold off until this ships).
- `data_lake.community_profiles` Tier-2 scrape (~300 marketed communities, golf/fee/amenity/drive-time) — separate, larger, already-tracked (`community_profiles_zero_coverage`).
- Gap 2 — a name-keyed lookup surface for the ~30,800 non-marketed `neighborhood_stats` rows (serves chat/MCP, not deliverables; genuinely different shape). **A handoff doc + follow-up check gets opened for this at the end of this work, per operator instruction.**
- The Email Lab AUTHOR MENU figure and the builder-UI "pull community stats" toggle (handoff doc's injection points 3 and 4) — additive UI on top of the same data, cleanly separable, own future round.
- Rolling the newly-visible `parcel_subdivision` columns (sale price, living area, year built, land value, etc.) into `neighborhood_stats` — flagged as available, not built.

## Design

### 1. Alias reconciliation wiring (plumbing only)

`ingest/duckdb_pipelines/neighborhood_stats/agg.py`'s `aggregate_stats()` currently groups strictly by the raw `(county, subdivision_name)` string read off `parcel_subdivision`. Change: before grouping, resolve each raw name through `community_for_subdivision()` (`ingest/lib/community_aliases.py`, reading the shared `fixtures/community-aliases.json`); when it resolves to a known slug, group under that slug's canonical label instead of the raw name; when it returns `None` (everything except Heritage Bay today), fall back to the raw name exactly as now.

This is a same-shape change to `agg.py` (build a pattern index once, apply it before the two existing `GROUP BY` queries) plus one new import. `pipeline.py` and the upsert logic are untouched. No new invention, no new guess — purely additive folding of names we already have real alias data for. Scoped to plumbing only per operator decision; populating more of `fixtures/community-aliases.json` (e.g. Pelican Bay's 58 sub-neighborhood names) is separate, future data-sourcing work, not part of this fix.

### 2. `communityStats` — wiring resolved address data into deliverables

**New field** on `ListingFacts` (`lib/email/listing-scrape.ts`), a sibling to the existing `community?: ListingDetailFacts`:

```ts
communityStats?: {
  subdivisionName: string;
  homeCount: number | null;
  medianJustValue: number | null;
  countByType: Record<string, number> | null;
  sourceUrl: string;
  asOf: string | null;
};
```

Kept separate from `community` — different provenance (universal parcel/tax-roll aggregate vs. opportunistic per-listing vendor scrape) — never merged into one field, never let one impersonate the other in citation language.

**Resolution point.** `resolveSubject()` in `lib/deliverable/recipes/shared.ts`. After `facts` is built (address + zip known whether the vendor match hit or fell back to the address-only skeleton), call `resolveCommunityForListing(street, zip)` in parallel with whatever `resolveSubject` already awaits — not serially, so this never adds latency. On `matched: false` (no parcel at that address, or the ambiguous-multiple-subdivisions case — real, condo towers hit this), `communityStats` stays `undefined`.

**Citation line.** New `neighborhoodStatsSourceLine(stats)` in `community-lookup.ts`, next to `resolveCommunityForListing` (co-located data + its canonical sentence, mirrors `listing-detail.ts`'s pattern for `communitySourceLine`). Produces e.g.: `"THE NEIGHBORHOOD (tax roll, as of 07/14/2026): 1,900 homes in Heritage Bay, median assessed value $612,000."` Returns `null` when `communityStats` is absent.

**Narrator wiring.** `authorListingNarrative` (`shared.ts`) gets the new line appended to its `lines` array, and the system prompt gets a new hard-rule block mirroring the existing "THE COMMUNITY" block: restate ONLY the home count and median value stated, word for word; never invent a trend, a comparison to another neighborhood, or a characterization of whether the value is high or low.

**under-contract's extra gate.** `under-contract.ts` runs its own `inventedAttributes(paragraph, sourceText)` on top of the shared narrator. Its `sourceText`/`settled` construction (already includes `community: facts.community`) gets the new stats line added too, or its stricter backstop flags the new numbers as unsourced and drops an otherwise-correct paragraph.

**Recipe reach.** Rides on `resolveSubject`/`authorListingNarrative` — reaches new-listing, coming-soon, just-sold, open-house, price-reduced, and under-contract automatically. `market-comps` stays excluded (same reasoning as its existing "community"/"neighborhood"/"subdivision" word ban).

### 3. Source-supply tracking (stop re-crawling for what's already ingested)

- `community-lookup.ts` gets a code comment next to `resolveCommunityForListing` listing the `parcel_subdivision` columns already ingested but not yet rolled into `neighborhood_stats`/`communityStats` (sale price/date, living area, year built, land value, building count) — so extending the rollup later is a one-line SQL change, not a new ingest decision.
- The Gap 2 / `community_profiles` follow-up handoff (see below) gets the same pointer: before any Phase 2 scrape of a named real-estate site for a marketed community's facts, check whether it's a tax-roll concept (already in `parcel_subdivision`, just needs a wider `neighborhood_stats` rollup) versus a true marketing/amenity concept (golf, gate, pool, HOA fee — not in any government layer, genuinely requires the named-web-source lane).
- `cadence_registry.yaml`'s existing `source_scope` block remains the one tracking root (`/ops/census`) — this design adds pointers to it, not a parallel mechanism.

### 4. Check-ledger corrections

- `fdor_parcel_layer_only_7_of_120_fields` — **closed** (evidence recorded 07/15/2026): the widen it asked for already shipped 07/14/2026, the check was just never closed.
- `community_facts_remaining_recipes` — verify against current code (new-listing/just-sold/open-house/price-reduced/coming-soon/under-contract all already call the shared narrator with the full `facts` object, so `facts.community` already rides through; `market-comps` excludes it by design) and close or correct during implementation.

### 5. End-of-work handoff (operator instruction)

Once the above ships, write a short handoff doc for Gap 2 (name-keyed lookup surface for the ~30,800 non-marketed neighborhoods — extend `communities-swfl`'s `detail_tables` vs. a dedicated drill route, per the original 07/14 handoff's open question) and open a tracking check for it. This is documentation + a check, not code — happens after implementation, not as part of it.

## Error handling

Every new call point is empty-tolerant by construction, matching existing patterns:

- `resolveCommunityForListing` already returns `{matched: false, reason}` on any miss, ambiguity, query error, or missing creds — never throws. `resolveSubject()` wraps it the same way it already wraps `resolveSubjectListing` (`.catch(() => null)`).
- `neighborhoodStatsSourceLine()` returns `null` on absent stats — the narrator's existing `.filter(Boolean)` on its `lines` array already handles a null line.
- The alias fix in `agg.py` can't fail open — an unresolved name falls back to itself, so a TS/Python fixture-read mismatch would under-fold, never mis-fold or crash.
- under-contract's `inventedAttributes` patch is additive (more accepted source text) — can only get less strict, never newly reject something it accepted before.

## Testing

- `agg.py`: extend `test_agg.py` — two raw names that alias to Heritage Bay collapse into one row with summed `home_count`; an unresolved name still falls back to raw grouping unchanged.
- `community-lookup.ts`: extend its test file — `resolveCommunityForListing` matched/unmatched/ambiguous cases feeding the stats join; a `neighborhoodStatsSourceLine` unit test mirroring `community-facts.test.ts`'s coverage of `communitySourceLine` (present/absent/silent-on-empty).
- `shared.ts`: a test proving `resolveSubject()` attaches `communityStats` on a match and leaves it `undefined` on a miss, without a real network call (same stub-injection pattern `resolveSubjectListing`'s tests already use).
- Recipe-level: extend `under-contract-community.test.ts`'s shape — a paragraph restating the new neighborhood numbers survives `inventedAttributes`; `market-comps` retains zero exposure to `communityStats` (extends its existing word-ban test).

## Out-of-scope reminders (do not re-litigate mid-implementation)

- No new ingest columns this round — `home_count`/`median_just_value`/`count_by_type` are already fully supplied by the current `parcel_subdivision` pull.
- No `community_profiles` scrape work.
- No master resync dispatch.
- No Gap 2 build — handoff + check only, after implementation.
