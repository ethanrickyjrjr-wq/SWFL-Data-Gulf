/**
 * Derive the ZIP shared-boundary adjacency graph from the committed polygons.
 *
 *   bun scripts/geo/build-zip-adjacency.mts [--dry-run]
 *
 * Reads `fixtures/swfl-zip-polygons.json` (see fetch-zip-polygons.mts) and emits
 * `fixtures/swfl-zip-adjacency.json`. Local and occasional, never CI — the
 * fixture is the artifact and its diffs must be intentional.
 *
 * The real work is in `zip-adjacency-lib.mts`, which is unit-tested against
 * synthetic geometry for the two silent-wrongness modes (dropped MultiPolygon
 * parts, corner-touch counted as adjacency). This script is the I/O shell plus
 * the guards only real data can trip.
 *
 * ISOLATED ZIPS ARE REPORTED, NOT FAILED. A ZIP with no in-set neighbour is
 * usually a bug — but not always. Barrier islands and footprint-edge ZIPs
 * legitimately have every neighbour across water or outside Lee/Collier. That
 * distinction needs a human, so the list is printed and recorded in-fixture
 * rather than silently accepted or wrongly rejected.
 */
import { readFile, writeFile } from "node:fs/promises";
import {
  buildAdjacency,
  footprintZips,
  type CountyEntry,
  type ZipFeature,
} from "./zip-adjacency-lib.mts";

const POLYGONS = "fixtures/swfl-zip-polygons.json";
const COUNTY_FIXTURE = "fixtures/swfl-zip-county.json";
const OUT = "fixtures/swfl-zip-adjacency.json";

/** MM/DD/YYYY — the operator-facing date format. */
function asOf(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}/${p(d.getDate())}/${d.getFullYear()}`;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const polyRaw = JSON.parse(await readFile(POLYGONS, "utf8")) as {
    verified_date: string;
    zcta_vintage?: string;
    entries: ZipFeature[];
  };
  const countyRaw = JSON.parse(await readFile(COUNTY_FIXTURE, "utf8")) as {
    entries: CountyEntry[];
  };

  // The polygons fixture and the county crosswalk must still describe the same
  // 58. If someone regenerates one and not the other, the graph would quietly
  // cover a different footprint than everything else reads.
  const wanted = footprintZips(countyRaw.entries);
  const have = polyRaw.entries.map((e) => e.zip).sort();
  if (JSON.stringify(wanted) !== JSON.stringify(have)) {
    const missing = wanted.filter((z) => !have.includes(z));
    const extra = have.filter((z) => !wanted.includes(z));
    throw new Error(
      `${POLYGONS} does not match the footprint — missing: [${missing.join(", ")}] ` +
        `extra: [${extra.join(", ")}]. Re-run fetch-zip-polygons.mts.`,
    );
  }

  const adjacency = buildAdjacency(polyRaw.entries);

  const zipCount = Object.keys(adjacency).length;
  const links = Object.values(adjacency).reduce((a, n) => a + n.length, 0) / 2;
  const isolated = Object.entries(adjacency)
    .filter(([, n]) => n.length === 0)
    .map(([z]) => z);
  console.log(
    `${zipCount} ZIPs · ${links} links · mean ${((links * 2) / zipCount).toFixed(2)} neighbours`,
  );
  console.log(`isolated (review by hand): ${isolated.length ? isolated.join(", ") : "(none)"}`);

  const payload = {
    source_fixture: POLYGONS,
    source:
      "Derived from U.S. Census TIGERweb 2020 ZCTA polygons — shared-boundary (rook) " +
      "contiguity: two ZIPs are adjacent when they share at least one boundary segment. " +
      "A single shared corner vertex is not adjacency.",
    source_homepage: "https://tigerweb.geo.census.gov/tigerwebmain/TIGERweb_apps.html",
    zcta_vintage: polyRaw.zcta_vintage ?? "2020",
    // Guard #7: anything built on this must be able to detect that the polygons
    // moved underneath it.
    polygons_verified_date: polyRaw.verified_date,
    verified_date: asOf(),
    note:
      "Isolated ZIPs have no in-footprint neighbour — expected for barrier islands and " +
      "footprint-edge ZIPs whose neighbours lie outside Lee/Collier, a bug anywhere else. " +
      "Reviewed by hand at generation; see SESSION_LOG.",
    caveat_water_mediated_links:
      "THIS IS NOT LAND ADJACENCY. ZCTA boundaries follow census blocks, which include " +
      "water area, so two ZIPs can share a boundary out in open water. Measured 07/22/2026: " +
      "33957 (Sanibel, an island) touches 33908 (mainland) across San Carlos Bay via 4 " +
      "shared segments, against 107 for the genuine land boundary 33901~33916. A consumer " +
      "that treats every link as land-connected will cross water. The barrier-class check " +
      "in refinery/lib/swfl-geo.mts is still required — this asset does not replace it.",
    zip_count: zipCount,
    link_count: links,
    isolated_zips: isolated,
    adjacency,
  };

  if (dryRun) {
    console.log(`--dry-run: would write ${OUT}`);
    return;
  }
  await writeFile(OUT, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`wrote ${OUT}`);
}

await main();
