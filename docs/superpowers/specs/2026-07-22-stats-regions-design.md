# Stats-only regions with a guaranteed sold-sample floor

**Date:** 2026-07-22 · **Check:** `stats_regions_live_verify` · **Status:** design, approved 07/22/2026
("your call" — operator delegated the two open questions: threshold value, and whether to use Max-P).

## Problem

We publish medians and rates at ZIP grain. In a quiet ZIP over a quiet window, the underlying
sample is a handful of sales — and nothing in the pipeline stops a median computed off three
observations from being served as if it were a market fact. The number is arithmetically correct
and epistemically worthless, and a reader cannot tell the difference from the output.

There is no root today whose job is "a geography guaranteed to be statistically speakable." The
closest artifact, `fixtures/swfl-market-areas.json`, was built for a **different** job — telling a
subscriber which market is theirs — and it explicitly disclaims this one
(`lib/email/zip-events/market-areas.ts:5`: *"a stable, citable fixture fact, never runtime
clustering"*).

## Goal

One committed, reviewed, stats-only geography over the 58 Lee + Collier ZIPs where **every region
clears a minimum sold-sample floor**, so a consumer physically cannot read a number off a
too-thin basis. Regions are analytical scaffolding. They are **never** rendered to a subscriber
as "your market" — that concept stays with market-areas, unchanged.

## Scope decisions (locked at design time)

- **Separate geography, not a replacement.** Operator-selected 07/22/2026. Market areas keep the
  subscriber-facing job; regions are analytical only. Two artifacts, two clearly different jobs.
  This is a deliberate exception to one-authority-per-concept: they are not the same concept —
  one answers "where do you sell," the other "where can we speak."
- **Not Max-P.** See "Rejected approaches."
- **Floor = 10 sold homes / 180-day window.** `[PROVISIONAL]`, operator-tunable, following the
  `MAX_JOIN_MILES` / `BAND_RATIO_MAX` convention in `scripts/geo/build-market-areas.mts`. The
  value 10 is not invented — it reuses the existing `CORRELATION_MIN_ZIPS = 10` precedent in
  `lib/desk/correlation.ts`.

---

## Research (RULE 0.4, crawl4ai, 07/22/2026)

Full write-up: `_RESEARCH/real-estate-market/2026-07-22-kmeans-clustering-applicability.md`.

**Regionalization is a distinct family from k-means** — spatially *constrained* clustering, where
contiguity is a hard constraint rather than an emergent hope. PySAL `spopt` ships `MaxPHeuristic`,
`Skater`, `WardSpatial`, `RegionKMeansHeuristic`, `AZP`, `Spenc`, `SA3`
(https://pysal.org/spopt/api.html).

**Max-P is the closest match to this problem, verbatim:** *"the aggregation of n areas into an
unknown maximum number of homogeneous regions, while ensuring that each region is contiguious and
satisfies a minimum threshold value imposed on a predefined spatially extensive attribute."*
Signature: `MaxPHeuristic(gdf, w, attrs_name, threshold_name, threshold, top_n=2,
max_iterations_construction=99, max_iterations_sa=10, verbose=False, policy='single')`. Docs
example uses `threshold_name="count"`, `threshold=4`.

**sklearn's own k-means caveats** (https://scikit-learn.org/stable/modules/clustering.html):
inertia *"responds poorly to elongated clusters"*; convergence *"may be to a local minimum...
highly dependent on the initialization."* Both disqualifying here — SWFL submarkets are elongated
by construction, and we cannot have run-to-run drift.

**sklearn connectivity constraints** — `AgglomerativeClustering` accepts a connectivity matrix so
*"only adjacent clusters can be merged together."* Vendor warning: connectivity plus
single/average/complete linkage worsens "rich get richer"; *"Ward gives the most regular sizes."*

## Rejected approaches

**A — Max-P via spopt. REJECTED, and the reason is load-bearing.** Read the implementation
(https://pysal.org/spopt/_modules/spopt/region/maxp.html): it calls `np.random.shuffle`,
`np.random.randint`, and `np.random.random` against the **global** numpy RNG, and exposes **no
`random_state` parameter**. Two runs on identical data can differ. That fails the churn guard at
the source, not at the margin. Determinism would depend on globally seeding numpy and on no other
library touching the global RNG in between — a footgun, not a guarantee. It additionally requires
geopandas + libpysal + spopt (GDAL/shapely/pyproj) on a runner, and produces assignments we cannot
explain per-unit. Revisit only if unit count grows by an order of magnitude AND a seeded API lands.

**B — Ward + connectivity matrix (sklearn only). REJECTED.** Deterministic and light, but Ward
takes a `k`, not a floor. The guarantee we actually need — *every region clears the floor* — is not
expressible; you would cluster, check floors, and re-tune. Wrong primitive.

**C — Deterministic greedy threshold-merge, hand-written. SELECTED.** See below.

Rule 11 governs the choice: Max-P's advantage is optimality across thousands of units. At 58 ZIPs
with a hard floor, greedy and optimal will largely agree, and where they differ we prefer the
explainable answer. We are not operating at the scale that justifies the algorithm.

---

## What we're building

### 1. Adjacency asset (prerequisite, one-time)

We hold ZIP **centroids only** (`fixtures/swfl-zip-centroids.json`, from Census TIGER 2020 ZCTA5
polygon centroids). No polygons. Nearest-centroid links **cross water** — which is precisely the
bug `build-market-areas.mts` hand-codes a "barrier lock" to prevent. Real adjacency removes the
need to encode by hand what the geometry already knows.

Source, verified live 07/22/2026:
`https://www2.census.gov/geo/tiger/TIGER2024/ZCTA520/tl_2024_us_zcta520.zip`
— `Content-Type: application/zip`, `Content-Length: 528806468` (~504 MB, nationwide).

One-time local script: fetch → clip to our 58 ZIPs → emit two committed fixtures:
- `fixtures/swfl-zip-polygons.json` — the 58 clipped ZCTA polygons (source + as-of recorded).
- `fixtures/swfl-zip-adjacency.json` — derived `{zip: string[]}` shared-boundary graph.

**Never runs in CI.** The 504 MB fetch is a deliberate, local, occasional regeneration — same
posture as `build-market-areas.mts`. The committed output is small.

### 2. The merge engine (pure, deterministic)

Roughly 80 lines, no new runtime dependencies, no RNG anywhere:

1. Start with each ZIP as its own region.
2. Compute sold count per region over the window (`data_lake.listing_transitions` sold rows joined
   to `listing_state` for `zip_code` via `address_key` — the same join
   `build-market-areas.mts` already uses for its band pass; transitions carry no ZIP of their own).
3. While any region is under floor: take the **thinnest** region (ties broken by ZIP ascending —
   determinism, not preference); merge it into the **adjacent** region nearest on median sold
   price (ties again by ZIP ascending).
4. Every merge appends a reason record: which region, its count, its chosen partner, why.
5. Stop when all regions clear the floor, or a guard trips (below).

Determinism is **structural** — there is no seed to pin because there is no randomness. Same input,
same output, always.

### 3. Output contract

`fixtures/swfl-stats-regions.json` — committed, human-reviewed, diffs intentional. Each region
carries: `region_id`, `zips[]`, `sold_count`, `window_days`, `as_of` (MM/DD/YYYY), `merge_reasons[]`,
`needs_review[]`. Loader mirrors `market-areas.ts` in shape but uses **deliberately distinct type
and field names** so a region can never be passed where a `MarketArea` is expected.

---

## Failure modes and guards (RULE 3.5 — named before building)

1. **Churn** — a region shifts and a published stat silently changes basis.
   *Guard:* committed fixture, never runtime; plus a determinism test asserting identical input →
   byte-identical output.
2. **Water-crossing merge** — adjacency links two ZIPs across a bay.
   *Guard:* real shared-boundary adjacency (not centroid distance) + the barrier-class check
   carried from market-areas; a cross-class merge is refused and flagged, never silent.
3. **Runaway merge** — the floor is unreachable in a sparse corner; the algorithm eats a county.
   *Guard:* hard cap on region span/member count; on breach it halts and emits `needs_review`
   rather than producing a monster region.
4. **Stale window** — the 180-day window ages out and floors quietly stop holding.
   *Guard:* fixture carries its `as_of`; a `checks` entry fails when live data no longer clears
   the floor.
5. **Serving an unfloored number** — a consumer reads a stat from a region that never cleared.
   *Guard:* under-floor regions emit the stat as **withheld**, not as a computed value; the type
   makes "withheld" unrepresentable as a number, so a consumer cannot accidentally render it.
6. **Two geographies confused** — someone renders a stats region as "your market."
   *Guard:* distinct type, distinct field names, no shared identifier shape with `MarketArea`;
   loader module carries the same "never subscriber-facing" header comment.
7. **Fixture drifts from adjacency** — polygons regenerate, regions do not.
   *Guard:* regions fixture records the adjacency fixture's as-of; mismatch fails a test.

Guards 2, 5, 6, and 7 are **not** covered by TDD — they are validation/type/lint guards, per the
scope limit in RULE 3.5. Only 1 and 3 are pure logic tests.

## Testing (TDD, RULE 3.5)

Each failure mode above gets a failing test named for it before implementation:
`merge is deterministic across runs`, `refuses cross-barrier merge`, `halts on runaway span`,
`withheld stat is not a number`, `region type is not assignable to MarketArea`,
`stale adjacency as-of fails`.

## What we need (acquisition list)

- **No new runtime dependencies.** The engine is hand-written TypeScript.
- **One-time local tooling only** for the polygon clip — unconstrained, since it never runs in CI.
- **No new paid surface, no new cron, no ingest write.** This reads existing lake tables and emits
  a committed fixture.

## Explicitly out of scope

Per-cluster price models (the WI25 lane), comp-set size-banding (wants a size-band rule, not
clustering), and any change to market-areas membership.

---

# SECOND-ORDER AUDIT — 07/22/2026. Findings SUPERSEDE the sections above.

Run before any code, per RULE 12. Eight findings. Two are potentially build-invalidating and are
flagged for the operator. **Do not implement the design above as written.**

## BLOCKING — operator decision required

**B1 — The count floor is the exact mistake this repo already wrote the postmortem for.**
`lib/desk/correlation.ts:6-21`, verbatim: *"This module used to gate on n >= CORRELATION_MIN_ZIPS
and NOTHING ELSE. But n is a floor on how much data went in, not a test of whether the answer is
real… The entire 0.2–0.6 band was noise, painted as signal, on a live page."* I cited that module
as **precedent** for a bare count gate. It is the record of that gate failing. The citation is also
unit-wrong: 10 there is *paired ZIP observations for a Pearson r*; 10 here is *sold homes for a
median*. The lineage was a number coincidence — **withdrawn**. The threshold value remains the
operator's to set; what does not survive is my justification for it.

**B2 — Inversion: this can manufacture confidence rather than protect against its absence.**
Today a thin median is attributable to a named ZIP a reader can be skeptical of. Pooled into an
area stamped "clears the floor," the same sales read as an assurance the arithmetic does not
support. Guard #5 only withholds *under*-floor stats; nothing judges an at-or-above-floor number.
**Required fix if we proceed:** the count is a QUALIFIER, not THE GATE — mirroring
`correlation.ts`'s own `pearson()` vs `isEstablished()` split. An area must carry a dispersion
measure alongside `sold_count`, and "speakable" requires both. A build that ships the count alone
should not ship.

## Required design changes

**R1 — Rename. "Region" is taken, and it means the opposite scale.** `refinery/lib/zip-resolver.mts:29`
defines `Grain = "zip" | "corridor" | "city" | "county" | "msa" | "region" | "state" | "national"`,
and `lib/location-surface.ts:41-50` orders it finest→coarsest with `region` between `msa` and
`state` — i.e. SWFL-wide, *coarser* than county. Ours is 1–6 ZIPs, *finer* than county. Guard #6
defended only against `MarketArea` confusion and missed the collision that actually exists.
**Adopt `SampleArea` / `sample_area_id` / `fixtures/swfl-sample-areas.json`** throughout.

**R2 — Wire a consumer in the same change, or don't build it.** The spec above names zero readers;
the words "consumer" appear only abstractly (lines 22, 148, 150). On landing, the loader would have
zero inbound imports and every unfloored path keeps serving — the problem statement stays true in
production. Contrast `market-areas.ts`, which shipped with `scripts/email/weekly-read-run.mts`
consuming it. Candidate readers to confirm and repoint: `lib/email/market-context.ts`,
`lib/email/zip-events/heat.ts`, and the ZIP-grain brains in `lib/zip-dossier.ts` (`market-heat-swfl`
:131, `listing-momentum-swfl` :138, `active-rentals-swfl` :144). This mirrors the existing
brain-first ingest gate: no asset lands without its consumer in the same change.

**R3 — Extract the sold join; do not write copy #2.** `scripts/geo/build-market-areas.mts:204-247`
(`soldMediansByZip`) already implements this exact join with filters `.eq("seed", false)`,
`.eq("sale_or_rent", "sale")`, `.eq("to_state", "sold")`. A second hand-written copy can silently
disagree. Per the one-authority-per-concept rule: extract on copy #2, both callers read it.

**R4 — Instrument the join drop; the determinism test cannot see it.** A `sold_count` that is
systematically low because an `address_key` did not resolve is *deterministic* — it passes
byte-identical assertions perfectly and causes **over-merging** (areas larger than needed, built on
believing ZIPs thinner than they are). The existing join drops silently
(`build-market-areas.mts:220-232`, no else branch, no counter; `:236` continues past unresolved).
Require an explicit unmatched-rate counter that fails the build above a stated ceiling.

**R5 — Derive the window from run date.** `build-market-areas.mts:34` hardcodes
`SOLD_SINCE = "2026-01-11"` for a 07/10/2026 generation; that fixture's window is already past its
stated 180 days. Market-areas' staleness degrades a label — ours would degrade a *guarantee*.

**R6 — The staleness guard does not currently exist.** `stats_regions_live_verify` was opened by
`scripts/new-build.mjs:50-52` with **no `--signal`**, so it is a one-time manual close, not a
tripwire. Guard #4 as written cannot fail on its own. Re-open with a signal or the guard is fiction.

**R7 — `sample_area_id` needs a derivation rule.** Listed in the output contract with none. It will
either survive a regeneration whose membership changed (stable ID, silently different basis) or
churn every run (breaking stored references). `build-market-areas.mts:305` anchors `area_id` to
`slugify(place)`; a merged area has no anchor place. Decide and write it down.

## Verdict

The adjacency asset (real polygon contiguity) survives the audit intact and is independently
useful. The merge engine survives with R3/R4/R5/R7 applied. **The core promise does not survive B1
and B2 as specified** — a bare count floor is not speakability, and this repo has already paid for
learning that once on a live page.

---

# SCOPE NARROWED 07/22/2026 — adjacency asset ONLY

Operator decision ("your way"): build the uncontested adjacency asset now; the merge engine and
the floor guarantee are DEFERRED pending the B1/B2 resolution above. The asset is independently
useful — it would let `build-market-areas.mts` replace its hand-coded barrier lock with real
geometry.

## The 504 MB download is CANCELLED — vendor contract verified live 07/22/2026

The design above specified `tl_2024_us_zcta520.zip` (528,806,468 bytes) plus shapefile-parsing
tooling we do not have. **Unnecessary.** Census TIGERweb serves the identical geometry as GeoJSON
over ArcGIS REST — the same request shape this repo already uses for the FDOR parcel layers.

Verified by live probe, not by memory:

- **Service:** `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer`
- **Layer `2`** = `"2020 Census ZIP Code Tabulation Areas"` (layer 3 is Labels — wrong one, no geometry of use).
- **Query:** `/2/query?where=ZCTA5 IN ('33901',...)&outFields=ZCTA5&returnGeometry=true&f=geojson`
- **Confirmed response:** `FeatureCollection`; 3 ZIPs returned 37,116 bytes. Extrapolating, all 58
  is well under a megabyte — a committable fixture, not a build artifact.

**Load-bearing detail from the probe:** geometry type is **mixed**. `33901` and `33904` came back
`Polygon`; `34102` (Naples) came back `MultiPolygon`. Any adjacency computation MUST handle
multipart geometry — a naive single-ring reader will silently drop parts of a ZIP's boundary and
under-report adjacency. This is exactly the class of silent-drop failure R4 flags.

## What to build (next session, cold-start ready)

1. `scripts/geo/fetch-zip-polygons.mts` — query the endpoint above for the 58 footprint ZIPs
   (source list: `fixtures/swfl-zip-county.json`, membership rule per `build-market-areas.mts`'s
   ANY-county ∩ {12071, 12021}, which includes the 33955 Burnt Store straddle). Write
   `fixtures/swfl-zip-polygons.json` with source URL + as-of (MM/DD/YYYY) recorded in-file.
2. `scripts/geo/build-zip-adjacency.mts` — derive `{zip: string[]}` shared-boundary adjacency into
   `fixtures/swfl-zip-adjacency.json`. Must handle `MultiPolygon`. Must record the polygons
   fixture's as-of (guard #7).
3. TDD per RULE 3.5, tests named for the failure they prevent: `handles MultiPolygon parts`,
   `adjacency is symmetric`, `no ZIP is adjacent to itself`, `all 58 footprint ZIPs present`,
   `known non-neighbors across water are not adjacent` (pick a verified mainland/barrier pair).

## Deferred, not dropped

The merge engine, the sample floor, the `SampleArea` rename (R1), consumer wiring (R2), and the
sold-join extraction (R3) all remain open behind B1/B2. Nothing above depends on them.
