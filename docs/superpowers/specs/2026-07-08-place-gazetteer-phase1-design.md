# Sourced place gazetteer — Phase 1 of hyperlocal geo-scope

- **Date:** 07/07/2026 (spec file stamped 07-08 by the build registrar; the parent program is the 07/07 brief)
- **Status:** DESIGN — approved in brainstorming, not yet built. No runtime code touched.
- **Parent program:** `docs/superpowers/specs/2026-07-07-hyperlocal-geo-scope-reweighting-design.md`
  (the RESEARCH BRIEF). That brief is a 3-subsystem program: (1) sourced gazetteer, (2) place-aware
  capture/distill with reach weighting, (3) read-time rollup + migration of ~12 reader surfaces +
  backfill. **This spec is Phase 1 only — the gazetteer.** Phases 2 and 3 get their own specs.
- **Check:** `place_gazetteer_phase1_live_verify` (open).
- **Author:** assistant, from live code probe (RULE 0.5) + live Census-source verification (RULE 0.4, crawl4ai).

---

## 1. Problem (Phase-1 slice)

The pulse pipeline has no real place hierarchy. `ingest/lib/pulse_match.py:47` matches a city by naive
substring (`city.lower() in hay`), sub-areas are treated as sibling cities, and there is no
county→city→ZIP structure any consumer can join to. Everything the parent brief wants — conflict-free
one-place-per-fact resolution, reach that climbs a hierarchy, rollup by containment — is blocked on the
absence of a **sourced place tree**. Phase 1 builds exactly that tree and nothing else.

We already hold the bottom (ZIP) and top (county): `fixtures/swfl-zip-county.json` is a Census-sourced
ZCTA→county crosswalk (Census 2020 ZCTA-to-county relationship file). The **city/place layer in the
middle is missing**, and there is no artifact any pipeline or pack can join a fact to.

## 2. Goal

Deliver a **sourced, tested, reproducible place hierarchy** covering our footprint —
**county → place (city/town/village/CDP) → ZCTA** — with each node carrying its parent(s) and provenance.
Additive-only: Phase 1 ships an artifact and a seeder, changes **zero** runtime behavior, and touches no
live pipeline or reader. It is the foundation Phase 2 (`place_pulse` + reach) and Phase 3 (rollup) build on.

## 3. Sourcing decision (researched live, RULE 0.4)

Stay inside the **Census `rel2020` family** — the *same authority* as the existing crosswalk, so there is
one provenance story and no seam between sources. Verified present and same-format via crawl4ai on
07/07/2026:

- **ZCTA→county** — `https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_county20_natl.txt`
  *(already parsed into `swfl-zip-county.json`; the scope floor)*
- **ZCTA→place** — `https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_place20_natl.txt`
  *(the missing city layer; 9.4M national, same column family as the county file)*
- **Place canonical names + FIPS + centroid** — `https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2020_Gazetteer/2020_gaz_place_12.txt`
  (FL = state 12; gives `NAME`, `LSAD`, `GEOID`, `INTPTLAT`, `INTPTLONG`)

**Alternatives considered and rejected for Phase 1:**
- **GeoNames / OSM full hierarchy incl. neighborhoods now** — thinner authority for CDP/place-boundary
  truth, and it mixes GeoNames *postal codes* with Census *ZCTAs* (a provenance seam). Reserve GeoNames/OSM
  as the **Phase-2 neighborhood** source, where sub-place granularity genuinely needs a non-Census origin.
- **Just add a city column to the JSON fixture, nothing structured** — a flat column can't express the
  many-to-many ZCTA↔place overlap our data actually has, and can't be joined at read time the way
  Phases 2/3 need. We keep the fixture *format*, but structure it as a node list + overlap edges.

## 4. Key finding that shapes the node set (live-verified)

Grepping the FL gazetteer place file (07/07/2026) against our 13 current pulse units:

- **11 are real Census places** with FIPS: Bonita Springs (1207525), Cape Coral (1210275),
  Estero village (1221150), Fort Myers (1224125), Fort Myers Beach town (1224150),
  Golden Gate CDP (1226300), Lehigh Acres CDP (1239925), Marco Island (1243083), Naples city (1247625),
  North Fort Myers CDP (1249350), Sanibel (1263700). *(Immokalee CDP 1233250 also present.)*
