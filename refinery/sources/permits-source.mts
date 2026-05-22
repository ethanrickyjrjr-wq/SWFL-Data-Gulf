import type { RawFragment } from "../types/fragment.mts";
import type { SourceConnector, CitationRow } from "../types/pack.mts";
import { fragmentId } from "../lib/ids.mts";
import { isoTimestamp, expiresDate } from "../lib/dates.mts";

/**
 * permits-swfl source connector — fill in fetch() with your data source.
 *
 * Trust tier (REPLACE THIS):
 *   1 = primary (federal / SEC / NOAA / official-stat agency)
 *   2 = verified editorial (curated, cited, human-reviewed)
 *   3 = secondary aggregator / industry report
 *   4 = inferred / weakly attested
 *
 * Single point of schema knowledge — if the source's column shape changes,
 * this is the only file to update.
 */

const SOURCE_ID = "permits-swfl_primary";

/** Normalized shape one fragment carries — Stage 2's fitScore() reads this. */
export interface PermitsNormalized {
  // TODO: define the normalized columns for one fragment
  placeholder: string;
}

export const permitsSource: SourceConnector = {
  source_id: SOURCE_ID,
  trust_tier: 3, // TODO: replace with the actual tier for this source
  async fetch(): Promise<RawFragment[]> {
    // TODO: fetch + normalize. For fixture-mode support, read env.source and
    // load refinery/__fixtures__/permits-swfl.sample.json when set to "fixture".
    throw new Error("permits-swfl-source: fetch() not implemented");
    // Reference shape — uncomment and adapt:
    // const fetched_at = isoTimestamp();
    // return rows.map((row): RawFragment<PermitsNormalized> => ({
    //   fragment_id: fragmentId(SOURCE_ID, String(row.id)),
    //   source_id: SOURCE_ID,
    //   source_trust_tier: 3,
    //   fetched_at,
    //   raw: row,
    //   normalized: { placeholder: String(row.id) },
    // }));
  },
  citationMeta(verifiedDate, ttlSeconds): Omit<CitationRow, "id"> {
    return {
      source:
        "TODO: human-readable source name (will appear in CITATION TABLE)",
      verified: verifiedDate,
      expires: expiresDate(verifiedDate, ttlSeconds),
    };
  },
};
