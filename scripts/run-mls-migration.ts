import { readFileSync } from "fs";

const secrets = readFileSync(".dlt/secrets.toml", "utf8");

// Parse individual fields from [destination.postgres.credentials]
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

// URL-encode password (it may contain special chars like !)
const encodedPw = encodeURIComponent(password);
const connStr = `postgres://${username}:${encodedPw}@${host}:${port}/${database}?sslmode=require`;

const sql = new Bun.SQL(connStr);

for (const file of [
  "migrations/20260625_user_mls_connections.sql",
  "migrations/20260625_user_mls_data_lake.sql",
]) {
  console.log(`Running ${file}...`);
  const ddl = readFileSync(file, "utf8");
  await sql.unsafe(ddl);
  console.log(`  ✓ done`);
}

await sql.end();
console.log("Migrations complete.");