- **"North Naples" and "East Naples" are NOT Census places** — no CDP, no FIPS. They are colloquial /
  realtor-area names. In a sourced gazetteer they cannot be nodes (RULE 1 — no invented places). They
  become a **documented alias gap** that Phase 2's resolver handles (resolving to their actual ZCTAs,
  e.g. 34109/34110, or to the containing Census place). Phase 1 does not rewire the pipeline, so their
  current capture behavior is unchanged until Phase 2.
- **Census adds real places we don't currently cover** and should include: Naples Park CDP (1247675),
  Naples Manor CDP (1247650), San Carlos Park CDP (1263425), Fort Myers Shores CDP (1224175). Including
  them is *finer real coverage for free*, not scope creep — they're inside our 6-county floor.

This is the substring-overmatch bug (`Naples` ⊂ `North Naples`) reappearing at the data layer: the fix is
to key on **Census GEOID**, never on a name substring.

## 5. Deliverables (exactly these; nothing else)

1. **`fixtures/swfl-places.json`** — the committed, sourced place hierarchy artifact (schema in §6).
2. **`ingest/pipelines/places_gazetteer/`** — an idempotent, reproducible seeder that regenerates
   `swfl-places.json` from the three Census files (§3), with `--dry-run` and a provenance stamp.
3. **Tests** — parser unit tests + data-invariant tests (§8).
4. **GHA cron wrapper** — freshness per `docs/standards/pipeline-freshness.md` (the Census rel files are
   decennial-stable, so cadence is annual/manual; the wrapper + `--dry-run` still ship in the same PR).

**NOT in Phase 1 (deferred, respecting brain-first + RULE 3 C2):** no `data_lake.places` table. The table
is created in **Phase 2's PR**, alongside its consumer (`place_pulse` + PackDefinition), so no orphan
`data_lake.*` table stands up ahead of a brain. `swfl-places.json` is the seed source-of-record until then.

## 6. Fixture schema — `fixtures/swfl-places.json`

Mirrors the existing crosswalk's provenance header + `primary_* / straddle-list` pattern so it reads as a
sibling of `swfl-zip-county.json`.

```
{
  "gazetteer_vintage": "2020 Census (rel2020 + 2020 Gazetteer, FL)",
  "source": "<the three Census file URLs from §3, verbatim>",
  "verified_date": "2026-07-07",
  "scope_note": "6-county SWFL floor = ZCTAs present in swfl-zip-county.json. Places included = any
                 Census place that overlaps an in-scope ZCTA. GEOID is the sole identity; names never
                 key resolution.",
  "nodes": [
    { "place_id": "county:12021", "geoid": "12021", "type": "county", "name": "Collier",
      "primary_parent": null, "centroid_lat": ..., "centroid_lon": ... },
    { "place_id": "place:1226300", "geoid": "1226300", "type": "place", "name": "Golden Gate",
      "lsad": "CDP", "primary_parent": "county:12021", "centroid_lat": ..., "centroid_lon": ... },
    { "place_id": "zcta:34116", "geoid": "34116", "type": "zcta", "name": "34116",
      "primary_parent": "place:1226300", "centroid_lat": ..., "centroid_lon": ... }
  ],
  "overlaps": [
    { "child": "zcta:34116", "parent": "place:1226300", "arealand_part": <m2>, "is_primary": true },
    { "child": "zcta:34116", "parent": "place:1247625", "arealand_part": <m2>, "is_primary": false }
  ]
}
```

- **`nodes`** — one row per real place. `place_id` is a namespaced surrogate (`type:geoid`) so a ZCTA and
  a place can never collide. `type ∈ {county, place, zcta}`; `neighborhood` is **reserved for Phase 2**.
  `primary_parent` is the dominant-overlap parent, giving Phase 2/3 a cheap single-parent tree walk.
- **`overlaps`** — the full many-to-many containment with `arealand_part` weight and an `is_primary` flag,
  preserving genuine straddles (a ZCTA spanning two places; a place spanning two counties) exactly the way
  the county crosswalk preserves `counties[]` today. `primary_parent` in `nodes` == the `is_primary` edge.
- **Centroids** come free from the gazetteer file and power "zoom on the named spot" (rules-of-engagement
  PLACES) and Phase-2 proximity resolution; sourced, not invented.

## 7. Seeder design — `ingest/pipelines/places_gazetteer/`

