/**
 * Apply docs/sql/20260922_fdic_sod_county_year_v.sql and VERIFY LIVE.
 *
 * Creates data_lake.fdic_sod_county_year_v (county x year rollup of FDIC branch deposits) and
 * grants service_role. Idempotent (CREATE OR REPLACE). Exits 1 if the view is empty or Lee's
 * newest year has no deposits — a create that "succeeds" into nothing is the failure this catches.
 *
 * Run from repo root:  bun scripts/apply-fdic-sod-view.mts
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const REPO = process.cwd();

function creds(): string {
  const env = process.env.DESTINATION__POSTGRES__CREDENTIALS;
  if (env) return env;
  const toml = readFileSync(path.join(REPO, ".dlt", "secrets.toml"), "utf-8");
  const grab = (key: string): string => {
    const m = toml.match(new RegExp(`^\\s*${key}\\s*=\\s*"?([^"\\n]+)"?\\s*$`, "m"));
    if (!m) throw new Error(`.dlt/secrets.toml: missing ${key}`);
    return m[1].trim();
  };
  return `postgres://${encodeURIComponent(grab("username"))}:${encodeURIComponent(
    grab("password"),
  )}@${grab("host")}:${grab("port")}/${grab("database")}?sslmode=require`;
}

const sqlText = readFileSync(
  path.join(REPO, "docs", "sql", "20260922_fdic_sod_county_year_v.sql"),
  "utf-8",
);
const sql = new Bun.SQL(creds());

await sql.unsafe(sqlText);
await sql.unsafe(
  "GRANT SELECT ON ALL TABLES IN SCHEMA data_lake TO service_role; NOTIFY pgrst, 'reload schema';",
);
console.log("applied: data_lake.fdic_sod_county_year_v (+ GRANT on data_lake tables)");

const base =
  await sql`select 'fdic_sod' as t, count(*)::int as n, min(year)::int as min_year, max(year)::int as max_year from data_lake.fdic_sod
  union all select 'fdic_locations', count(*)::int, null, null from data_lake.fdic_locations
  union all select 'fdic_institutions', count(*)::int, null, null from data_lake.fdic_institutions`;
console.log("tables:", JSON.stringify(base));

const rows = await sql`select county_fips, year, branches, banks, deposits_thousands_usd
  from data_lake.fdic_sod_county_year_v where year >= 2023 order by county_fips, year`;
console.log("view (2023+):", JSON.stringify(rows));

const [lee] = await sql`select deposits_thousands_usd::bigint as d, year::int as year
  from data_lake.fdic_sod_county_year_v where county_fips = '12071' order by year desc limit 1`;
await sql.end();

if (!rows.length || !lee || Number(lee.d) <= 0) {
  console.error("FAIL: view is empty or Lee's newest year has no deposits");
  process.exit(1);
}
console.log(`ok: Lee ${lee.year} deposits $${(Number(lee.d) / 1_000_000).toFixed(2)}B`);
