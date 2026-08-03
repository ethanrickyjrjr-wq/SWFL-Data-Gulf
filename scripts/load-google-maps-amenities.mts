// Load Apify Google Maps amenity pulls into data_lake.google_maps_amenities.
// One-time county ground-truth (08/03/2026); re-runnable — upserts on place_id.
//
// Usage:
//   apify datasets get-items <datasetId> --format json > lee.json   (per county)
//   bun scripts/load-google-maps-amenities.mts --file lee.json --county Lee [--as-of 2026-08-03]
//
// Rows are carried verbatim from the scrape; isAdvertisement rows are skipped
// (paid placements, not amenity ground truth). Nothing is invented — every field
// maps 1:1 from the Apify dataset item; source_url is the place's Google Maps URL.
import { readFileSync } from "fs";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const file = arg("--file");
const county = arg("--county");
const asOf = arg("--as-of") ?? new Date().toISOString().slice(0, 10);
if (!file || !county) {
  console.error(
    "usage: bun scripts/load-google-maps-amenities.mts --file <items.json> --county <Lee|Collier> [--as-of YYYY-MM-DD]",
  );
  process.exit(1);
}

const secrets = readFileSync(".dlt/secrets.toml", "utf8");
function tomlStr(key: string): string {
  const m = secrets.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, "m"));
  if (!m) throw new Error(`Could not find ${key} in .dlt/secrets.toml`);
  return m[1];
}
const connStr = `postgres://${tomlStr("username")}:${encodeURIComponent(tomlStr("password"))}@${tomlStr("host")}:5432/${tomlStr("database")}?sslmode=require`;
const sql = new Bun.SQL(connStr);

type MapsItem = {
  placeId?: string;
  title?: string;
  categoryName?: string;
  categories?: string[];
  totalScore?: number;
  reviewsCount?: number;
  location?: { lat?: number; lng?: number };
  street?: string;
  city?: string;
  postalCode?: string;
  neighborhood?: string;
  website?: string;
  phone?: string;
  permanentlyClosed?: boolean;
  temporarilyClosed?: boolean;
  searchString?: string;
  url?: string;
  scrapedAt?: string;
  isAdvertisement?: boolean;
};

const items: MapsItem[] = JSON.parse(readFileSync(file, "utf8"));
let loaded = 0;
let skippedAds = 0;
let skippedNoId = 0;

for (const it of items) {
  if (it.isAdvertisement) {
    skippedAds++;
    continue;
  }
  if (!it.placeId || !it.title) {
    skippedNoId++;
    continue;
  }
  await sql`
    INSERT INTO data_lake.google_maps_amenities (
      place_id, county, title, category_name, categories, total_score, reviews_count,
      lat, lng, street, city, postal_code, neighborhood, website, phone,
      permanently_closed, temporarily_closed, search_string, source_url, scraped_at, as_of
    ) VALUES (
      ${it.placeId}, ${county}, ${it.title}, ${it.categoryName ?? null},
      ${JSON.stringify(it.categories ?? [])}::jsonb,
      ${it.totalScore ?? null}, ${it.reviewsCount ?? null},
      ${it.location?.lat ?? null}, ${it.location?.lng ?? null},
      ${it.street ?? null}, ${it.city ?? null}, ${it.postalCode ?? null},
      ${it.neighborhood ?? null}, ${it.website ?? null}, ${it.phone ?? null},
      ${it.permanentlyClosed ?? null}, ${it.temporarilyClosed ?? null},
      ${it.searchString ?? null}, ${it.url ?? "https://www.google.com/maps"},
      ${it.scrapedAt ?? null}, ${asOf}
    )
    ON CONFLICT (place_id) DO UPDATE SET
      county = EXCLUDED.county,
      title = EXCLUDED.title,
      category_name = EXCLUDED.category_name,
      categories = EXCLUDED.categories,
      total_score = EXCLUDED.total_score,
      reviews_count = EXCLUDED.reviews_count,
      lat = EXCLUDED.lat, lng = EXCLUDED.lng,
      street = EXCLUDED.street, city = EXCLUDED.city, postal_code = EXCLUDED.postal_code,
      neighborhood = EXCLUDED.neighborhood, website = EXCLUDED.website, phone = EXCLUDED.phone,
      permanently_closed = EXCLUDED.permanently_closed,
      temporarily_closed = EXCLUDED.temporarily_closed,
      search_string = EXCLUDED.search_string, source_url = EXCLUDED.source_url,
      scraped_at = EXCLUDED.scraped_at, as_of = EXCLUDED.as_of`;
  loaded++;
}

const count =
  await sql`SELECT count(*)::int AS n FROM data_lake.google_maps_amenities WHERE county = ${county}`;
console.log(
  `${county}: loaded ${loaded} (ads skipped ${skippedAds}, no-id skipped ${skippedNoId}); table now holds ${count[0].n} ${county} rows`,
);
await sql.end();
