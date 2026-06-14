# §A — The spine: `resolveZip(zip)`

**Phase 1 · ~1.5 days · depends on: nothing · status: not started**
Read [`README.md`](./README.md) §0 first (shared types + guards G1/G6/G7 + verified anchors).

---

## Goal
Given a ZIP, return its full geography nest — scope, county/counties, barrier classification,
the place names that contain it, and the corridors covering it — built entirely from data we
already hold. This is the foundation; every other section sits on it.

## Files
- **New (pure):** `refinery/lib/zip-resolver.mts` — exports `Grain`, `CountyFips`, `ZipResolution`,
  `resolveZip`. **G1: static ESM JSON imports only, NO `fs`** (mirror `geography-gazetteer.mts:16`).
- **New (test):** `refinery/lib/zip-resolver.test.mts`.
- **New (sourced fixture, G7):** `fixtures/swfl-zip-county.json`.

## The fixture — `fixtures/swfl-zip-county.json` (the scope + county floor)
- **Source:** U.S. Census 2024 TIGER **ZCTA-to-county relationship file**, filtered to the 6 SWFL
  counties (`12015` Charlotte, `12021` Collier, `12043` Glades, `12051` Hendry, `12071` Lee,
  `12115` Sarasota). Header carries `source` / `verified_date` / `note` exactly like the existing
  crosswalk. **Vendor-first:** fetch the live Census file URL in-session; do not transcribe from
  memory.
- **ZCTA ≈ ZIP caveat in the header.** Build the file as a **superset of every ZIP we publish**:
  union the Census ZCTA list with the ZIPs in `housing_by_zip`, the barrier table
  (`swfl-geo.mts`), ZORI, and Lee permits. Any held ZIP absent from the ZCTA file gets a
  **hand-sourced county + citation**. → the housing cross-check (in §C) passes *by construction*.
- **Shape:** `{ crosswalk_vintage, source, verified_date, note, entries: [{ zip, counties:
  CountyFips[], primary_county: CountyFips, county_names: string[] }] }`. `counties.length===2`
  only for genuine straddlers — this is the ONLY input that can make the straddle test fire
  (the place crosswalk's single-county entries cannot).

## Interface
```ts
export type Grain =
  | "zip" | "corridor" | "city" | "county" | "msa" | "region" | "state" | "national";
export type CountyFips =
  | "12015" | "12021" | "12043" | "12051" | "12071" | "12115";

export interface ZipResolution {
  zip: string; in_scope: boolean;
  counties: CountyFips[]; primary_county: CountyFips | null; county_names: string[];
  barrier: { classification: string | null; score: number | null; name: string | null };
  places: { place: string; match: "primary" | "alt"; county: string;
            usps_preferred_city: string; source: string; needs_verification: boolean }[];
  corridors: { corridor_id: string; pocket: string }[];
  resolution_notes: string[];
}
export function resolveZip(zip: string): ZipResolution;
```

## Layering — each source does ONE job (do not blur them)
- `swfl-zip-county.json` → **scope + county authority**. `in_scope = (zip present here)`.
- `fixtures/swfl-place-zip-crosswalk.json` (invert via the `ENTRY_BY_NORM` style at
  `geography-gazetteer.mts:89`) → **place names + context only** (the 11 places; NOT the universe
  of ZIPs). A ZIP can be one place's `zip` (primary) and another's `alt_zips` (alt) — e.g. `33913`
  = Gateway primary + Fort Myers alt. Sort primary-before-alt.
- `swfl-geo.mts` `barrierClassFor(zip)` → classification. **G6: when `record === null`, emit
  `barrier:{classification:null, score:null, name:null}` + a `resolution_note` "barrier
  classification not assessed for this ZIP." NEVER emit "inland" for an unclassified ZIP** (the
  "inland" default is override-safe logic, not a presentable fact — `swfl-geo.mts:182`).
- `pockets.mts` `corridorsInPocket` (Path A: place → pocket → corridor; no geometry). Naples needs
  a small `const NAPLES_POCKETS = ["Downtown Naples","North Naples","East Naples"]` (pockets.mts
  maps pocket→corridors only); attach all three, label "Naples-area".

## Honesty rules (each is a test case)
- Grain label is the **ZIP**, never a place name (place is human context).
- `34134` is alt of **both** Estero and Bonita Springs → deterministic tie-break (crosswalk
  order); test it can't flap.
- **Immokalee `34142`** → in scope (county fixture) but in NO pocket → `corridors:[]` + a note.
- County-spanning ZIP → `counties.length===2`; per-county handling happens downstream.
- A crosswalk entry with `needs_verification:true` → surface it in `resolution_notes`.
- Out-of-scope ZIP (e.g. `33101` Miami) → `in_scope:false`, empty places/corridors.

## Acceptance — `bun test refinery/lib/zip-resolver.test.mts`
All honesty rules above, PLUS the **Pushback-1 regressions** (these are why the fixture exists):
- `resolveZip("33924")` (Captiva) and `resolveZip("33903")` (N. Fort Myers) → `in_scope:true`
  with correct county — both are absent from the place crosswalk but real SWFL ZIPs.
- An in-scope ZIP absent from the barrier table never yields `classification:"inland"` (G6).
- `resolveZip("34142")` → `in_scope:true`, `corridors:[]`.
- `resolveZip("33101")` → `in_scope:false`.
