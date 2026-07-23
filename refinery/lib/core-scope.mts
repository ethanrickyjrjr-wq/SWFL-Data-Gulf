/**
 * core-scope — the ONE "SWFL ZIP universe" every ranked ZIP-grain surface counts against.
 *
 * Problem this solves: there was no shared denominator. The ZIP page's registry cards ranked a
 * ZIP against *every row a brain emitted* (94–126 keys — mailing/other-metro spillover), the
 * census cards ranked against the 6-county crosswalk (100 ZIPs), and `/charts` medians pooled the
 * raw lake view. So "of N SWFL ZIPs" drifted card-to-card (of 124, of 95, of 67, …).
 *
 * Core scope = Lee (12071) + Collier (12021) = 57 ZIPs — the two data-rich counties. This is a
 * *data-depth* choice, NOT the geographic definition of SWFL (Sarasota/Charlotte are SWFL too);
 * it is the honest universe to rank against because those two counties are the ones every
 * ZIP-grain brain actually holds data for. Hendry/Sarasota/Charlotte/Glades are dropped from
 * ranked outputs (thin data + agriculture-economy percentile distortion) but stay in the lake.
 *
 * Spec: docs/superpowers/specs/2026-07-11-zip-scope-core-design.md
 *
 * This is NOT `in_scope`. `resolveZip().in_scope` = "is this SWFL geography at all" (6-county,
 * 100 ZIPs) and remains the ingest/lake-write MOAT gate — untouched. `isCoreScope` is a narrower
 * predicate that lives BESIDE it, governing only ranked ZIP-grain display surfaces.
 *
 * G1 — PURE: static ESM JSON import only, NO `fs`. Must load inside the Vercel MCP function
 * (mirrors zip-resolver.mts).
 */
import zipCountyJson from "../../fixtures/swfl-zip-county.json";

/** Lee + Collier — the two core, data-rich counties. Hendry is deliberately excluded. */
export const CORE_SCOPE_COUNTY_FIPS: ReadonlySet<string> = new Set(["12071", "12021"]);

interface ZipCountyEntry {
  zip: string;
  primary_county: string;
  counties?: string[];
  county_names?: string[];
}

/**
 * The 57 core ZIPs, derived at module load from the county crosswalk — a ZIP is core iff its
 * `primary_county` is Lee or Collier. One predicate excludes BOTH leak layers at once: pure-leak
 * ZIPs are not in the fixture at all; Sarasota/Charlotte/Glades/Hendry are in the fixture but not
 * in the core FIPS.
 */
export const CORE_SCOPE_ZIPS: ReadonlySet<string> = new Set(
  (zipCountyJson.entries as ZipCountyEntry[])
    .filter((e) => CORE_SCOPE_COUNTY_FIPS.has(e.primary_county))
    .map((e) => e.zip),
);

// Build-time self-check: if the crosswalk fixture drifts, fail loudly at load with the count that
// broke, rather than silently ranking against the wrong universe.
if (CORE_SCOPE_ZIPS.size !== 57) {
  throw new Error(
    `core-scope: expected 57 core ZIPs (Lee 35 + Collier 22), derived ${CORE_SCOPE_ZIPS.size}. ` +
      `The swfl-zip-county.json crosswalk drifted — reconcile before shipping.`,
  );
}

/** The single denominator every ranked ZIP-grain surface uses. Mirrors CORE_SCOPE_ZIPS.size. */
export const TOTAL_CORE_ZIPS = CORE_SCOPE_ZIPS.size;

/** True iff `zip` is one of the 57 Lee/Collier core ZIPs. Trims; empty/garbage → false. */
export function isCoreScope(zip: string | number | null | undefined): boolean {
  return CORE_SCOPE_ZIPS.has(String(zip ?? "").trim());
}

/**
 * The core county NAMES ({"Lee", "Collier"}), derived from the same crosswalk filter that builds
 * CORE_SCOPE_ZIPS — so the ZIP universe and the county universe can never disagree. This is the
 * county-grain twin of isCoreScope: rollup surfaces (region/county totals from
 * data_lake.listing_active_stats) group by county NAME, a grain isCoreScope (a ZIP predicate)
 * can't reach. Hendry is in the lake but not core, so it is excluded here too.
 */
