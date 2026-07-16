// scripts/verify-listing-dom.mts — read-only smoke of data_lake.listing_dom.
// Usage: bun scripts/verify-listing-dom.mts
// Creds from .dlt/secrets.toml, same as scripts/run-migration.ts.
import { readFileSync } from "fs";

const secrets = readFileSync(".dlt/secrets.toml", "utf8");
const tomlStr = (key: string): string => {
  const m = secrets.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, "m"));
  if (!m) throw new Error(`Could not find ${key} in .dlt/secrets.toml`);
  return m[1];
};
const port = secrets.match(/^port\s*=\s*(\d+)/m)?.[1] ?? "5432";
const connStr = `postgres://${tomlStr("username")}:${encodeURIComponent(tomlStr("password"))}@${tomlStr("host")}:${port}/${tomlStr("database")}?sslmode=require`;
const sql = new Bun.SQL(connStr);

const [counts] = await sql`
  SELECT count(*)::int AS total,
         count(*) FILTER (WHERE dom_is_floor)::int AS floored,
         count(*) FILTER (WHERE dom_days < 0)::int AS negative_dom,
         count(*) FILTER (WHERE cdom_days < dom_days)::int AS cdom_lt_dom
  FROM data_lake.listing_dom`;
console.log("listing_dom:", counts);

const fresh = await sql`
  SELECT address_key, first_seen::date AS first_seen, listed_date, dom_days, dom_is_floor, cdom_days
  FROM data_lake.listing_dom
  WHERE first_seen::date > DATE '2026-07-03'
  ORDER BY first_seen DESC LIMIT 3`;
console.log("fresh sample:", fresh);

const healed = await sql`
  SELECT address_key, listed_date, dom_days, dom_is_floor
  FROM data_lake.listing_dom
  WHERE listed_date IS NOT NULL
  ORDER BY listed_date DESC LIMIT 3`;
console.log("vendor-dated sample (empty until the first nightly run lands):", healed);

await sql.end();
