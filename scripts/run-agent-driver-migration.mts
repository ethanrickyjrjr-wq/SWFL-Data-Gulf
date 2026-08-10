// scripts/run-agent-driver-migration.mts
// Run: bun scripts/run-agent-driver-migration.mts
// Executes migrations/20260810_agent_driver.sql idempotently via Bun.SQL

import { readFileSync } from "fs";

// Read secrets from .dlt/secrets.toml (prefer local, fall back to brain-platform)
let secretsPath = ".dlt/secrets.toml";
let secrets: string;

try {
  secrets = readFileSync(secretsPath, "utf8");
} catch {
  secretsPath = "../brain-platform/.dlt/secrets.toml";
  try {
    secrets = readFileSync(secretsPath, "utf8");
  } catch {
    throw new Error(
      `Could not read .dlt/secrets.toml from ${secretsPath} or ../brain-platform/.dlt/secrets.toml`,
    );
  }
}

console.log(`Using secrets from: ${secretsPath}`);

// Helper: extract TOML values using regex
const tomlStr = (key: string): string => {
  const m = secrets.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, "m"));
  if (!m) throw new Error(`missing ${key} in ${secretsPath}`);
  return m[1]!;
};

const port = secrets.match(/^port\s*=\s*(\d+)/m)?.[1] ?? "5432";
const database = tomlStr("database");
const username = tomlStr("username");
const password = tomlStr("password");
const host = tomlStr("host");

const connStr = `postgres://${username}:${encodeURIComponent(password)}@${host}:${port}/${database}?sslmode=require`;

console.log(`Connecting to: ${host}:${port}/${database}`);

// Create SQL client and run migration
const sql = new Bun.SQL(connStr);

// Read and execute the migration SQL
const migrationSQL = readFileSync("./migrations/20260810_agent_driver.sql", "utf8");

console.log("\nExecuting migration...");
await sql.unsafe(migrationSQL);

console.log("\nVerifying migration results...");

// Verify: check for user_api_tokens.scope column
const scopeCol = await sql`
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'user_api_tokens' AND column_name = 'scope'
`;

console.log("\n1. user_api_tokens.scope column:");
if (scopeCol.length === 1) {
  console.log(`✓ Column exists: ${scopeCol[0]!.data_type}, nullable=${scopeCol[0]!.is_nullable}`);
  console.log(`  Full row:`, scopeCol[0]);
} else {
  console.error("✗ Column not found!");
  process.exit(1);
}

interface TableRow {
  table_name?: string;
  [key: string]: unknown;
}

// Verify: check for agent_feed_test_events table
const testEventsTable = await sql`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'agent_feed_test_events'
`;

console.log("\n2. agent_feed_test_events table:");
if (testEventsTable.length === 1) {
  console.log(`✓ Table exists`);
  console.log(`  Full row:`, testEventsTable[0]);

  // Also check the columns
  const testEventsCols = await sql`
    SELECT column_name, data_type, is_nullable FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'agent_feed_test_events'
    ORDER BY ordinal_position
  `;
  console.log(`  Columns (${testEventsCols.length}):`);
  testEventsCols.forEach((col: TableRow) => {
    console.log(
      `    - ${String(col.column_name)}: ${String(col.data_type)} (nullable=${String(col.is_nullable)})`,
    );
  });
} else {
  console.error("✗ Table not found!");
  process.exit(1);
}

console.log("\n✓ Migration completed successfully");
await sql.end();
