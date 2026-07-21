import { describe, expect, test } from "bun:test";
import { toCorridorLinks } from "./corridors";

/**
 * Pins the contract that lets `app/sitemap.ts` use `fetchVerifiedCorridorSlugRows`
 * (two columns) instead of `fetchVerifiedCorridorRows` (`select("*")`).
 *
 * Measured 07/21/2026: the fat row set is 163 kB across 27 rows — 73 kB of it
 * narrative prose (`character_speculative` 39 kB, `character_facts` 24 kB,
 * `character_chart` 10 kB) that a list of URLs never renders. The slim read is
 * only safe while `toCorridorLinks` depends on NOTHING beyond `corridor_name`
 * and `city`. If someone adds a third field to CorridorLink, this test fails
 * and the sitemap must go back to the fat fetch (or the slim select must grow).
 */

/** A fat row as `select("*")` returns it — narrative columns included. */
const FAT_ROWS: Record<string, unknown>[] = [
  {
    corridor_name: "us-41-south",
    city: "Naples",
    verification_status: "verified",
    deleted_at: null,
    character: "lorem",
    character_facts: "a".repeat(900),
    character_speculative: "b".repeat(1400),
    character_chart: { series: [1, 2, 3] },
    character_citations: [{ url: "https://example.gov" }],
    asking_rent_psf: 31.5,
    vacancy_rate_pct: 4.2,
    absorption_sqft: 12000,
  },
  {
    corridor_name: "colonial-blvd",
    city: "Fort Myers",
    verification_status: "verified",
    deleted_at: null,
    character: "ipsum",
    character_facts: "c".repeat(900),
    character_speculative: "d".repeat(1400),
    character_chart: { series: [4, 5, 6] },
    character_citations: null,
    asking_rent_psf: 22.0,
    vacancy_rate_pct: 7.1,
    absorption_sqft: -3000,
  },
];

/** Exactly what `.select("corridor_name, city")` returns for those same rows. */
const SLIM_ROWS: Record<string, unknown>[] = FAT_ROWS.map((r) => ({
  corridor_name: r.corridor_name,
  city: r.city,
}));

describe("toCorridorLinks — slim vs fat row parity", () => {
  test("slim two-column rows yield identical links to full select(*) rows", () => {
    expect(toCorridorLinks(SLIM_ROWS)).toEqual(toCorridorLinks(FAT_ROWS));
  });

  test("slim rows still resolve slug, name, city and county", () => {
    const links = toCorridorLinks(SLIM_ROWS);
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link.slug.length).toBeGreaterThan(0);
      expect(link.name.length).toBeGreaterThan(0);
      expect(link.city.length).toBeGreaterThan(0);
      // county is derived from `city` alone — the slim set must be enough.
      expect(link.county).not.toBe("Unknown");
    }
  });

  test("a row with no corridor_name is dropped, never emitted as an empty-slug URL", () => {
    expect(toCorridorLinks([{ city: "Naples" }])).toHaveLength(0);
  });
});
