/**
 * location-resolver — §B dispatcher of Universal Location Search.
 *
 * Accept ANY location string a human types — ZIP, place, county, corridor,
 * pocket, region, or address — and route it to the right resolution WITHOUT
 * forcing non-ZIP inputs through a fake ZIP. A corridor has no honest single
 * ZIP; a county query is county-grain. This is what turns "ZIP search" into
 * "search anything," and its output is what §C (fan-out) consumes.
 *
 * Plan: docs/superpowers/plans/2026-06-09-universal-location-search/02-dispatcher.md
 *
 * PURE DISPATCH over resolvers that already exist — no new data, no geocoder.
 * `resolveLocation` is async so §E can later wire `await geocodeAddress(...)`
 * into the `address` branch without changing any caller.
 *
 * Dispatch order — GAZETTEER FIRST (the corrected Immokalee reasoning, plan §B):
 *   1. ^\d{5}$            -> resolveZip                 -> kind:"zip"
 *   2. gazetteer place    -> resolveZip(place->zip)     -> kind:"place"   (beats corridor)
 *   3. county name        ->                            -> kind:"county"  (no ZIP)
 *   4. corridor / pocket  ->                            -> kind:"corridor"(no ZIP)
 *   5. "SWFL" / region    ->                            -> kind:"region"  (no ZIP)
 *   6. free text          -> address-shaped? -> kind:"address-unsupported" (pre-§E)
 *                            else             -> kind:"out-of-scope"
 *
 * Gazetteer runs BEFORE corridor so a name that is both a sourced place AND a
 * corridor pocket (e.g. "Estero") resolves to its honest primary ZIP, never a
 * no-ZIP corridor. It also rescues "Immokalee" -> 34142 deterministically with
 * no geocode call (resolvePlace would return matched:false for it).
 *
 * DEVIATION from 02-dispatcher.md (operator-style note, see plan README): the
 * brief types `corridor_id: string`. But the corridor resolver legitimately
 * returns a POCKET-ONLY match ("North Naples") with no single corridor — there
 * is no honest single ID — so `corridor_id` is `string | null` (null = pocket
 * grain; §C labels it by `pocket`).
 */
import { resolveZip, type ZipResolution, type CountyFips } from "./zip-resolver.mts";
import { resolvePlaceZip } from "./geography-gazetteer.mts";
import { resolvePlace as resolvePlaceRecord } from "./places-swfl.mts";
import { resolvePlace as resolveCorridor } from "./place-resolver.mts";
import { POCKET_COUNTY, type Pocket } from "./pockets.mts";

export type LocationInput =
  | { kind: "zip" | "place" | "address"; resolution: ZipResolution; matched?: string }
  | { kind: "corridor"; corridor_id: string | null; pocket: Pocket; county: CountyFips }
  | { kind: "county"; county: CountyFips; county_name: string }
  | { kind: "region" }
  | { kind: "out-of-scope"; raw: string }
  | { kind: "address-unsupported"; raw: string };

/** Lowercase, fold any non-alphanumeric run to one space, collapse + trim. */
function normalizeRegion(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The whole-region terms. A region query has no county/ZIP — it IS the lake. */
const REGION_TERMS = new Set<string>([
  "swfl",
  "sw fl",
  "sw florida",
  "southwest fl",
  "southwest florida",
  "south west florida",
]);

/** "lee"/"collier" pocket county -> the 5-digit FIPS used everywhere downstream. */
const POCKET_FIPS: Record<"lee" | "collier", CountyFips> = {
  lee: "12071",
  collier: "12021",
};

/** A leading house number ("16448 Rainbow Meadows Ct") marks a street address. */
const ADDRESS_SHAPE = /^\d+\s+\S/;

/**
 * Resolve any location string to a typed, grain-honest `LocationInput`.
 * Async to leave room for §E's geocoder in the `address` branch.
 */
export async function resolveLocation(input: string): Promise<LocationInput> {
  const raw = String(input ?? "").trim();

  // 1. bare ZIP
  if (/^\d{5}$/.test(raw)) {
    return { kind: "zip", resolution: resolveZip(raw) };
  }

  // 2. gazetteer place FIRST (sourced place -> primary ZIP; beats corridor)
  const gaz = resolvePlaceZip(raw);
  if (gaz) {
    return { kind: "place", resolution: resolveZip(gaz.zip), matched: gaz.place };
  }

  // 3. county name (only the county-grain records; places are owned by step 2)
  const rec = resolvePlaceRecord(raw);
  if (rec && rec.grain === "county") {
    return {
      kind: "county",
      county: rec.county_fips as CountyFips,
      county_name: rec.display,
    };
  }

  // 4. corridor / pocket
  const corr = resolveCorridor(raw);
  if (corr.matched && corr.pocket) {
    return {
      kind: "corridor",
      corridor_id: corr.corridor_id ?? null,
      pocket: corr.pocket,
      county: POCKET_FIPS[POCKET_COUNTY[corr.pocket]],
    };
  }

  // 5. whole-region
  if (REGION_TERMS.has(normalizeRegion(raw))) {
    return { kind: "region" };
  }

  // 6. free text: a street address (pre-§E, unsupported) vs a non-SWFL place
  if (ADDRESS_SHAPE.test(raw)) {
    return { kind: "address-unsupported", raw };
  }
  return { kind: "out-of-scope", raw };
}
