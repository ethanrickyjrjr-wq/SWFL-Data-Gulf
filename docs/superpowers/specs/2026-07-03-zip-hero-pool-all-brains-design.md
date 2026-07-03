# Widen ZIP hero candidate pool to all brains (concept-deduped)

**Date:** 2026-07-03
**Check:** `zip_hero_pool_all_brains`
**Depends on:** `docs/superpowers/specs/2026-07-03-zip-signal-hero-design.md` (parent build, `zip_signal_hero_live_verify`, CLOSED)

## Problem

The parent build's pool v1 scores candidates from 4 sources only: housing-swfl,
flood (env-swfl), permits-swfl, and census. 18 packs already emit a
`grain: "zip"` detail table via the established zip-drill pattern ("the ZIP
machine") — 14 of them are unused by the hero ranker. This follow-up widens
the pool to draw from all of them.

Probing the unused packs' columns surfaced a structural risk: many of them
re-measure concepts the pool already has, from a different source. Home value
alone has 5 measurements across housing-swfl (MLS closed sale), home-values-swfl
(ZHVI), active-listings-swfl (asking price), market-temperature-swfl (sold
price), and properties-collier-value (tax-assessed value). Days-on-market has
4. Active-inventory count has 4. Four different packs each compute their own
"how hot/stressed is this market" composite score. If the pool's unit stays
"one candidate per column," near-duplicate measurements of the same concept
land at adjacent ranks in the ranker — the parent spec's root-cause #3 ("same
number three times") recreated at pack scale instead of surface scale.

## Goal

Widen the pool to every zip-grain pack's headline metrics, but make **concept**
— not column — the unit that competes. Each concept occupies at most one
ranked slot (hero or grid). Two macro/micro pairs (home value, rent) are each
modeled as TWO distinct concepts that both compete independently — they're
genuinely different lenses, not duplicates — and are additionally
footnote-linked when both are held for a ZIP. Everything else measuring an
already-represented concept is demoted to rail-only supporting context,
never a second ranked slot.

## Research (RULE 0.4, crawl4ai, 07/03/2026)

- NN/g "Maintain Consistency and Adhere to Standards" (Usability Heuristic #4,
  Krause, 01/10/2021, nngroup.com/articles/consistency-and-standards/):
  "Users should not have to wonder whether different words, situations, or
  actions mean the same thing." Internal consistency means the same concept
  is represented the same way everywhere in a product. Two cards on the same
  page reporting two different DOM numbers from two different sources, with
  no visible relationship between them, is exactly the confusion this
  heuristic warns against — it directly supports concept-level dedup over
  column-level competition.
- Builds on the parent spec's NN/g citations (dashboards / progressive
  disclosure, 07/03/2026) — this follow-up doesn't change the ranking math
  (`lib/zip-report/signal-rank.ts`), only what's allowed to enter it.

## Operator decisions (Q&A, 07/03/2026)

- **Overlap policy:** measurements of the same real-world concept from
  different sources don't all compete. One primary competes; others are
  cited as rail context. Exception: the two explicitly-approved macro/micro
  pairs (below) are each treated as two DIFFERENT concepts — not one concept
  with a suppressed second measurement — so both sides compete independently
  and are only linked by a footnote, never merged into one slot.
- **Primary-source rule:** prefer closed/sold, transaction-grounded data over
  list-side/asking-price aggregates. housing-swfl's MLS closed-sale figures
  win their concepts over realtor.com list-side aggregators
  (active-listings-swfl, market-heat-swfl, market-temperature-swfl).
