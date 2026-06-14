# §E — Address geocoding: `geocodeAddress(q)`

**Phase 3 · ~1–2 days · depends on: §B + a Mapbox secret · status: not started**
Read [`README.md`](./README.md) §0 first. **Guard G4 is mandatory and blocking.**

---

## Goal
Turn a free-text street address into lat/lon + ZIP so the dispatcher (§B) can fan it out. This
is the "16448 Rainbow Meadows Ct" path. **Honest boundary:** address resolves to **ZIP +
corridor grain** (full fan-out) — NOT the value of that exact parcel (that's §G; we don't hold
the join today).

## G4 — verify the vendor surface BEFORE writing code (non-negotiable)
1. Make **one real forward-geocode call** and inspect the actual JSON. The Mapbox MCP
   (`search_and_geocode`) is fine for the in-session sanity check.
2. **Lock the `postcode` (ZIP) and coordinate field paths from a direct curl/WebFetch of the
   live HTTP endpoint** — runtime code calls the HTTP API, not the MCP, so the API's response
   shape is the source of truth. Do NOT write field names from memory; the v6 docs are
   JS-rendered and were unfetchable at plan time.
3. Provider: **Mapbox primary** (returns lat/lon + postcode + place in one call → feeds
   `resolveZip` and `assignCorridor` at `refinery/lib/corridor-assignment.mts:66`).
   **Census batch** (`ingest/pipelines/collier_permits/geocoder.py`) is the ONLY approved
   fallback. No third vendor.

## Secret wiring is TWO steps (pre-push gate rule 3)
Add `MAPBOX_TOKEN` (bare name per the no-`BRAINS_` convention — confirm the exact env var the
chosen call expects) to **Vercel project env AND local `.env`**. `gh secret set` / dashboard is
step 1; the runtime `process.env` read + the workflow `env:` block is step 2. A secret isn't
live until both are done.

## Files
- **New:** `lib/geocode.ts`.
- **Modify:** `refinery/lib/location-resolver.mts` (§B) — wire the `address` branch to call this.

## Interface
```ts
export interface GeocodeResult {
  lat: number; lon: number; zip: string | null;
  place: string | null; region: string | null;
  confidence: number; provider: "mapbox" | "census";
}
export function geocodeAddress(q: string): Promise<GeocodeResult | null>;
```

## Acceptance
- `geocodeAddress("16448 Rainbow Meadows Ct, Fort Myers FL")` → a `33908`-family ZIP; wired so
  `/api/where?q=<that address>` returns a dossier.
- **Neighborhood fall-through:** "Pelican Bay" (no crosswalk/corridor hit) → geocoder → a Naples
  ZIP. This is the long-tail rescue path for human place names the gazetteer doesn't carry.
- A G4 evidence note (the real JSON field paths) is recorded before `lib/geocode.ts` is written.
