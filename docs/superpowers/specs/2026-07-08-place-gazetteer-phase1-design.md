# Sourced place gazetteer — Phase 1 of hyperlocal geo-scope (BUILD-READY)

- **Date:** 07/07/2026 (spec file stamped 07-08 by the build registrar; content anchored to the 07/07 parent brief)
- **Status:** BUILD-READY DESIGN — brainstormed + approved, sourced contracts verified verbatim in-session. No runtime code touched yet.
- **Parent program:** `docs/superpowers/specs/2026-07-07-hyperlocal-geo-scope-reweighting-design.md` (the RESEARCH BRIEF).
  That brief is a 3-subsystem program: (1) sourced gazetteer, (2) place-aware capture/distill + reach weighting,
  (3) read-time rollup + migration of ~12 reader surfaces + backfill. **This spec is Phase 1 only — the gazetteer.**
- **Check:** `place_gazetteer_phase1_live_verify` (open).
- **Sibling template:** `scripts/build_swfl_zip_county.py` — this builder is a direct sibling and copies its shape.
- **Author:** assistant, from live code probe (RULE 0.5) + live Census-source verification (RULE 0.4, crawl4ai + curl, 07/07/2026).

---

## 1. Problem (Phase-1 slice)

The pulse pipeline has no real place hierarchy. `ingest/lib/pulse_match.py:47` matches a city by naive substring
(`city.lower() in hay`), so "Naples" swallows "North Naples"/"East Naples"; sub-areas are treated as sibling
cities; there is no county→city→ZIP structure any consumer can join to. Everything the parent brief wants —
conflict-free one-place-per-fact resolution, reach that climbs a hierarchy, rollup by containment — is blocked on
the absence of a **sourced place tree**. Phase 1 builds exactly that tree and nothing else.

We already hold the bottom (ZIP) and the top (county): `fixtures/swfl-zip-county.json` is a Census-sourced
ZCTA→county crosswalk. The **city/place layer in the middle is missing**, and there is no artifact any pipeline
or pack can join a fact to.

## 2. Goal & non-goals

**Goal:** a **sourced, tested, reproducible place hierarchy** covering our geographic footprint —
**county → place (city / town / village / CDP) → ZCTA** — every node carrying its parent(s), overlap weights for
genuine straddles, place centroids, and full provenance. Delivered as a committed fixture + a builder script that
regenerates it, in the exact style of `build_swfl_zip_county.py`.

**Non-goals (deferred, and WHY):**
- **No `data_lake.places` table.** Brain-first gate + RULE 3 C2: a `data_lake.*` table must ship with its consuming
  brain/PackDefinition in the same PR. This gazetteer's consumer (`place_pulse` + packs) is Phase 2, so the table is
  created there. `fixtures/swfl-places.json` is the seed source-of-record until then.
- **No pipeline/reader/distill change.** Phase 1 is **additive-only** — zero runtime behavior change. The live
  city-pulse pipeline keeps running as-is.
- **No reach weighting, no neighborhoods, no backfill.** Phases 2/3.

## 3. The parent brief's 7 open questions — dispositions (nothing dropped)

1. **Gazetteer source of truth** — **RESOLVED here.** Census `rel2020` family (§5), same authority as the crosswalk.
2. **Reach rubric + thresholds** — **Phase 2** (reach lives on the fact table, not on `places`).
3. **Discrete levels vs continuous reach** — **Phase 2.**
4. **Ambiguity handling** (story names 2 places / none) — **Phase 2** distill/resolver.
5. **Neighborhood coverage** — **RESOLVED here:** Phase 1 lands at **ZCTA grain**; named neighborhoods (Old Naples,
   River District, Cape Coral quadrants) are sub-place, **absent from Census**, and become a **Phase-2** layer from a
   non-Census source (GeoNames/OSM). The `neighborhood` node type is reserved but empty in Phase 1.
6. **Migration vs re-distill of the 142 existing rows** — **Phase 3.**
7. **Prior art (CLAVIN / geoparsepy / Mordecai)** — **Phase 2** resolver.

## 4. Node-set finding that shapes the build (live-verified 07/07/2026)

