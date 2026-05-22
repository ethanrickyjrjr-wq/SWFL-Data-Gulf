// tools/lake-mcp-server.mts
import process from "node:process";
import { DuckDBInstance } from "@duckdb/node-api";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import {
  composeQuery,
  sqlEscape,
  type ParquetView,
} from "../refinery/sources/duckdb-source.mts";
import { requirePgEnv, type PgCreds } from "../refinery/config/env.mts";

// env.mts calls process.loadEnvFile(".env.local") on import — no need to repeat.

// ---------- Types ----------

export interface InventoryRow {
  id: string;
  bucket: string;
  path: string;
  vintage: string | null;
  byte_size: number | null;
  pack_id: string | null;
  source_url: string | null;
}

export interface ViewMeta {
  name: string;
  s3_url: string;
  pack_id: string | null;
  vintage: string | null;
  byte_size: number | null;
}

// ---------- Pure helpers (exported for unit tests) ----------

/** Derives a DuckDB-safe view identifier from a Parquet storage path.
 *  e.g. "faf5/faf5_2024.parquet" → "faf5_2024"
 */
export function deriveViewName(path: string): string {
  return path
    .split("/")
    .pop()!
    .replace(/\.parquet$/i, "");
}

/** Returns true when the SQL starts with a read-only keyword. */
export function isAllowedSql(sql: string): boolean {
  return /^\s*(select|explain|describe|show|pragma|with)\b/i.test(sql);
}

/** Appends LIMIT 10000 if the query has no LIMIT clause. */
export function buildFinalQuery(sql: string): string {
  if (/\blimit\b/i.test(sql)) return sql;
  return `${sql.trimEnd().replace(/;\s*$/, "")}\nLIMIT 10000`;
}

/** Maps a _tier1_inventory row to a ParquetView for composeQuery. */
export function inventoryRowToParquetView(row: InventoryRow): ParquetView {
  return {
    name: deriveViewName(row.path),
    s3_url: `s3://${row.bucket}/${row.path}`,
  };
}

// ---------- Startup ----------

/** Fetch _tier1_inventory via a dedicated short-lived DuckDB connection.
 *  A separate connection avoids the chicken-and-egg problem of needing
 *  inventory rows to configure the main connection's Parquet views.
 */
async function fetchInventory(pg: PgCreds): Promise<InventoryRow[]> {
  const instance = await DuckDBInstance.create(":memory:");
  const conn = await instance.connect();
  try {
    await conn.run("INSTALL postgres; LOAD postgres;");
    await conn.run(
      [
        "CREATE OR REPLACE SECRET inv_pg (",
        "  TYPE POSTGRES,",
        `  HOST '${sqlEscape(pg.host)}',`,
        `  PORT ${pg.port},`,
        `  DATABASE '${sqlEscape(pg.database)}',`,
        `  USER '${sqlEscape(pg.user)}',`,
        `  PASSWORD '${sqlEscape(pg.password)}'`,
        ");",
      ].join("\n"),
    );
    await conn.run(
      "ATTACH '' AS inv (TYPE POSTGRES, SECRET inv_pg, READ_ONLY);",
    );
    const reader = await conn.runAndReadAll(
      "SELECT id, bucket, path, vintage, byte_size, pack_id, source_url" +
        " FROM inv.data_lake._tier1_inventory",
    );
    return reader.getRowObjects() as unknown as InventoryRow[];
  } finally {
    conn.closeSync();
  }
}

// ---------- Session state (populated by startup()) ----------

type DuckDBConn = Awaited<
  ReturnType<InstanceType<typeof DuckDBInstance>["connect"]>
>;
let mainConn: DuckDBConn | null = null;
let registeredViews: ViewMeta[] = [];

