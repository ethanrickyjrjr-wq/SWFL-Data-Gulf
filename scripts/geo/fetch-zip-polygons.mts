/**
 * Fetch the 58 footprint ZCTA polygons from Census TIGERweb into a committed fixture.
 *
 *   bun scripts/geo/fetch-zip-polygons.mts [--dry-run]
 *
 * DELIBERATELY LOCAL AND OCCASIONAL. This never runs in CI — same posture as
 * `build-market-areas.mts`. Regenerate only on purpose; the fixture is the
 * artifact, and its diffs must be intentional.
 *
 * WHY NOT THE SHAPEFILE. The obvious source,
 * `https://www2.census.gov/geo/tiger/TIGER2024/ZCTA520/tl_2024_us_zcta520.zip`,
 * is 528,806,468 bytes (~504 MB, nationwide) and needs shapefile tooling we do
 * not have. TIGERweb serves the same geometry as GeoJSON over ArcGIS REST — the
 * request shape this repo already uses for the FDOR parcel layers. Probed live
 * 07/22/2026: 3 ZIPs returned 37,116 bytes, so all 58 is comfortably a
 * committable fixture rather than a build artifact.
 *
 * WHY NOT public/maps/fl_zips.geojson, WHICH WE ALREADY HOLD. That file covers
 * all 58 footprint ZIPs and its topology is intact, but its properties are
 * `ZCTA5CE10` / `GEOID10` / `INTPTLAT10` — 2010-vintage ZCTAs — while
 * `fixtures/swfl-zip-county.json` is 2020-ZCTA and `fixtures/swfl-zip-centroids.json`
 * is TIGER 2020 ZCTA5. The vintages are not interchangeable: measured
 * 07/22/2026, 2010 and 2020 disagree on a real edge (33903~33916 along the
 * Caloosahatchee is adjacent in 2020, not in 2010). Operator-selected
 * 07/22/2026 to fetch 2020 so this asset is vintage-matched to the crosswalk
 * and centroids it will be used beside. NOTE: `ingest/utils/zip_approx.py`'s
 * docstring calls that vendored file "TIGER/Line 2024", which its own 2010
 * field names contradict — tracked separately, not fixed here.
 *
 * Layer 2 is "2020 Census ZIP Code Tabulation Areas". Layer 3 is Labels — the
 * wrong one, it carries no geometry of use.
 */
import { readFile, writeFile } from "node:fs/promises";
import { footprintZips, type CountyEntry, type ZipFeature } from "./zip-adjacency-lib.mts";

const SERVICE =
  "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer";
const LAYER = 2;
const LAYER_NAME = "2020 Census ZIP Code Tabulation Areas";
const COUNTY_FIXTURE = "fixtures/swfl-zip-county.json";
const OUT = "fixtures/swfl-zip-polygons.json";

