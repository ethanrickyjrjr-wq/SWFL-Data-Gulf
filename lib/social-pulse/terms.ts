// lib/social-pulse/terms.ts
// Fixed v1 scan slots (spec 2026-07-05-social-pulse-swfl-design.md §1).
// Areas are the digest's slice buckets.
export type PulseArea =
  "cape-coral" | "naples" | "fort-myers" | "charlotte" | "bonita-estero" | "lehigh" | "swfl";

export interface PulseTerm {
  term: string; // bare hashtag name or search phrase (no '#')
  kind: "hashtag" | "search";
  area: PulseArea;
}

export const AREA_LABELS: Record<PulseArea, string> = {
  "cape-coral": "Cape Coral",
  naples: "Naples",
  "fort-myers": "Fort Myers",
  charlotte: "Punta Gorda & Charlotte",
  "bonita-estero": "Bonita Springs & Estero",
  lehigh: "Lehigh Acres",
  swfl: "SWFL-wide",
};

export const PULSE_TERMS: PulseTerm[] = [
  { term: "swflrealestate", kind: "hashtag", area: "swfl" },
  { term: "swfl", kind: "hashtag", area: "swfl" },
  { term: "floridarealestate", kind: "hashtag", area: "swfl" },
  { term: "capecoralrealestate", kind: "hashtag", area: "cape-coral" },
  { term: "capecoral", kind: "hashtag", area: "cape-coral" },
  { term: "naplesrealestate", kind: "hashtag", area: "naples" },
  { term: "naplesfl", kind: "hashtag", area: "naples" },
  { term: "fortmyersrealestate", kind: "hashtag", area: "fort-myers" },
  { term: "fortmyers", kind: "hashtag", area: "fort-myers" },
  { term: "puntagorda", kind: "hashtag", area: "charlotte" },
  { term: "bonitasprings", kind: "hashtag", area: "bonita-estero" },
  { term: "lehighacres", kind: "hashtag", area: "lehigh" },
  { term: "cape coral real estate", kind: "search", area: "cape-coral" },
  { term: "naples florida homes", kind: "search", area: "naples" },
];
