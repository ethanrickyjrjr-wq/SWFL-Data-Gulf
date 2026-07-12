// lib/concoctions/registry.ts — the curated set. Adding a definition = one
// import + one array entry; the index below is what the picker and the AI see.
import type { ConcoctionDef } from "./types";
import { corridorProfiles } from "./defs/corridor-profiles";
import { zipListingActivity } from "./defs/zip-listing-activity";
import { nfipStormYears } from "./defs/nfip-storm-years";
import { askingPriceTrend } from "./defs/asking-price-trend";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const CONCOCTIONS: ConcoctionDef<any>[] = [
  corridorProfiles,
  zipListingActivity,
  nfipStormYears,
  askingPriceTrend,
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getConcoction(id: string): ConcoctionDef<any> | undefined {
  return CONCOCTIONS.find((d) => d.id === id);
}

/** Picker/AI-facing index — product copy only, no loaders, no digits
 *  (registry.test.ts pins digit-free descriptions so a figure can never
 *  smuggle through the authoring context). */
export function concoctionIndex() {
  return CONCOCTIONS.map((d) => ({
    id: d.id,
    label: d.label,
    description: d.description,
    category: d.category,
    tags: d.tags,
    paramKeys: Object.keys((d.params as unknown as { shape?: object }).shape ?? {}),
  }));
}
