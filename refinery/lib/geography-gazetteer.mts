/**
 * Geography gazetteer — the list of SWFL areas we cover, shipped in every
 * payload's `_meta.geography` so a downstream (Tier-3) Claude can map any
 * named place to a pocket itself and NEVER say "not in our system" for a real
 * Lee/Collier location.
 *
 * This is the cheap, primary mechanism for place resolution (the consuming AI
 * already knows SWFL geography; it just needs to know which areas we hold).
 * `resolvePlace` is the server-side belt-and-suspenders for non-AI consumers.
 *
 * Built deterministically from `POCKETS` + display names — no hand-maintained
 * second copy to drift.
 */
import { POCKETS, POCKET_COUNTY, allPockets, type Pocket } from "./pockets.mts";
import { displayNameFor } from "./corridor-display.mts";

export interface GazetteerPocket {
  pocket: Pocket;
  county: "lee" | "collier";
  /** User-facing place names inside this pocket. */
  places: string[];
}

export interface GeographyGazetteer {
  note: string;
  metros: { lee: string; collier: string };
  pockets: GazetteerPocket[];
}

const NOTE =
  "These are the Southwest Florida areas (Lee + Collier counties) this data covers. " +
  "Map any place a user names to its nearest pocket below and answer at that altitude. " +
  "A colloquial place — a neighborhood, plaza, or landmark — that sits inside one of these " +
  "pockets IS covered: resolve it and answer, never say 'not in our system'. Zoom out to the " +
  "county/metro for a broad question; zoom into one pocket only when the user names a spot. " +
  "Decline only when a place is genuinely outside Lee or Collier county.";

export const GEOGRAPHY_GAZETTEER: GeographyGazetteer = {
  note: NOTE,
  metros: {
    lee: "Fort Myers / Cape Coral / Bonita-Estero (Lee County)",
    collier: "Naples (Collier County)",
  },
  pockets: allPockets().map((pocket) => ({
    pocket,
    county: POCKET_COUNTY[pocket],
    places: POCKETS[pocket].map((id) => displayNameFor(id)),
  })),
};
