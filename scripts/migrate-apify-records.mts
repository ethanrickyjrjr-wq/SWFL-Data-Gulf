// scripts/migrate-apify-records.mts
// Idempotent: data_lake.apify_property_records — the store for EVERY field the Apify
// realtor.com actor returns, instead of reading 2 of 69 and dropping the rest.
//
// Operator, 08/04/2026, on being shown the 69-field list: "we want all of that!!!!!"
//
// WHY A `raw` JSONB COLUMN AND NOT JUST TYPED COLUMNS: the promoted columns are the
// ones we query on today. `raw` holds the untouched record so that the NEXT field we
// discover we need (style, hoa_fee, tax_history, nearby_schools…) is already on disk
// and does not cost a second purchase. Losing fields we already paid for is the exact
// failure this table exists to end.
//
// Run: bun scripts/migrate-apify-records.mts
import { readFileSync } from "fs";

const secrets = readFileSync(".dlt/secrets.toml", "utf8");
const tomlStr = (key: string): string => {
  const m = secrets.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, "m"));
  if (!m) throw new Error(`missing ${key} in .dlt/secrets.toml`);
  return m[1]!;
};
const port = secrets.match(/^port\s*=\s*(\d+)/m)?.[1] ?? "5432";
const sql = new Bun.SQL(
  `postgres://${tomlStr("username")}:${encodeURIComponent(tomlStr("password"))}@${tomlStr("host")}:${port}/${tomlStr("database")}?sslmode=require`,
);

await sql.unsafe(`
  CREATE SCHEMA IF NOT EXISTS data_lake;

  CREATE TABLE IF NOT EXISTS data_lake.apify_property_records (
    -- Natural key: normalised "street city". Keeping CITY in the key is what stops
    -- "330 5th St, Naples" lending its specs to "330 5th St, Fort Myers".
    address_key       text PRIMARY KEY,
    property_id       text,
    listing_id        text,
    street            text,
    unit              text,
    city              text,
    state             text,
    zip_code          text,
    county            text,
    latitude          double precision,
    longitude         double precision,
    -- specs
    beds              integer,
    full_baths        numeric,
    half_baths        numeric,
    baths_total       numeric,
    sqft              integer,
    lot_sqft          integer,
    year_built        integer,
    stories           numeric,
    style             text,
    parking_garage    numeric,
    new_construction  boolean,
    -- money
    list_price        numeric,
    price_per_sqft    numeric,
    estimated_value   numeric,
    assessed_value    numeric,
    hoa_fee           numeric,
    tax               numeric,
    last_sold_price   numeric,
    last_sold_date    date,
    sold_price        numeric,
    -- lifecycle
    mls               text,
    mls_status        text,
    status            text,
    list_date         date,
    pending_date      date,
    days_on_mls       integer,
    last_status_change_date date,
    -- content
    description       text,
    primary_photo     text,
    alt_photos        jsonb,
    property_url      text,
    permalink         text,
    -- EVERYTHING, always. The promoted columns above are a convenience; this is the
    -- guarantee that a field we did not think to promote is still ours.
    raw               jsonb NOT NULL,
    source_tag        text NOT NULL DEFAULT 'apify_realtor',
    fetched_at        timestamptz NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS apify_property_records_zip_idx
    ON data_lake.apify_property_records (zip_code);
  CREATE INDEX IF NOT EXISTS apify_property_records_fetched_idx
    ON data_lake.apify_property_records (fetched_at DESC);
  CREATE INDEX IF NOT EXISTS apify_property_records_property_id_idx
    ON data_lake.apify_property_records (property_id);

  -- POSTGREST CANNOT SEE A TABLE IT WAS NEVER GRANTED. Creating the table over a
  -- direct Postgres connection is only half the job: the app talks to it through
  -- PostgREST as service_role, and without these grants every write returns an error
  -- the caller swallows — the table sits at ZERO rows while every vendor call still
  -- bills. Measured exactly that on the first run 08/04/2026. Same landmine as the
  -- dlt -> PostgREST grant note in the standards.
  GRANT USAGE ON SCHEMA data_lake TO service_role, authenticated, anon;
  GRANT SELECT, INSERT, UPDATE ON data_lake.apify_property_records TO service_role;
`);

// PostgREST caches the schema; a brand-new table is invisible until it reloads.
await sql.unsafe(`NOTIFY pgrst, 'reload schema'`);

const [{ count }] = await sql`
  SELECT count(*)::int AS count FROM data_lake.apify_property_records
`;
const cols = await sql`
  SELECT count(*)::int AS n FROM information_schema.columns
  WHERE table_schema = 'data_lake' AND table_name = 'apify_property_records'
`;
console.log(`data_lake.apify_property_records ready — ${cols[0]!.n} columns, ${count} rows`);
await sql.end();
