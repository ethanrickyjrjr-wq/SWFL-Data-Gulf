// scripts/verify-agent-driver.mts
// Verification queries for agent-driver migration
// Runs exactly two queries and outputs results as-is

import { readFileSync } from "fs";

const secrets = readFileSync(".dlt/secrets.toml", "utf8");
function tomlStr(key: string): string {
  const m = secrets.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, "m"));
  if (!m) throw new Error(`Could not find ${key} in .dlt/secrets.toml`);
  return m[1];
}
const host = tomlStr("host");
const password = tomlStr("password");
const username = tomlStr("username");
const database = tomlStr("database");
const portMatch = secrets.match(/^port\s*=\s*(\d+)/m);
const port = portMatch ? portMatch[1] : "5432";

const connStr = `postgres://${username}:${encodeURIComponent(password)}@${host}:${port}/${database}?sslmode=require`;
const sql = new Bun.SQL(connStr);

const result1 = await sql`
  select column_name, data_type, is_nullable
  from information_schema.columns
  where table_name = 'user_api_tokens' and column_name = 'scope'
`;
console.log(result1);

const result2 = await sql`
  select table_name
  from information_schema.tables
  where table_name = 'agent_feed_test_events'
`;
console.log(result2);

await sql.end();