- **Macro/micro pairs (both render, distinctly labeled, never suppressed):**
  - Home value: housing-swfl `median_sale_price` (micro — 90-day MLS median)
    paired with home-values-swfl `home_value_zhvi` (macro — monthly index).
  - Rent: rentals-swfl `rent_index_latest`/ZORI (macro — monthly index)
    paired with market-temperature-swfl `median_rent_price` (micro — current
    asking median).
  - **Both sides of each pair compete as independent, first-class candidates**
    — per the "let both compete freely" decision, ZHVI and the micro rent
    median are NOT suppressed or folded into the primary's slot. `pairId`
    only drives one extra thing: when both sides of a pair are held for the
    same ZIP, each renders a coherence footnote (e.g. "MLS median tracks
    within X% of the Zillow index") — pure math on two already-cited numbers,
    not a new invented figure, and not a scoring input.
- **Composite scores:** treated as one concept family across all 4 packs that
  emit one (market-heat-swfl's `market_heat_score` + `hotness_score`,
  market-temperature-swfl's `local_hotness_score`, seller-stress-swfl's
  `seller_stress_score`). Exactly one competes: **`market_heat_score`**
  (market-heat-swfl) — purpose-built and literally named for this job, the
  most established of the four scoring packs. The other three are rail-only
  context, never a ranked slot.
- **Collier-only concepts stand alone:** properties-collier-value's
  tax-assessed "just value" and Save-Our-Homes gap are methodologically
  distinct from market transaction value (assessor valuation vs. sale price)
  — they don't collide with the home-value family and compete on their own.
  Coverage is natural: a concept with no row for a given ZIP simply doesn't
  compete there (same mechanism permits_90d already uses), so a Collier-only
  metric never appears as a fake gap on Lee ZIPs.

## Design

### 1. Concept registry replaces column-per-source hardcoding

`lib/zip-report/candidates.ts` currently hardcodes per-source blocks:
`HOUSING_METRICS: HousingMetricSpec[]` (6 columns from one pack), then
separate hand-written sections for flood, permits, and census. This follow-up
generalizes that into one declarative registry:

```ts
interface ZipMetricSource {
  concept: string;              // dedup key — "home_value", "home_value_zhvi", ...
  packId: string;
  tableId: string;
  cell: string;
  role: "primary" | "demoted";
  /** Shared by BOTH sides of an approved macro/micro pair — footnote linkage only, not scoring. */
  pairId?: string;
  key: string;                  // SignalCandidate.key
  label: string;
  sub: string;
  display: (v: number) => string;
  movementCell?: string;
}

const ZIP_METRIC_SOURCES: ZipMetricSource[] = [ /* ~32 entries */ ];
```

A single generic loop replaces the current per-source blocks: for each
`role: "primary"` entry (this includes BOTH sides of a pair — a pair is two
independent primaries sharing a `pairId`, not a demoted/primary split), look
up the pack's already-loaded `detail_tables` output, find the row for the
ZIP, compute percentile from the table's full distribution (same
`percentileOf` used today), and push a `SignalCandidate`. When two entries
share a `pairId` and BOTH produced a candidate for this ZIP, compute the
coherence footnote and attach it to both (`RankedSignal.footnote`, an
additive optional field — the ranking formula itself doesn't change).
`role: "demoted"` entries never become a `SignalCandidate` — they're read
into a separate `railContext: Map<concept, DemotedFigure[]>` that the rail
renders as supporting citations under the winning candidate for that concept
(e.g. "Also reported: realtor.com list-side median $X, city tax-assessed
value $Y").

Flood (dual-source fallback) and permits (Find-it gap-fill allowlist) keep
their existing special-cased sections in `candidates.ts` — their behavior is
genuinely unique, not a fit for the generic loop. Census keeps its own
loader (`loadCensusSignals`) since it reads `data_lake.census_acs_zcta`
directly, not a pack's `detail_tables`.

### 2. Generic multi-pack loader

`page.tsx` currently has one `loadParsedBrain(...)` call per source in its
`Promise.all`. Replace with a helper that takes the list of pack IDs the
registry references, loads them all in parallel (`loadParsedBrain` reads
local `brains/*.md` off disk — no network latency concern at N≈13 packs),
and returns a `Map<packId, ParsedBrain | null>` the registry loop indexes
into. Packs that fail to load (missing brain file, stale) degrade that
concept out of the pool — same empty-tolerant contract as every other reader
in this codebase; never a thrown error, never a fake row.

### 3. Full concept map (this build)

**Competing concepts carried over from pool v1** (unchanged): home value
[primary: housing-swfl], days on market [primary: housing-swfl], sale-to-list
ratio [primary: housing-swfl], months of supply, homes sold, active
inventory [primary: housing-swfl], flood risk (env-swfl), residential permits
(permits-swfl, Find-it gap-fill), 8 census demographic concepts.

**New concepts added by this build** (15, each its own ranked slot — no
suppression, each is a genuine independent `SignalCandidate`):
home value macro index (home-values-swfl `home_value_zhvi` — `pairId:
"home_value"` shared with housing-swfl's existing median_sale_price
candidate, footnote-linked, both compete freely), rent level (ZORI, the
macro/index side of the rent pair), asking-rent median
(market-temperature-swfl `median_rent_price` — the micro side, `pairId:
"rent_level"` shared with ZORI, footnote-linked, both compete freely),
rental inventory count (active-rentals-swfl), commercial permits
(permits-commercial-swfl), tax-assessed value (properties-collier-value,
Collier-only), Save-Our-Homes gap (properties-collier-value, Collier-only),
luxury/starter tier spread (tier-divergence-swfl), price per square foot
(market-temperature-swfl), sold-to-rent ratio (market-temperature-swfl),
price-reduced share [primary: listing-momentum-swfl], new-listing share
[primary: listing-momentum-swfl], price-cut depth (seller-stress-swfl
`avg_price_drop_pct` — a magnitude, distinct from the share above), pending
ratio (market-heat-swfl), one market-sentiment composite (`market_heat_score`).

**Demoted — cited in the rail under their concept's winning candidate, never
ranked** (~16 columns): active-listings-swfl's list price / avg DOM / listing
count; market-heat-swfl's DOM / active-listing count / new-listing count /
price-reduced share / `hotness_score`; market-temperature-swfl's sold price /
listing price / DOM / sale-to-list ratio / `local_hotness_score`;
listing-momentum-swfl's active-listing count; seller-stress-swfl's delisted
share / cancellation rate / relisted share / `seller_stress_score`. (Note:
`median_rent_price` is NOT in this list — it's the micro half of the rent
pair above, a competing candidate, not demoted.)

**Explicitly out of scope for this build** (available in the brain, not
promoted to a candidate — same restraint the parent build's HOUSING_METRICS
already applied by only surfacing 6 of housing-swfl's columns):
properties-collier-value's `parcel_count`/`homesteaded_count` (administrative
counts, not hero-worthy); market-temperature-swfl's `market_strength` (text
descriptor, not a rankable number).

### 4. Rail rendering for demoted figures

The rail's context card (parent spec §3) gains one new element: under a
ranked candidate, a compact "also reported by" line listing demoted same-
concept figures with their own citation — e.g. under the MLS home-value card,
"Realtor.com list-side asking median: $X (as of MM/DD/YYYY)." This keeps every
number that's held somewhere visible and cited (four-lane compliance — no
number is thrown away), while the ranked hero/grid never shows the same
concept twice. Coherence footnotes for the two approved pairs (§ operator
decisions) render inline with the paired candidate itself, not in this list.

