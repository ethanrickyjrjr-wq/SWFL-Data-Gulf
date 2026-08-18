# Community crosswalk — READ THIS FIRST, every time, before touching subdivisions or communities

**Locked 08/12/2026.** This file exists because the same investigation got re-run from scratch
inside one session before the operator stopped it: *"why does Claude do this nowhere else?"* If
you are about to answer a question about communities, subdivisions, HOA fees, gated/golf/amenity
facts, or write a consumer that joins a home to "its community" — **stop and read this whole file
first.** It is indexed in the top-level `CLAUDE.md` Reference table for exactly this reason; if you
found this file any other way, that indexing has broken and needs fixing too.

## The hierarchy, and what we actually hold at each level

**Parcel → subdivision (platted) → community (marketed).** We own the bottom two solidly and the
top thinly:

- **Parcel, 100% coverage.** `data_lake.parcel_subdivision_v` (VIEW, `migrations/20260719_parcel_subdivision_v.sql`) — 604,362 homes-only parcels across Lee+Collier, live-measured 08/12/2026.
- **Subdivision (platted name), 100% coverage, thin identity.** Same view's `subdivision_name`, derived from FDOR `legal_description` text. **20,369 distinct names**, live-counted 08/12/2026 off `data_lake.neighborhood_stats`. These are PLATTED names — "GOLDEN GATE EST UNIT82", "CAPE CORAL UNIT18" — not marketed community names, and city-scale rollups (Lehigh Acres = one 29,225-home row) are CITIES wearing a subdivision name, not communities (see `docs/standards/data-roots.md` GRAIN TRAP note).
- **Community (marketed, amenity-bearing), 81 rows.** `data_lake.community_profiles` — gated/golf/HOA-fee-range/CDD/pool/pickleball/clubhouse/dining/marina, each fact sourced + as-of. Consumer: `lib/listings/community-inside-the-gate.ts` `resolveInsideTheGate`. **81 profiles against 20,369 subdivisions — a miss is the NORMAL case**, and every flag stays silent on a miss (never render `false` as "this community lacks X").

## The edge everyone assumes doesn't exist — it does, and it's a stub

`refinery/lib/subdivision-aliases.mts` (`communityForSubdivision()`, backed by `fixtures/community-aliases.json`) is a real, documented, ALREADY-WIRED one-to-many crosswalk — its own docstring states the goal: "many normalized platted-name prefixes → one community." Live in production via `community-inside-the-gate.ts`.

**But live-measured 08/12/2026: it is 81 patterns mapped to 81 slugs, 1:1** — one pattern per community we already have a profile for. It adds **zero** coverage beyond what a plain slugify of the community's own label already catches (`community-inside-the-gate.ts` tries `communityForSubdivision()` first, falls back to slugify — the fallback is doing all the real work today). It was seeded once from the same 81 rows and never grown.

**If you're about to say "nothing maps a subdivision to its parent community" — you're wrong in the same way this session almost was.** The pipe exists. The data behind it doesn't extend past what's already directly matched. State it that way, not as absence.

## String-matching will not solve this — measured, not assumed

The obvious next move — strip UNIT/PHASE/TRACT/etc. and let numbered plats collapse into their parent for free — was tried and measured live 08/12/2026:

- Found and fixed a real bug: `normalizeSubdivisionName`'s qualifier regex required a word boundary (`\bUNIT\b`) that real plat names never satisfy — "UNIT82" has no space before the digit, so `\b` never fires between T and 8. Fixed to `(?=\s|\d|$)`. Tests pass (`refinery/lib/subdivision-aliases.test.mts`).
- **Post-fix impact: 23 of 20,369 names collapsed.** Checked why: only **71 of 20,369** subdivision names contain UNIT/PHASE/TRACT as a token at all. String-stemming was never going to be the lever — most plat names (a country club's actual filed plats, for instance) share no textual relationship with their marketed community's name whatsoever.
- **The SQL twin of the same bug is still live and unfixed**: `migrations/20260719_parcel_subdivision_v.sql` lines 38-40, `\y(UNIT|PHASE|...)\y.*$` — same word-boundary defect, feeding the live `parcel_subdivision_v` view that `neighborhood_stats` and others read. Flagged, not silently patched — it's a live view with existing consumers; fix it as its own reviewed change, not a drive-by.

**Conclusion: don't propose a bigger regex. The names genuinely don't carry the relationship.**

## The actual answer: public-record geometry, not name-matching

Operator's question that broke the stall: *"can't we just look up the communities blueprint... has to be public record."* Verified live 08/12/2026 — yes:

**Lee County's own "Planned Developments" GIS layer** — Lee County Department of Community Development, public, free, no vendor spend:
- Info: `https://www.leegov.com/dcd/zoning/pd`
- FeatureServer: `https://services2.arcgis.com/LvWGAAhHwbCJ2GMP/arcgis/rest/services/PlannedDevelopments/FeatureServer/0`
- **1,627 real polygon features**, live-counted. Fields include `CASE_NAME` (the community's real name), `ZONING_CATEGORY` (PUD/RPD/MPD/CPD/etc — the legal mechanism most gated/golf/HOA communities are actually built under), `IMS_STATUS` (Approved/Denied/Withdrawn/Rezoned — **filter to Approved for anything user-facing**), `INPUTMETHOD` (Legal/Plats/Sketched/Digital — "Sketched" boundaries are hand-drawn, lower trust), `ACRES`, geometry `esriGeometryPolygon` in State Plane feet (reproject to WGS84 before joining against our lat/lon parcel data).
- **Scope caveat, state plainly, don't overclaim:** unincorporated Lee County only (plus some legacy incorporated polygons, not full incorporated coverage). Cape Coral, Fort Myers, Bonita Springs as incorporated cities are NOT fully covered by this layer.

**The method this unlocks:** a parcel's location tested for point-in-polygon containment against these 1,627 real boundaries doesn't care that "HERITAGE BAY UNIT 12" and "Heritage Bay" don't share formatting — it just asks where the point sits. This is a spatial join, not a string join, and it's real geometry: 1,627 county-recorded boundaries versus the 81-pattern name stub.

**Reuse, don't reinvent:** `lib/geo/ray-cast.ts` already does point-in-polygon ray-casting in production, today, for `lib/listings/neighborhood-amenities.ts` pairing listings to vendor neighborhood polygons. The same utility is the right tool for this join — check it before reaching for PostGIS geometry types.

## Status as of this file's creation (08/12/2026) — update this section, don't duplicate it

- [ ] Lee "Planned Developments" ingested into `data_lake` — dispatched to an ingest-engineer pass same day; **check `ingest/cadence_registry.yaml` for the live entry and this checkbox for the real status before assuming either way.**
- [ ] Collier County's equivalent layer — searched, not yet confirmed as of this writing (`hub-collierbcc.opendata.arcgis.com` is the lead). **Do not re-run this search from zero — check whether it landed before searching again.**
- [ ] The actual parcel→PD spatial join (assigning parcels to communities) — **not yet built**, deliberately deferred to a second phase after the boundary data lands. This is the next real piece of work, not the ingest.
- [ ] SQL stemmer twin fix (`migrations/20260719_parcel_subdivision_v.sql`) — flagged, not applied. Needs its own reviewed migration.

## The meta-rule this file exists to satisfy

A playbook that isn't indexed in `CLAUDE.md`'s Reference table doesn't get read by a future
session — that's the documented failure (`built-not-wired`, memory `feedback_built-not-wired-is-the-failure-mode.md`). This file's row in that table is not optional decoration; if it's missing, add it before doing anything else with this doc.
