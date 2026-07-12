// lib/concoctions/author-section.ts — the author engine's awareness of the
// Datasets registry. PURE — no I/O, no React (mirrors lib/email/author-recipes.ts:
// advisory prose, deterministic keyword routing, RULE C2 no new gate).
//
// HARD CONSTRAINT (test-enforced): the section text contains ZERO digits so it
// can never collide with the no-invention prose lint or smuggle a figure —
// registry descriptions are digit-free by their own test.
import { concoctionIndex, getConcoction } from "./registry";

/** Advisory system-prompt section listing the datasets whose blocks the engine
 *  can seed. Appended into authorSystem exactly like the layout recipe. */
export function datasetsSection(): string {
  const lines = concoctionIndex().map((e) => `- ${e.label}: ${e.description}`);
  return [
    "DATASETS — curated real-data bundles the platform can drop into the layout as",
    "ready-made blocks (figures baked by the engine, never written by you). When the",
    "request clearly matches one, the engine may add its blocks after your layout —",
    "write prose that welcomes them; do not restate their numbers yourself.",
    ...lines,
  ].join("\n");
}

// Detection order is fixed: the more specific asks route first (flood claims
// before generic "market", corridors before ZIP activity). A miss returns null
// and the build is byte-identical to before datasets existed.
const DETECTORS: { id: string; re: RegExp }[] = [
  { id: "nfip-storm-years", re: /\bflood (claims?|insurance)\b|\bnfip\b|\bstorm year/i },
  {
    id: "corridor-profiles",
    re: /\bcorridors?\b|\bcommercial (rent|market|real estate)\b|\bcre\b|\bstorefront/i,
  },
  { id: "zip-listing-activity", re: /\b(new listings?|price cuts?|listing activity)\b/i },
  { id: "asking-price-trend", re: /\basking price\b|\bmedian asking\b/i },
];

/** Explicit id wins (validated against the registry); else keyword detection;
 *  unknown/empty explicit falls through, never throws (resolveRecipe's shape). */
export function resolveConcoction(
  explicit: string | null | undefined,
  prompt: string,
): string | null {
  if (typeof explicit === "string" && getConcoction(explicit)) return explicit;
  for (const d of DETECTORS) {
    if (d.re.test(prompt)) return d.id;
  }
  return null;
}

/** Derive the params a resolved dataset needs from the build's scope. Returns
 *  null when a REQUIRED param can't be satisfied — the seeding is skipped
 *  entirely rather than guessing (never invent a scope). */
export function paramsFromScope(
  id: string,
  scope: { kind?: string | null; value?: string | null } | null | undefined,
): Record<string, string> | null {
  if (id === "asking-price-trend") {
    const v = (scope?.value ?? "").trim().toLowerCase().replace(/\s+/g, "_");
    return v === "cape_coral" || v === "fort_myers" || v === "naples" ? { area: v } : null;
  }
  if (id === "zip-listing-activity") {
    const v = (scope?.value ?? "").trim();
    if (scope?.kind === "county" && (v === "Lee" || v === "Collier" || v === "Hendry")) {
      return { county: v };
    }
    return {}; // county is optional — all-ZIP view is a valid default
  }
  // corridor-profiles + nfip-storm-years take no required params.
  return {};
}