async function startup(): Promise<void> {
  const pg = requirePgEnv();

  // Step 1 — Discover Tier 1 Parquet views
  let inventoryRows: InventoryRow[] = [];
  try {
    inventoryRows = await fetchInventory(pg);
  } catch (err) {
    console.error("[lake-mcp] Warning: _tier1_inventory fetch failed:", err);
    // Proceed with zero Parquet views; Postgres still available.
  }

  // Step 2 — Resolve S3 creds (required for Parquet view registration)
  let s3:
    | { endpoint: string; accessKey: string; secretKey: string }
    | undefined;
  let finalViews: ParquetView[] = [];

  if (inventoryRows.length > 0) {
    const endpointRaw = process.env["SUPABASE_S3_ENDPOINT"];
    const accessKey = process.env["SUPABASE_S3_ACCESS_KEY_ID"];
    const secretKey = process.env["SUPABASE_S3_SECRET_ACCESS_KEY"];
    if (!endpointRaw || !accessKey || !secretKey) {
      console.error(
        "[lake-mcp] Warning: SUPABASE_S3_* env vars missing; Parquet views skipped.",
      );
    } else {
      s3 = {
        endpoint: endpointRaw.replace(/^https?:\/\//, ""),
        accessKey,
        secretKey,
      };
      finalViews = inventoryRows.map(inventoryRowToParquetView);
    }
  }

  registeredViews = inventoryRows
    .filter(() => finalViews.length > 0)
    .map((row) => ({
      name: deriveViewName(row.path),
      s3_url: `s3://${row.bucket}/${row.path}`,
      pack_id: row.pack_id,
      vintage: row.vintage,
      byte_size: row.byte_size,
    }));

  // Step 3 — Build the main DuckDB connection using composeQuery
  const statements = composeQuery({
    source_id: "lake_mcp",
    parquetViews: finalViews,
    pgAttachments: [{ alias: "pg", readOnly: true }],
    query: "SELECT 1", // placeholder — not executed
    s3: finalViews.length > 0 ? s3 : undefined,
    pg,
  });

  const instance = await DuckDBInstance.create(":memory:");
  const conn = await instance.connect();
  // Run all setup statements (all except the final "SELECT 1" placeholder)
  for (let i = 0; i < statements.length - 1; i++) {
    await conn.run(statements[i]!);
  }
  mainConn = conn;

  const viewCount = registeredViews.length;
  console.error(
    `[lake-mcp] Ready — ${viewCount} Parquet view(s) + Postgres READ_ONLY (pg.data_lake.*)`,
  );
}

// ---------- Tool handlers ----------

function handleListViews(): object {
  return {
    parquet_views: registeredViews,
    postgres_alias: "pg",
    postgres_note:
      'Use query_lake("SELECT * FROM pg.data_lake.<table> LIMIT 10") to explore Tier 2 tables.',
  };
}

async function handleDescribeView(viewName: string): Promise<object> {
  const knownNames = new Set(registeredViews.map((v) => v.name));
  if (!knownNames.has(viewName)) {
    const valid = [...knownNames].join(", ") || "(none registered)";
    throw new McpError(
      ErrorCode.InvalidParams,
      `Unknown view "${viewName}". Valid names: ${valid}. For Postgres tables use query_lake.`,
    );
  }
  const reader = await mainConn!.runAndReadAll(
    `DESCRIBE SELECT * FROM ${viewName} LIMIT 0`,
  );
  return { columns: reader.getRowObjects() };
}

async function handleQueryLake(sql: string): Promise<object> {
  if (!isAllowedSql(sql)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Query rejected: must start with SELECT, WITH, EXPLAIN, DESCRIBE, SHOW, or PRAGMA.\n` +
        `Got: ${sql.slice(0, 120)}`,
    );
  }
  const finalSql = buildFinalQuery(sql);
  const reader = await mainConn!.runAndReadAll(finalSql);
  return { rows: reader.getRowObjects() };
}

// ---------- MCP server ----------

const server = new Server(
  { name: "lake", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_views",
      description:
        "List registered Tier 1 Parquet views and the Tier 2 Postgres alias (pg). " +
        "Use these names with query_lake or describe_view.",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
      name: "describe_view",
      description:
        "Show the column names and types of a registered Parquet view.",
      inputSchema: {
        type: "object",
        properties: {
          view: {
            type: "string",
            description: "View name from list_views (e.g. 'faf5_2024')",
          },
        },
        required: ["view"],
      },
    },
    {
      name: "query_lake",
      description:
        "Execute a read-only SQL query against Tier 1 Parquet views or Tier 2 Postgres " +
        "(pg.data_lake.*). Allowed keywords: SELECT, WITH, EXPLAIN, DESCRIBE, SHOW, PRAGMA. " +
        "Results capped at 10,000 rows. " +
        "Example: SELECT * FROM pg.data_lake.corridor_profiles LIMIT 5",
      inputSchema: {
        type: "object",
        properties: {
          sql: { type: "string", description: "SQL query to execute" },
        },
        required: ["sql"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    if (name === "list_views") {
      return {
        content: [
          { type: "text", text: JSON.stringify(handleListViews(), null, 2) },
        ],
      };
    }
    if (name === "describe_view") {
      const result = await handleDescribeView((args as { view: string }).view);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
    if (name === "query_lake") {
      const result = await handleQueryLake((args as { sql: string }).sql);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  } catch (err) {
    if (err instanceof McpError) throw err;
    return {
      content: [{ type: "text", text: `Error: ${String(err)}` }],
      isError: true,
    };
  }
});

// Only start when invoked directly (not when imported by tests).
if (import.meta.main) {
  startup()
    .then(() => {
      const transport = new StdioServerTransport();
      return server.connect(transport);
    })
    .catch((err) => {
      console.error("[lake-mcp] Fatal startup error:", err);
      process.exit(1);
    });
}
