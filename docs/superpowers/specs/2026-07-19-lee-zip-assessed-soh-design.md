# Lee per-ZIP assessed value + SOH gap (FDOR cadastral) into properties-lee-value + zip-report

**Date:** 2026-07-19
**Check:** `lee_zip_assessed_soh_live_verify`
**Evidence base:** probed code (live Collier view + connector + pack + zip-report registry) and live
lake queries this session — not memory. No new outside surface is consumed: the mirror reads FDOR
columns already ingested into `data_lake.lee_parcels` (landed 07/18/2026, 556,083 rows / 104 cols,
byte-identical `OUT_FIELDS` to `collier_parcels`) whose semantics were researched and ratified in the
Collier build (citing FDOR's 2025 NAL Data File User's Guide) — so no fresh crawl was dispatched
(RULE 0.6 proportion; RULE 0.4 satisfied by the prior in-repo research this mirrors).

## Problem

`data-roots.md` decision table, "Value — assessed / just": *per-ZIP assessed answerable for Collier,
NOT Lee (real asymmetry)*. Collier has `collier_parcels_zip_summary` → `collier_parcels_by_zip`
detail table → the zip-report `assessed_value` + `soh_gap` concepts. Lee has no per-ZIP view at all,
even though `lee_parcels` now holds the identical columns. The data to kill the asymmetry landed
07/18; nothing reads it at ZIP grain.

**Discovered while probing (changes the design):** three ZIPs straddle the Lee/Collier line —
live-verified parcel counts vs the `swfl-zip-county.json` crosswalk:

| ZIP | Lee parcels | Collier parcels | crosswalk primary_county |
|---|---|---|---|
| 34110 | 379 | 16,174 | Collier (12021) |
| 34119 | 234 | 19,103 | Collier (12021) |
| 34134 | 13,611 | 1,859 | Lee (12071) |

Two consequences: (a) naively adding Lee entries to the zip-report registry would render TWO
"Tax-Assessed Value" candidates for those ZIPs — the same duplicate-key defect class as the open
33936 Lee/Hendry check; (b) today's Collier-only wiring already serves 34134 (Bonita Springs) off
its 1,859-parcel Collier sliver while 13,611 Lee parcels go unread — a pre-existing wart this build
fixes.

## Goal

Per-ZIP assessed value (median just value) + SOH gap answerable for BOTH core counties, with exactly
one candidate per concept per ZIP, county assignment decided by the ONE existing geography authority
(`resolveZip().primary_county` off `fixtures/swfl-zip-county.json`).

## What we're building

Mirror of the proven Collier chain, plus a primary-county disjointness rule applied to both sides.

1. **View** — `docs/sql/20260719_lee_parcels_zip_summary.sql`:
   `data_lake.lee_parcels_zip_summary`, column-identical mirror of
   `collier_parcels_zip_summary` (phy_zipcd, parcel_count, homesteaded_count, median_jv,
   soh_gap_median_pct) over `data_lake.lee_parcels`. `CREATE OR REPLACE VIEW` (idempotent), GRANT
   service_role, `NOTIFY pgrst`. Applied directly per RULE 1; row count verified against direct
   aggregation after apply. Views stay county-pure; the straddle filter lives in the connectors
   (below), keeping ZIP→county knowledge out of SQL and in the one crosswalk authority.

2. **Shared predicate** — `refinery/lib/parcel-zip-scope.mts` (one authority, extracted on copy #2):
   `zipInPrimaryCounty(zip, countyFips)` = `resolveZip(zip).in_scope && primary_county === countyFips`,
   plus exported `LEE_FIPS` / `COLLIER_FIPS`. Unit-tested on the three straddle ZIPs + an
   out-of-scope ZIP.

3. **Sources** —
   - `lee-parcels-source.mts`: add `LeeParcelsZipRowNormalized` + non-fatal `fetchLiveZipRows()`
     (mirrors Collier's: absence degrades to an empty detail table, never aborts the build), rows
     filtered through `zipInPrimaryCounty(zip, LEE_FIPS)`. Fixture mode emits no zip rows (same as
     Collier).
   - `collier-parcels-source.mts`: tighten its existing `in_scope` filter to
     `zipInPrimaryCounty(zip, COLLIER_FIPS)`. Served effect: `collier_parcels_by_zip` drops its
     34134 sliver row (now Lee's), keeps 34110/34119.

4. **Pack** — `properties-lee-value.mts`: capture zip-row fragments in `corpusSummary`
   (strict `kind === "lee-parcels-zip-row"` matching, consistent with the pack's existing
   cross-match discipline); `outputProducer` emits `lee_parcels_by_zip` detail table with the exact
   Collier column set/labels; note states FDOR CO_NO=46 + the primary-county rule. `fdorSourceMeta`
   hoisted out of the `if` block (as Collier's `parcelSourceMeta` already is). No new key_metrics ⇒
   no new vocab slugs (checker run to confirm). Pack `scope` string unchanged ⇒ no catalog.mts edit.

5. **zip-report registry** — `lib/zip-report/candidates.ts`: two new `primary` entries sharing the
   existing `assessed_value` / `soh_gap` concepts and keys, pointed at
   `properties-lee-value:lee_parcels_by_zip`, subs saying "Lee County …". Disjointness is guaranteed
   at the source layer, so the same-key pair can never both fire for one ZIP. Percentile ranks stay
   per-county-table (as Collier's do today); sub-labels name the county, keeping the rank universe
   honest. The "Collier-only" section comment becomes a county-pair note documenting the rule.

## Non-goals (next builds, not this one)

Homestead portability inflow (→ should-i-sell), delinquent-tax distress off LeePA layer 21
(→ seller-stress-swfl), new-construction value, multi-parcel investor share, year-built profile —
all listed in the 07/18 audit's unlock list; each is its own registered build.

## Error handling

Inherited from the Collier pattern: zip-summary query failure logs a warning and yields an empty
detail table (additive data, graceful absence); the single-row county summary stays the only fatal
path. A ZIP the crosswalk doesn't know is out of scope ⇒ dropped (never a guessed county).

## Testing

- `refinery/lib/parcel-zip-scope.test.mts` — straddle trio + out-of-scope.
- `refinery/packs/properties-lee-value.test.mts` — zip-row fragments ⇒ `lee_parcels_by_zip`
  surfaces with the right cells; no zip rows ⇒ no table (mirrors the sold-median test).
- `lib/zip-report/candidates.test.ts` — Lee ZIP resolves `assessed_value`/`soh_gap` from the Lee
  table; entries are disjoint by construction.
- Gates: `bun refinery/tools/check-vocab-coverage.mts --all`, pack `bun:test` + catalog mirror
  (Gate 5), `bunx next build`.
- Post-apply SQL verification: view row count + spot-check 3 ZIPs vs direct aggregation.

## Rollout

Committed locally, NOT pushed — pack `--- OUTPUT ---` shape changes (new detail table on Lee, one
row moving off Collier) are ask-first per RULE 1. After operator sign-off + push: targeted rebuilds
`properties-lee-value` + `properties-collier-value` (both `skipSynthesisAgent` — deterministic, no
LLM spend), then `pack_id=master` no-force to propagate. data-roots.md asymmetry row updated in the
same commit.