- **Scope floor:** read the in-scope ZCTA set from `fixtures/swfl-zip-county.json` (the existing authority).
  Only ZCTAs in that set, and only places overlapping them, enter the gazetteer. This inherits the
  crosswalk's documented county precedence and its excluded-mailing-ZIP discipline — no widening of scope.
  **Reference ≠ coverage:** the crosswalk (and therefore this gazetteer) spans the 6-county geographic
  floor, but per the locked SCOPE note (CLAUDE.md, 07/07/2026) our *real data* is Lee + Collier (core) with
  Hendry a minor addition; Charlotte/Glades/Sarasota nodes existing in the gazetteer is a geographic-reference
  fact, **not** a claim we hold data for them. The gazetteer is a place dimension, exactly as the crosswalk
  is a county-crosswalk reference — neither asserts coverage.
- **Parse:** the ZCTA→place file (child ZCTA, parent place GEOID, `AREALAND_PART`) → `overlaps`; the FL
  gazetteer place file → place `name`/`lsad`/`centroid`; the ZCTA→county file (already have it) → the
  county tier. `is_primary` = largest `AREALAND_PART` per child, matching the crosswalk's
  "primary = largest overlap" rule. Ties and sub-1% slivers handled the same way the crosswalk documents.
- **Probe first (ingest rule):** before parsing the 9.4M national ZCTA→place file, a <1-min probe confirms
  the exact column order/header live (columns are expected to mirror the county file:
  `GEOID_ZCTA5_20 | GEOID_PLACE_20 | NAMELSAD_PLACE_20 | AREALAND_PART | …`), rather than trusting this
  spec's memory of them.
- **Idempotent:** deterministic sort + stable `place_id` → re-running produces a byte-identical fixture
  (diff-noise-free). A `--dry-run` prints the node/overlap counts and the diff without writing.
- **No LLM** → no `RunBudget` needed. Still emits a provenance record (file URLs + vintage + row counts).

## 8. Testing / invariants

- **Parser units:** a known in-scope ZCTA (e.g. 34116) resolves to Golden Gate CDP as `is_primary` with a
  correct county tier; a straddle ZCTA emits ≥2 overlap edges with exactly one `is_primary`; an
  out-of-6-county ZCTA is dropped by the scope filter.
- **Data invariants (assert on the generated fixture):** every `zcta` node has ≥1 overlap edge and a
  non-null `primary_parent`; every `place` node has a county `primary_parent`; no orphan node; every
  `geoid` is 5 digits (county/zcta) or 7 digits (place) and traces to a Census file (no invented GEOID);
  the 11 known units from §4 are all present by GEOID; North/East Naples are absent (proving we didn't
  invent them).
- **Idempotency:** second `--dry-run` reports 0 diff.

## 9. Handoff to Phase 2 / Phase 3 (so this schema doesn't need re-migration)

- **Phase 2** creates `data_lake.places` + `data_lake.place_overlaps` from this fixture in the same PR as
  `place_pulse` + its PackDefinition (brain-first satisfied there), adds the **reach** axis on the *fact*
  table (not on `places`), and rewrites capture/distill to assign `home_place` (by GEOID) + `reach_level`.
  The alias gap (North/East Naples and other colloquial names) is resolved in the Phase-2 distill prompt +
  a small alias map, not in this fixture.
- **Phase 3** adds the read-time rollup helper (containment via `overlaps`) and migrates the ~12 reader
  surfaces + backfills the 142 existing rows.
- Reserved-but-empty now: `neighborhood` node type, and any `population/prominence` column (Phase-2
  toponym resolution may add it from Census population, sourced).

## 10. Guards honored

- **RULE 1 / no invented places:** every node's identity is a Census GEOID from a named file; North/East
  Naples deliberately excluded because Census has no such place.
- **Brain-first + RULE 3 C2:** no `data_lake.*` table in Phase 1; the fixture+seeder extend an existing
  artifact rather than erecting a new orphan table/gate.
- **Ingest conventions (`ingest/CLAUDE.md`):** probe <1 min before the multi-MB parse; `--dry-run` + cron
  wrapper ship in the same PR (pipeline-freshness); provenance stamped.
- **Data provenance (global rule 3):** source homepage URLs carried in the fixture header + seeder output.

## 11. Provenance

- Live code probed: `ingest/lib/pulse_match.py`, `ingest/pipelines/city_pulse/distill.py`,
  `fixtures/swfl-zip-county.json`.
- Live sources verified (crawl4ai + curl, 07/07/2026): Census `rel2020/zcta520/` directory
  (confirmed `tab20_zcta520_place20_natl.txt` exists), FL 2020 gazetteer place file
  (confirmed the 11 SWFL units + the absence of North/East Naples + 4 addable CDPs).
- Existing authority reused: `fixtures/swfl-zip-county.json` (Census ZCTA→county rel file).
