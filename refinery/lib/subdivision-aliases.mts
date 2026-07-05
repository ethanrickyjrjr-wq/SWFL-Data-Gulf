/**
 * Subdivision → marketed-community alias reconciler.
 *
 * The spatial join (`ingest/duckdb_pipelines/parcel_neighborhood`) assigns each parcel to a raw
 * platted-subdivision polygon whose name is a plat label like "HERITAGE BAY UNIT 12". A marketed
 * community (Heritage Bay) is usually the UNION of several such plats. This module collapses the
 * platted names to a canonical community slug so per-community aggregates and the community pages
 * key off one stable id.
 *
 * Unlike `corridor-aliases.mts` (a 1:1 identity/drift-sentinel map), this is a ONE-TO-MANY map:
 * many normalized platted-name prefixes → one community. It reuses that file's test DISCIPLINE
 * (no empty patterns, no pattern claimed by two communities) — not its data shape.
 *
 * Seeded small from the Part-A boundary-name dump; grown as Phase 2's scrape supplies clean
 * marketed names (the bootstrap trick). An unknown name resolves to `null` — a coverage hole to
 * fill from a real source, never an invented community.
 */

export type CommunitySlug = string;

/** Normalize a raw platted-subdivision name to its marketed-community stem:
 *  uppercase, drop plat qualifiers (UNIT/PHASE/TRACT/REPLAT/…) and everything after,
 *  strip punctuation, collapse whitespace. "HERITAGE BAY UNIT 12, PHASE 1" -> "HERITAGE BAY". */
export function normalizeSubdivisionName(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/\b(UNIT|PHASE|TRACT|BLOCK|BLK|REPLAT|AMENDED|ADDITION|ADD|SECTION|SEC)\b.*$/u, "")
    .replace(/[^A-Z0-9 ]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

/** Canonical marketed community -> the normalized platted-name prefixes that roll into it.
 *  Seeded from the Part-A boundary-name dump + Phase-2 clean names. */
export const COMMUNITY_ALIASES: Record<CommunitySlug, { label: string; patterns: string[] }> = {
  "heritage-bay": { label: "Heritage Bay", patterns: ["HERITAGE BAY"] },
  // … populated from the Part-A dump + Phase-2 clean names (bootstrap trick).
};

// Reverse index: normalized pattern -> community slug (built once).
const _PATTERN_INDEX: Map<string, CommunitySlug> = (() => {
  const m = new Map<string, CommunitySlug>();
  for (const [slug, { patterns }] of Object.entries(COMMUNITY_ALIASES)) {
    for (const p of patterns) m.set(p, slug);
  }
  return m;
})();

/** Roll a raw platted-subdivision name up to its marketed community, or null if unknown. */
export function communityForSubdivision(rawName: string): CommunitySlug | null {
  return _PATTERN_INDEX.get(normalizeSubdivisionName(rawName)) ?? null;
}
