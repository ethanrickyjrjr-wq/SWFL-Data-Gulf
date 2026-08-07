// scripts/migrate-lee-permits-bulk-columns.mts
// Adds the four columns the lee_permit_history_bulk records-request extract (26-3047.csv,
// Lee County Community Development, 515,086 rows 2018-2026) carries that the live Accela
// scrape (ingest/pipelines/lee_permits) never captured: PARCEL_NO (a real, if imperfect,
// join key into leepa_parcels.strap/lee_parcels.parcel_id — measured 74.6%/77.2% match on
// a 5,002-row sample), owner name, application_date, finaled_date.
//
// owner_name follows the steadyapi_property_permits convention: landed in the lake,
// never surfaced to a pack/brain output (it's a person's name).
//
// Run: bun scripts/migrate-lee-permits-bulk-columns.mts
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
  ALTER TABLE data_lake.lee_building_permits
    ADD COLUMN IF NOT EXISTS parcel_no text,
    ADD COLUMN IF NOT EXISTS owner_name text,
    ADD COLUMN IF NOT EXISTS application_date date,
    ADD COLUMN IF NOT EXISTS finaled_date date;

  CREATE INDEX IF NOT EXISTS lee_building_permits_parcel_no_idx
    ON data_lake.lee_building_permits (parcel_no);

  GRANT SELECT ON data_lake.lee_building_permits TO service_role;
`);
await sql.unsafe(`NOTIFY pgrst, 'reload schema';`);

console.log("lee_building_permits: added parcel_no, owner_name, application_date, finaled_date");
await sql.close();