Grepping the FL gazetteer place file against our 13 current pulse units:

- **11 are real Census places** (keep, by GEOID): Bonita Springs city (1207525), Cape Coral city (1210275),
  Estero village (1221150), Fort Myers city (1224125), Fort Myers Beach town (1224150), Golden Gate CDP (1226300),
  Lehigh Acres CDP (1239925), Marco Island city (1243083), Naples city (1247625), North Fort Myers CDP (1249350),
  Sanibel city (1263700).
- **"North Naples" and "East Naples" are NOT Census places** — no CDP, no FIPS (colloquial/realtor names). They
  **cannot be nodes** (RULE 1 — no invented places). Documented alias gap → **Phase-2 resolver** maps them to their
  actual ZCTAs (e.g. 34109/34110) or containing place. Phase 1 doesn't rewire the pipeline, so no behavior change.
- **Census adds real in-footprint places we don't cover** (included for free): Naples Park CDP (1247675),
  Naples Manor CDP (1247650), San Carlos Park CDP (1263425), Fort Myers Shores CDP (1224175), Immokalee CDP (1233250).
- **Consequence:** the gazetteer keys on **Census GEOID, never a name substring** — this is the root-cause fix.

## 5. Sourcing — three Census files, verbatim contracts (verified in-session)

All are the SAME authority as the existing crosswalk (one provenance story, no seam). **rel files are PIPE-delimited
with a UTF-8 BOM; the gazetteer is TAB-delimited with trailing-space padding.** Verbatim headers pulled 07/07/2026:

**(a) ZCTA→place** — the missing city layer — `.../rel2020/zcta520/tab20_zcta520_place20_natl.txt` (9.4 MB, pipe):
```
OID_ZCTA5_20|GEOID_ZCTA5_20|NAMELSAD_ZCTA5_20|AREALAND_ZCTA5_20|AREAWATER_ZCTA5_20|MTFCC_ZCTA5_20|CLASSFP_ZCTA5_20|
FUNCSTAT_ZCTA5_20|OID_PLACE_20|GEOID_PLACE_20|NAMELSAD_PLACE_20|AREALAND_PLACE_20|AREAWATER_PLACE_20|MTFCC_PLACE_20|
CLASSFP_PLACE_20|FUNCSTAT_PLACE_20|AREALAND_PART|AREAWATER_PART
```
Columns used: `GEOID_ZCTA5_20` (child ZCTA, 5-digit), `GEOID_PLACE_20` (parent place, 7-digit = state+place),
`NAMELSAD_PLACE_20` (e.g. "Golden Gate CDP" — carries the human type suffix), `AREALAND_PART` (ZCTA∩place land, m²),
`AREALAND_ZCTA5_20` (total ZCTA land, m² — denominator for straddle %).
**Two empty-side cases exist:** rows where the ZCTA side is blank (place has land outside any ZCTA — skipped by the
scope filter), and ZCTAs that appear in NO populated-place row (fully unincorporated — get a county-only parent, §9).

**(b) ZCTA→county** — the top tier — `.../rel2020/zcta520/tab20_zcta520_county20_natl.txt` (already parsed by the
crosswalk builder). Same shape, `GEOID_COUNTY_20` (5-digit) in place of the place fields.

**(c) FL place centroids** — `.../gazetteer/2020_Gazetteer/2020_gaz_place_12.txt` (FL = state 12, TAB-delimited):
```
USPS  GEOID  ANSICODE  NAME  LSAD  FUNCSTAT  ALAND  AWATER  ALAND_SQMI  AWATER_SQMI  INTPTLAT  INTPTLONG
```
Columns used: `GEOID` (join key), `INTPTLAT`, `INTPTLONG` (place centroid). Example verified live:
`Golden Gate CDP  GEOID 1226300  INTPTLAT 26.183598  INTPTLONG -81.703694`. **Trailing whitespace must be stripped.**
Names come from file (a)'s `NAMELSAD_PLACE_20`; file (c) is joined **only** for centroids (belt-and-suspenders that
the place is a real gazetteer entry). `LSAD` is a numeric code (25=city, 43/47=town/village, 57=CDP); we do NOT
decode it — the human type is parsed from the `NAMELSAD` suffix, which is unambiguous.