### 5. Non-goals (this build)

- No new brains, no changes to the signal-rank scoring math itself
  (`lib/zip-report/signal-rank.ts` is unchanged — this build only changes
  what's allowed to become a `SignalCandidate`).
- No re-litigating pool v1's existing concepts or their primary sources.
- investor-zip-swfl (synthesized composite of home-values-swfl +
  rentals-swfl) stays excluded — its inputs already compete individually;
  including it would triple-count the same underlying signal.
- freshness-pulse's `freshness_by_zip` stays excluded — internal data-health
  telemetry, not a market fact a visitor cares about.
- Widening `city_permits_ingest_odd` (replacing the Cape Coral lane-3 Find-it
  fill with real lane-1 ingest) is a separate registered follow-up, not this
  build.

### 6. Testing

- `signal-rank.ts` tests are unchanged (pure ranking math, untouched).
- `candidates.ts` tests extend with: the generic registry loop emits exactly
  one `SignalCandidate` per competing concept even when multiple source packs
  hold a row for that ZIP (dedup proof); demoted entries never appear as a
  `SignalCandidate` but do appear in the returned rail-context map; a
  Collier-only concept (assessed value) is absent (not a fake zero, not a
  Find-it gap) for a Lee ZIP with no row; the two paired concepts each
  produce two linked candidates plus a coherence footnote only when both
  sides are held, and gracefully produce just one side when only one pack's
  row exists for that ZIP.
- Fixture-driven — no live brain reads in tests (existing pattern).
- Verify with `bunx next build`, not bare `tsc`.

## Sources

- Code traced in-session: `lib/zip-report/candidates.ts`,
  `app/r/zip-report/[zip]/page.tsx`, and the 18 packs found via
  `grep -rn 'grain:\s*"zip"' refinery/packs` (home-values-swfl, rentals-swfl,
  active-listings-swfl, active-rentals-swfl, market-heat-swfl,
  market-temperature-swfl, listing-momentum-swfl, seller-stress-swfl,
  tier-divergence-swfl, permits-commercial-swfl, properties-collier-value,
  investor-zip-swfl, freshness-pulse, plus the 4 packs already wired).
- NN/g "Maintain Consistency and Adhere to Standards" (Krause, 01/10/2021),
  fetched via crawl4ai 07/03/2026.
- Advisor review (07/03/2026): flagged that a column-level pool recreates the
  parent spec's root-cause #3 at pack scale; the concept-registry design and
  primary-source/pairing/composite rules above are the resolution.