/** MM/DD/YYYY — the operator-facing date format. */
function asOf(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}/${p(d.getDate())}/${d.getFullYear()}`;
}

async function fetchPolygons(zips: string[]): Promise<ZipFeature[]> {
  // POST, not GET: 58 quoted ZIPs in a WHERE IN clause makes a long query
  // string, and ArcGIS accepts the identical parameters form-encoded.
  const body = new URLSearchParams({
    where: `ZCTA5 IN (${zips.map((z) => `'${z}'`).join(",")})`,
    outFields: "ZCTA5",
    returnGeometry: "true",
    outSR: "4326",
    f: "geojson",
  });

  const res = await fetch(`${SERVICE}/${LAYER}/query`, { method: "POST", body });
  if (!res.ok) throw new Error(`TIGERweb ${res.status} ${res.statusText}`);

  const json = (await res.json()) as {
    type?: string;
    error?: { message?: string };
    exceededTransferLimit?: boolean;
    features?: { properties?: Record<string, string>; geometry?: ZipFeature["geometry"] }[];
  };
  // ArcGIS reports failures as HTTP 200 with an error body. Trusting res.ok
  // alone would write an empty fixture and call it a success.
  if (json.error) throw new Error(`TIGERweb error: ${json.error.message ?? "unknown"}`);
  if (json.type !== "FeatureCollection") {
    throw new Error(`expected FeatureCollection, got ${json.type ?? "nothing"}`);
  }
  // A server-side row cap would truncate the set. The per-ZIP check below would
  // catch it too, but this names the actual cause instead of a missing-ZIP list.
  if (json.exceededTransferLimit) {
    throw new Error("TIGERweb exceededTransferLimit — response truncated; page the request");
  }

  return (json.features ?? []).map((f) => {
    const zip = f.properties?.ZCTA5;
    if (!zip) throw new Error("feature missing ZCTA5 property");
    const geometry = f.geometry;
    if (!geometry) throw new Error(`ZIP ${zip} returned no geometry`);
    if (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon") {
      const got = (geometry as { type: string }).type;
      throw new Error(`ZIP ${zip} returned unexpected geometry type ${got}`);
    }
    return { zip, geometry };
  });
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const countyRaw = JSON.parse(await readFile(COUNTY_FIXTURE, "utf8")) as {
    entries: CountyEntry[];
  };
  const wanted = footprintZips(countyRaw.entries);
  console.log(`footprint: ${wanted.length} ZIPs`);

  const features = await fetchPolygons(wanted);
  features.sort((a, b) => a.zip.localeCompare(b.zip));

  // A ZIP the service does not return would otherwise vanish silently and show
  // up later as a ZIP with no neighbours — a plausible-looking result that is
  // simply wrong. Fail here instead, naming the ZIPs.
  const returned = new Set(features.map((f) => f.zip));
  const missing = wanted.filter((z) => !returned.has(z));
  if (missing.length > 0) {
    throw new Error(
      `TIGERweb returned no polygon for ${missing.length} ZIP(s): ${missing.join(", ")}`,
    );
  }
  const extra = [...returned].filter((z) => !wanted.includes(z));
  if (extra.length > 0) throw new Error(`unexpected ZIP(s) returned: ${extra.join(", ")}`);

  const multi = features.filter((f) => f.geometry.type === "MultiPolygon").map((f) => f.zip);
  console.log(
    `fetched ${features.length} polygons · ${multi.length} MultiPolygon: ${multi.join(", ") || "(none)"}`,
  );

  const payload = {
    source: `U.S. Census TIGERweb, layer ${LAYER} "${LAYER_NAME}" (${SERVICE}/${LAYER}/query); GeoJSON in EPSG:4326.`,
    source_homepage: "https://tigerweb.geo.census.gov/tigerwebmain/TIGERweb_apps.html",
    layer_name: LAYER_NAME,
    zcta_vintage: "2020",
    verified_date: asOf(),
    note:
      "Footprint = ANY-county membership in Lee (12071) or Collier (12021), derived from " +
      `${COUNTY_FIXTURE} via footprintZips() — the same rule as build-market-areas.mts, ` +
      "including the 33955 Burnt Store straddle. Geometry is mixed Polygon/MultiPolygon; " +
      "readers must handle both. Deliberately 2020-vintage to match the county crosswalk " +
      "and centroid fixtures — public/maps/fl_zips.geojson is 2010 and disagrees on real edges.",
    zip_count: features.length,
    multipolygon_zips: multi,
    entries: features,
  };

  // Metadata pretty-printed so provenance is readable at the top of the file;
  // each entry on ONE line so a membership or geometry change shows up as a
  // 58-line diff instead of a million coordinate lines. Full float precision is
  // preserved deliberately — exact vertex equality is what makes adjacency work.
  const { entries: _entries, ...meta } = payload;
  const head = JSON.stringify(meta, null, 2); // ends with "\n}"
  const rows = features.map((f) => `    ${JSON.stringify(f)}`).join(",\n");
  const serialized = `${head.slice(0, -2)},\n  "entries": [\n${rows}\n  ]\n}\n`;

  if (dryRun) {
    console.log(`--dry-run: would write ${OUT} (${serialized.length} bytes)`);
    return;
  }
  await writeFile(OUT, serialized);
  console.log(`wrote ${OUT} (${serialized.length} bytes)`);
}

await main();
