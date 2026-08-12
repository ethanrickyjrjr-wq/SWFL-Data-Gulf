/**
 * Apply docs/sql/20260812_lee_records_addressed_v.sql and VERIFY LIVE.
 *
 * Creates data_lake.lee_records_addressed_v — Lee County recorded documents
 * resolved to a street address via the STRAP normalization documented in
 * _RESEARCH/data-and-ingest/2026-08-12-deed-parcel-strap-join-fix.md.
 *
 * Idempotent (CREATE OR REPLACE). Verifies AFTER applying and exits 1 if the
 * view is empty or the address column is null — a create that "succeeds" into an
 * empty view is the failure this script exists to catch.
 *
 * Run from repo root:  bun scripts/apply-lee-records-addressed-view.mts
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
  path.join(REPO, "docs", "sql", "20260812_lee_records_addressed_v.sql"),
  "utf-8",
);

const sql = new Bun.SQL(creds());

await sql.unsafe(sqlText);
console.log("applied: data_lake.lee_records_addressed_v");

const [totals] = await sql`select
  count(*)::int                                        as addressed_rows,
  count(distinct doc_type)::int                        as doc_types,
  count(address_line1)::int                            as with_address,
  count(sale_price_usd)::int                           as with_sale_price,
  min(record_date)                                     as earliest,
  max(record_date)                                     as latest
  from data_lake.lee_records_addressed_v`;

console.log("verify:", JSON.stringify(totals));

const byType = await sql`select doc_type, count(*)::int as n
  from data_lake.lee_records_addressed_v group by 1 order by 2 desc limit 8`;
console.log("by doc_type:", JSON.stringify(byType));

await sql.end();

// A view that applies cleanly but resolves nothing is the exact "built, not done"
// failure this whole line of work came out of. Fail loud.
if (!totals || totals.addressed_rows === 0 || totals.with_address === 0) {
  console.error("FAILED: view is empty or carries no addresses");
  process.exit(1);
}
console.log(`OK: ${totals.addressed_rows} addressed rows across ${totals.doc_types} doc types`);