export const CORE_SCOPE_COUNTY_NAMES: ReadonlySet<string> = new Set(
  (zipCountyJson.entries as ZipCountyEntry[])
    .filter((e) => CORE_SCOPE_COUNTY_FIPS.has(e.primary_county))
    // county_names is index-aligned with counties; take the name for the PRIMARY county only —
    // a ZCTA that straddles a line also lists its neighbor (Charlotte/Hendry), which is not core.
    .map((e) => {
      const idx = (e.counties ?? []).indexOf(e.primary_county);
      return idx >= 0 ? e.county_names?.[idx] : undefined;
    })
    .filter((n): n is string => !!n),
);

// Same fail-loud posture as the ZIP self-check: if the crosswalk drifts, break at load.
if (CORE_SCOPE_COUNTY_NAMES.size !== 2) {
  throw new Error(
    `core-scope: expected 2 core county names (Lee, Collier), derived ${CORE_SCOPE_COUNTY_NAMES.size} ` +
      `[${[...CORE_SCOPE_COUNTY_NAMES].join(", ")}]. The swfl-zip-county.json crosswalk drifted.`,
  );
}

/**
 * zip -> its PRIMARY county name (index-aligned county_names[] lookup, same pattern as
 * CORE_SCOPE_COUNTY_NAMES above, but per-ZIP instead of aggregated to a Set). Covers every ZIP in
 * the crosswalk, core or not. Used by `dedupeCoreZipRows` below to give a straddling ZIP one
 * deterministic county label instead of whichever raw county string happened to win.
 */
export const PRIMARY_COUNTY_NAME_BY_ZIP: ReadonlyMap<string, string> = new Map(
  (zipCountyJson.entries as ZipCountyEntry[])
    .map((e): readonly [string, string] | null => {
      const idx = (e.counties ?? []).indexOf(e.primary_county);
      const name = idx >= 0 ? e.county_names?.[idx] : undefined;
      return name ? ([e.zip, name] as const) : null;
    })
    .filter((x): x is readonly [string, string] => x !== null),
);

/** True iff `name` is a core county ("Lee"/"Collier"). Strips a trailing " County", trims; garbage → false. */
export function isCoreCounty(name: string | null | undefined): boolean {
  return CORE_SCOPE_COUNTY_NAMES.has(
    String(name ?? "")
      .replace(/\s*County$/i, "")
      .trim(),
  );
}

/**
 * De-dupe ZIP-grain rows for a ZIP that straddles two counties (e.g. 33936 Lee/Hendry, 34134
 * Lee/Collier) — its GROUPING SETS-shaped source view groups by (county, zip_code), so it emits
 * one row per raw-listing county value even though the ZIP itself is one thing
 * (active_listings_zip_county_contamination). Mirrors `reduceActiveStats`'s "keepFattest" rule in
 * lib/desk/loaders.ts (verified 07/14/2026 against listing_active_stats: the row with the most
 * listings is the real one for that ZIP; a thin twin — including same-county whitespace-dirty
 * duplicates like 33971 — is not a second real population to add to it). Keeps the max-count row
 * per zip_code and relabels its county to the ZIP's canonical PRIMARY county so the label is
 * deterministic regardless of which raw county string happened to win.
 */
export function dedupeCoreZipRows<T extends { zip_code: string | null; county: string | null }>(
  rows: readonly T[],
  countOf: (row: T) => number,
): T[] {
  const fattest = new Map<string, T>();
  for (const r of rows) {
    const zip = r.zip_code;
    if (zip == null) continue;
    const prev = fattest.get(zip);
    if (!prev || countOf(r) > countOf(prev)) fattest.set(zip, r);
  }
  return [...fattest.values()].map((r) => {
    const primary = PRIMARY_COUNTY_NAME_BY_ZIP.get(r.zip_code as string);
    return primary && primary !== r.county ? { ...r, county: primary } : r;
  });
}