**Rejected alternatives:** GeoNames/OSM (thinner CDP authority; mixes postal codes with ZCTAs — a provenance seam) —
reserved as the Phase-2 neighborhood source. A flat city column on the existing fixture (can't express many-to-many
overlap, can't be joined at read time).

## 6. Deliverables (exactly these)

1. `fixtures/swfl-places.json` — the committed hierarchy artifact (schema §7).
2. `scripts/build_swfl_places.py` — the idempotent builder (algorithm §8), a sibling of `build_swfl_zip_county.py`:
   dry-run by default, `--write` to emit, fail-loud cross-checks, diagnostics to stdout.
3. `scripts/test_build_swfl_places.py` — pure-function unit tests on the parse/aggregate/straddle logic (§10).
4. GHA cron wrapper — freshness per `docs/standards/pipeline-freshness.md`. The Census rel files are decennial-stable,
   so cadence is **annual/manual** (a workflow that runs the builder in dry-run and fails if the committed fixture
   drifts from a fresh rebuild — a staleness tripwire, not a data refresher).

## 7. Fixture schema — `fixtures/swfl-places.json`

Header mirrors the crosswalk's provenance/precedence block. Body = node list + overlap-edge list. Example values are
illustrative; the builder computes them.
```
{
  "gazetteer_vintage": "2020 Census (rel2020 ZCTA↔place/county + 2020 Gazetteer FL places)",
  "source": "<the three §5 file URLs, verbatim>",
  "verified_date": "2026-07-07",
  "scope_note": "Scope floor = the 100 in-scope ZCTAs in swfl-zip-county.json (the SOLE scope authority).
                 Places = any Census place overlapping an in-scope ZCTA. GEOID is the sole identity; names
                 never key resolution. Reference ≠ coverage: geographic span is 6-county, but real DATA is
                 Lee+Collier (core) + Hendry (minor) per CLAUDE.md SCOPE (07/07/2026) — node existence for a
                 Charlotte/Glades/Sarasota place is a reference fact, not a data-coverage claim.",
  "primary_parent_rule": "For a ZCTA: the place with the largest AREALAND_PART overlap; if it overlaps no place
                          (unincorporated) its parent is its primary_county. For a place: the county carrying the
                          largest share of the place's land, derived by summing each member ZCTA's AREALAND_PART
                          attributed to that ZCTA's primary_county (crosswalk). Secondary parents kept at ≥1% of
                          the primary's weight (same MIN_SECONDARY_RATIO as the crosswalk); sub-1% slivers dropped.",
  "counts": { "counties": 6, "places": <computed>, "zctas": 100 },
  "nodes": [
    { "place_id": "county:12021", "geoid": "12021", "type": "county", "name": "Collier",
      "primary_parent": null },
    { "place_id": "place:1226300", "geoid": "1226300", "type": "place", "name": "Golden Gate", "lsad": "CDP",
      "primary_parent": "county:12021", "centroid_lat": 26.183598, "centroid_lon": -81.703694 },
    { "place_id": "zcta:34116", "geoid": "34116", "type": "zcta", "name": "34116",
      "primary_parent": "place:1226300" }
  ],
  "overlaps": [
    { "child": "zcta:34116", "parent": "place:1226300", "arealand_part": <m2>, "share_of_child": <0..1>, "is_primary": true },
    { "child": "zcta:34116", "parent": "place:1247625", "arealand_part": <m2>, "share_of_child": <0..1>, "is_primary": false },
    { "child": "place:1226300", "parent": "county:12021", "arealand_part": <m2>, "share_of_child": <0..1>, "is_primary": true }
  ]
}
```
- `place_id` is a namespaced surrogate (`type:geoid`) so a ZCTA and a place never collide. `type ∈ {county, place, zcta}`;
  `neighborhood` reserved for Phase 2.
- `nodes[].primary_parent` == the `is_primary` edge in `overlaps` (denormalized for a cheap single-parent tree walk).
- `overlaps` holds the full many-to-many containment with `arealand_part` and `share_of_child` (= arealand_part ÷ the
  child's total land), preserving genuine straddles exactly as the crosswalk preserves `counties[]`.
- **ZCTA centroids are deliberately absent** — they already live in `lib/geo/zip-centroid.ts` / `fl_zips.geojson`
  (RULE 0.5, don't duplicate). Only **place** centroids are new (from file (c)); they power "zoom on the named spot"
  (rules-of-engagement PLACES) and Phase-2 proximity resolution.

## 8. Builder algorithm — `scripts/build_swfl_places.py`

Copies `build_swfl_zip_county.py`'s spine: `urllib.request.urlopen(...).read().decode("utf-8-sig")` →
`csv.DictReader(io.StringIO(data), delimiter="|")`; dry-run default, `--write` emits; `json.dump(indent=2,
ensure_ascii=False)` + trailing `\n`, `newline="\n"`.

1. **Scope floor from the crosswalk (single authority).** Load `fixtures/swfl-zip-county.json`; build
   `IN_SCOPE = {e.zip}` (100 ZCTAs) and `ZCTA_PRIMARY_COUNTY = {e.zip: e.primary_county}`. Do NOT re-derive scope.
2. **Counties.** 6 nodes from the crosswalk's county set (`12015 Charlotte … 12115 Sarasota`), `primary_parent=null`.
3. **ZCTA→place overlaps.** Stream file (a). For each row with `GEOID_ZCTA5_20 ∈ IN_SCOPE` **and** non-empty
   `GEOID_PLACE_20`: record `overlap[zcta][place] += int(AREALAND_PART or 0)` and capture `place_name`
   (from `NAMELSAD_PLACE_20`), `zcta_total_land` (from `AREALAND_ZCTA5_20`). Every place seen here becomes a place node.
4. **ZCTA nodes + primary place.** For each in-scope ZCTA: `is_primary` place = argmax `AREALAND_PART`;
   `share_of_child = part ÷ zcta_total_land`; secondary place edges kept at ≥ `MIN_SECONDARY_RATIO (0.01)` × primary.
   **Unincorporated fallback:** a ZCTA with no place overlap gets `primary_parent = county:<its crosswalk primary_county>`
   and only a county edge (real case — e.g. Golden Gate Estates land).
5. **Place→county edges (derived, documented).** For each place, `county_weight[place][county] += AREALAND_PART(zcta,place)`
   for each member ZCTA, attributed to `ZCTA_PRIMARY_COUNTY[zcta]`. `primary_parent` = argmax; secondaries by the 1% rule.
   If a place's dominant county is out-of-scope (a place clipping in from Manatee/DeSoto), assign its largest **in-scope**
   county and log it in diagnostics (mirrors the crosswalk's fringe handling).
6. **Place centroids.** Stream file (c) (TAB-delimited, strip trailing space); join on `GEOID`; attach
   `centroid_lat/lon`. A place present in (a) but missing from (c) → centroid null + a diagnostic line (should be empty).
7. **Assemble + sort** deterministically (`type` then `geoid`) so re-runs are byte-identical.
8. **Fail-loud cross-checks (raise SystemExit, like the sibling):**
   - all 11 known units from §4 present by GEOID;
   - "North Naples"/"East Naples" absent from every `name` (proves no invention);
   - every in-scope ZCTA (100) has a node and a non-null `primary_parent`;
   - every place node has a county `primary_parent`; no orphan node; every `geoid` is 5 (county/zcta) or 7 (place) digits.
9. **Diagnostics to stdout** before trusting: node/edge counts by type; every place→primary_county for review;
   list of straddle ZCTAs (>1 place) and straddle places (>1 county); any null centroid; any out-of-scope-dominant place.

## 9. Edge cases (enumerated, all handled above)

- **Unincorporated ZCTA** (no place overlap) → county-only parent (§8.4). Expected for East-Naples/Golden Gate Estates land.
- **ZCTA straddling two places** → multiple place edges, one `is_primary` (§8.4).
- **Place straddling two counties** → multiple county edges, one `is_primary` (§8.5).
- **Place clipping in from a non-scope county** → in-scope county parent + diagnostic (§8.5).
- **Empty-ZCTA-side rows** in file (a) → skipped by the `IN_SCOPE` filter (§8.3).
- **BOM + delimiter mismatch** (pipe rel vs tab gazetteer) → `utf-8-sig` decode; per-file delimiter (§8).
- **Place in (a) but missing from (c)** → null centroid + diagnostic, never a crash (§8.6).

## 10. Testing / invariants

- **Unit (`test_build_swfl_places.py`, pure functions on tiny in-memory fixtures):** argmax primary selection; the 1%
  secondary rule keeps a 1.2% straddle and drops a 0.5% sliver; `share_of_child` math; unincorporated fallback yields a
  county parent; the derived place→county picks the majority county.
- **Invariants** are the §8.8 fail-loud checks — they run on every build, so a bad regenerate can never be committed.
- **Idempotency:** a second dry-run after `--write` reports an empty diff.

## 11. Reuse (RULE 0.5 — don't rebuild what exists)

- **Scope** is read from `fixtures/swfl-zip-county.json`, never re-derived — one scope authority.
- **ZCTA centroids** are NOT added — `lib/geo/zip-centroid.ts` + `fl_zips.geojson` already hold them.
- **Builder shape, provenance-header pattern, straddle rule, `--write` convention** all copied from
  `build_swfl_zip_county.py` so the two fixtures read as siblings.

## 12. Handoff to Phase 2 / 3 (so this schema needs no re-migration)

- **Phase 2** creates `data_lake.places` + `data_lake.place_overlaps` **from this fixture** in the same PR as
  `place_pulse` + its PackDefinition (brain-first satisfied there), adds the **reach** axis on the *fact* table (not on
  `places`), rewrites capture (one pass per top-level place) and distill (assign `home_place` by GEOID + `reach_level`),
  and resolves the North/East-Naples alias gap via the distill prompt + a small alias map.
- **Phase 3** adds the read-time rollup helper (containment via `overlaps`) and migrates the ~12 reader surfaces
  (`pulse_lake.py`, `city-pulse-swfl` / `corridor-pulse-swfl` / `cre-swfl` packs, `speaker.mts`, both pulse sources,
  email activation snapshot, ops scripts) + backfills the 142 existing rows.
- **Reserved-but-empty now:** the `neighborhood` node type; an optional `population/prominence` place column (Phase-2
  toponym resolution may add it from a sourced Census population field, for "bare Naples → the city, not a hamlet").

## 13. Gates / guards honored

- **RULE 1 / no invented places:** every node's identity is a Census GEOID from a named file; North/East Naples excluded
  because Census has no such place. Every number in the fixture traces to file (a) or (c).
- **Brain-first + RULE 3 C2:** no `data_lake.*` table in Phase 1; the fixture+builder extend an existing artifact rather
  than erecting a new orphan table/gate.
- **Pre-push gates:** none of Gate 2 (vocab/alias), Gate 4 (ingest destructive write — no DB write here), or Gate 5
  (pack⇆catalog — no pack) apply. Standard SESSION_LOG entry + `scripts/safe-push.mjs` + explicit-path staging still do.
- **Ingest ethos:** probe-before-parse already done (§5 headers verified live); dry-run default; cron freshness tripwire
  ships in the same PR; provenance stamped in the fixture header + builder stdout.
- **Data provenance (global rule 3):** source URLs carried in the fixture header and printed by the builder.

## 14. Provenance

- Live code probed: `ingest/lib/pulse_match.py`, `ingest/pipelines/city_pulse/distill.py`,
  `scripts/build_swfl_zip_county.py`, `fixtures/swfl-zip-county.json` (100 in-scope ZCTAs), `ingest/utils/zip_approx.py`.
- Live sources verified (crawl4ai + curl, 07/07/2026): Census `rel2020/zcta520/` directory listing (confirmed
  `tab20_zcta520_place20_natl.txt`); the ZCTA→place, ZCTA→county, and FL gazetteer place file headers (verbatim, §5);
  FL gazetteer grep (11 SWFL units present, North/East Naples absent, 4 addable CDPs + Immokalee).
- Existing authority reused: `fixtures/swfl-zip-county.json` (Census ZCTA→county rel file) as the sole scope source.
