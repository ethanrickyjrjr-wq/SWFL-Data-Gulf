# §B — Dispatcher: `resolveLocation(input)`

**Phase 1 · ~1 day · depends on: §A (`resolveZip`, types) · status: not started**
Read [`README.md`](./README.md) §0 first. §A must be merged before this is testable end-to-end.

---

## Goal
Accept ANY location string a human types — ZIP, address, city, county, corridor, neighborhood,
"SWFL" — and route it to the right resolution, **without forcing non-ZIP inputs through a fake
ZIP**. A corridor has no honest single ZIP; a county query is county-grain. This is what turns
"ZIP search" into "search anything."

## Files
- **New (pure):** `refinery/lib/location-resolver.mts` — exports `LocationInput`, `resolveLocation`.
- **New (test):** `refinery/lib/location-resolver.test.mts`.
- **Reuses:** `resolvePlace` (`refinery/lib/place-resolver.mts`), `ENTRY_BY_NORM` /
  `resolvePlaceZip` (`refinery/lib/geography-gazetteer.mts`), `resolveZip` (§A),
  `normalizePlace` + FIPS constants (`refinery/lib/places-swfl.mts`).

## Dispatch order — **gazetteer FIRST (PB3)**
1. `^\d{5}$` → `resolveZip` → `kind:"zip"`.
2. **Gazetteer exact/alias** (`ENTRY_BY_NORM`, place names + aliases) → the place's primary ZIP
   → `resolveZip` → `kind:"place"`.
3. **County name** — `normalizePlace("Lee County") → "lee county"` → `CountyFips` →
   `kind:"county"` (no ZIP).
4. **Corridor / pocket** — `resolvePlace` → `kind:"corridor"` (no ZIP). If it returns
   `confidence:"fuzzy"` AND the raw input also exact/alias-hits the gazetteer, **the gazetteer
   wins**.
5. **Region** — "SWFL" / "Southwest Florida" → `kind:"region"` (no ZIP).
6. Free text → `geocodeAddress` (§E) → ZIP → `kind:"address"`. Pre-§E, return
   `kind:"address-unsupported"` so §B ships in Phase 1 without a geocoder.

### Why gazetteer-first matters (the corrected Immokalee reasoning)
`resolvePlace("Immokalee")` returns **`matched:false`**, NOT a wrong corridor:
`levenshteinSimilarity("immokalee", "immokalee rd – north naples") ≈ 0.35 ≪ 0.82`
(`embedder.mts:159` = `1 − dist/maxLen`, which penalizes the length gap — verified). So the
risk is *not* a fuzzy mis-route to North Naples; it's that without checking the gazetteer first
we'd treat "Immokalee" as "no place" and fall through to the geocoder, **losing the real
crosswalk entry `34142`**. Gazetteer-first resolves it deterministically with no geocode call.

## Interface
```ts
export type LocationInput =
  | { kind: "zip" | "place" | "address"; resolution: ZipResolution; matched?: string }
  | { kind: "corridor"; corridor_id: string; pocket: string; county: CountyFips }
  | { kind: "county"; county: CountyFips; county_name: string }
  | { kind: "region" }
  | { kind: "out-of-scope"; raw: string }
  | { kind: "address-unsupported"; raw: string };
export function resolveLocation(input: string): Promise<LocationInput>;
```

## Acceptance — `bun test refinery/lib/location-resolver.test.mts`
- `"33908"` → `kind:"zip"`.
- `"Immokalee"` → `kind:"place"`, ZIP `34142`, `corridors:[]`, **no geocode call**.
- `"Lee County"` → `kind:"county"` (no ZIP).
- `"airport-pulling-naples"` → `kind:"corridor"` (no synthesized ZIP).
- `"SWFL"` → `kind:"region"`.
- `"Miami"` → `kind:"out-of-scope"`.
- `"16448 Rainbow Meadows Ct"` → `kind:"address-unsupported"` (pre-§E); `kind:"address"` (post-§E).
- Fuzzy-vs-gazetteer: a raw input that both fuzzy-hits a corridor and exact-hits a gazetteer
  place resolves via the **gazetteer**.
