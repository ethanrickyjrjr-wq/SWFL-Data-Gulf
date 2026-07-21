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
import { composeQuery, sqlEscape, type ParquetView } from "../refinery/sources/duckdb-source.mts";
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
  format: string;
  /** How many Tier-1 files back this view (1 for a flat file; N for a merged
   *  partitioned dataset). */
  file_count: number;
  /** Single s3:// url, or "s3://bucket/<dataset>/ (N files)" for a merged view. */
  source: string;
  vintage: string | null;
}

// ---------- Pure helpers (exported for unit tests) ----------

/** Derives a DuckDB-safe view identifier from a storage path.
 *  e.g. "faf5/faf5_2024.parquet" → "faf5_2024"
 *  e.g. "tier1/run-20260527T002658Z.ndjson" → "run_20260527T002658Z"
 *  e.g. "leepa/just_value/2026-05-19.csv.gz" → "2026_05_19"
 */
export function deriveViewName(path: string): string {
  return path
    .split("/")
    .pop()!
    .replace(/\.(gz|bz2|zst|zstd)$/i, "") // drop compression suffix first
    .replace(/\.[^.]+$/, "") // then the data extension
    .replace(/[^a-zA-Z0-9_]/g, "_"); // hyphens/dots → underscore
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

export type Tier1Format = "parquet" | "csv" | "ndjson" | "geojson" | "other";

/** Classifies a Tier-1 object by file extension. Compression suffix aware. */
export function tier1Format(path: string): Tier1Format {
  const l = path.toLowerCase();
  if (l.endsWith(".parquet")) return "parquet";
  if (l.endsWith(".csv") || l.endsWith(".csv.gz")) return "csv";
  if (l.endsWith(".geojson") || l.endsWith(".geojson.gz")) return "geojson";
  if (l.endsWith(".ndjson") || l.endsWith(".jsonl") || l.endsWith(".json")) return "ndjson";
  return "other";
}

/** True when the path carries a Hive partition segment (e.g. `year=2026`). */
export function isPartitioned(path: string): boolean {
  return path.split("/").some((seg) => seg.includes("="));
}

/** Coerces an arbitrary string into a valid, non-empty DuckDB identifier. */
export function safeIdent(raw: string): string {
  let s = raw
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (/^[0-9]/.test(s)) s = `t_${s}`;
  return s || "view";
}

export interface ViewGroup {
  name: string;
  format: "parquet" | "csv" | "ndjson";
  rows: InventoryRow[];
}

/** Groups inventory rows into the views the MCP will register.
 *
 *  - Hive-PARTITIONED layouts (`<dataset>/<dim>/year=/month=/run-*.ndjson`)
 *    collapse into ONE view per top-level folder — all run-snapshots of one
 *    dataset, unioned (a time series of runs). This is what turns ~90 ndjson
 *    run-logs into a handful of queryable views.
 *  - FLAT layouts (a file directly in a folder, no partition) get ONE view per
 *    FILE. Flat folders mix distinct datasets (environmental/ holds several
 *    different parquet schemas) and flat files are usually full snapshots
 *    (leepa/just_value/<date>.csv.gz) where unioning would double-count — so
 *    per-file is the only safe grain.
 *  - geojson / unknown formats are skipped (their data lives in pg.data_lake.*).
 *
 *  Reader choices verified against the live lake before shipping.
 */
export function buildViewGroups(rows: InventoryRow[]): ViewGroup[] {
  const acc = new Map<
    string,
    {
      format: "parquet" | "csv" | "ndjson";
      nameBase: string;
      rows: InventoryRow[];
    }
  >();
  for (const row of rows) {
    const format = tier1Format(row.path);
    if (format === "geojson" || format === "other") continue;
    const segs = row.path.split("/").filter(Boolean);
    let key: string;
    let nameBase: string;
    if (isPartitioned(row.path)) {
      const top = segs[0] ?? row.path;
      key = `P:${top}:${format}`;
      nameBase = top;
    } else {
      key = `F:${row.path}`; // per-file grain
      nameBase = deriveSafeViewName(row.path);
    }
    const g = acc.get(key) ?? { format, nameBase, rows: [] };
    g.rows.push(row);
    acc.set(key, g);
  }
  const used = new Set<string>();
  const out: ViewGroup[] = [];
  for (const g of acc.values()) {
    let name = safeIdent(g.nameBase);
    if (used.has(name)) {
      let i = 2;
      while (used.has(`${name}_${i}`)) i++;
      name = `${name}_${i}`;
    }
    used.add(name);
    out.push({ name, format: g.format, rows: g.rows });
  }
  return out;
}

/** Builds the DuckDB reader expression for a group of same-format S3 objects.
 *  Passes the explicit file list (not a glob) so only inventoried files are
 *  read. ndjson/csv use union_by_name so files with drifting columns union
 *  cleanly; ndjson adds ignore_errors + a raised object-size cap (run records
 *  can be large). These exact forms were verified against the live lake.
 */
export function tier1ListReader(format: "parquet" | "csv" | "ndjson", s3Urls: string[]): string {
  const list = `[${s3Urls.map((u) => `'${sqlEscape(u)}'`).join(", ")}]`;
  switch (format) {
    case "parquet":
      return `read_parquet(${list})`;
    case "csv":
      return `read_csv_auto(${list}, union_by_name=true)`;
    case "ndjson":
      return `read_json_auto(${list}, union_by_name=true, ignore_errors=true, maximum_object_size=104857600)`;
  }
}

/** Produces a valid, collision-resistant DuckDB identifier for a view.
 *  deriveViewName() uses only the filename, which can (a) start with a digit
 *  (e.g. "2026-05.parquet" -> "2026_05", which DuckDB rejects as an unquoted
 *  identifier) and (b) collide across folders (macro/census_vip/2026-05.parquet
 *  and macro/bls_ppi/2026-05.parquet both -> "2026_05"). When the base name is
 *  invalid (leading digit), qualify it with its parent folder; if that still
 *  leads with a digit, prefix "t_". Names that are already valid and unique
 *  (e.g. "faf5_2024") are returned unchanged.
 */
export function deriveSafeViewName(path: string): string {
  let name = deriveViewName(path);
  if (/^[0-9]/.test(name)) {
    const segs = path.split("/").filter(Boolean);
    const parent = segs.length >= 2 ? segs[segs.length - 2]! : "";
    name = `${parent}_${name}`.replace(/[^a-zA-Z0-9_]/g, "_");
  }
  if (/^[0-9]/.test(name)) name = `t_${name}`;
  return name;
}

/** Which of `viewNames` a SQL statement actually references.
 *
 *  This is the whole boot-egress fix. Binding a view's schema forces DuckDB to
 *  sniff its backing object, and a `.csv.gz` is NOT range-readable (gzip is not
 *  seekable) — so sniffing one costs a FULL download (~18 MB for a leepa file).
 *  Registering every view at boot therefore re-downloaded most of the bucket on
 *  every server start, which is how egress scaled with SERVER BOOTS rather than
 *  with queries (07/21/2026 incident, ~300 GB/day).
 *
 *  Matching is case-insensitive (SQL identifiers are) and word-boundary-anchored
 *  so `faf5_2024_backup` never drags in `faf5_2024`. It deliberately over-matches
 *  names inside string literals: materializing one extra named view is cheap,
 *  missing one breaks the query.
 */
export function viewsReferencedBy(sql: string, viewNames: string[]): string[] {
  return viewNames.filter((name) => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?<![A-Za-z0-9_])${escaped}(?![A-Za-z0-9_])`, "i").test(sql);
  });
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
    await conn.run("ATTACH '' AS inv (TYPE POSTGRES, SECRET inv_pg, READ_ONLY);");
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

type DuckDBConn = Awaited<ReturnType<InstanceType<typeof DuckDBInstance>["connect"]>>;
let mainConn: DuckDBConn | null = null;
let registeredViews: ViewMeta[] = [];

/** Catalogued but not yet bound. Populated at boot from the inventory (no S3
 *  reads); drained by ensureViews() as queries actually name each view. */
const pendingGroups = new Map<string, ViewGroup>();
/** Views whose schema has been bound on this connection — never sniffed twice. */
const materializedViews = new Set<string>();

/** Binds the named views on demand, skipping any already materialized.
 *
 *  This is where the S3 read that used to happen at boot now happens: once, for
 *  the views a query actually names, and never again for the life of the
 *  process. A view that fails (corrupt file, transient S3 error, drifting
 *  schema) is logged and skipped — the query then fails on its own terms with
 *  DuckDB's real error rather than a silent empty result.
 */
async function ensureViews(names: string[]): Promise<void> {
  for (const name of names) {
    if (materializedViews.has(name)) continue;
    const g = pendingGroups.get(name);
    if (!g) continue;
    const urls = g.rows.map((r) => `s3://${r.bucket}/${r.path}`);
    try {
      await mainConn!.run(
        `CREATE OR REPLACE VIEW ${g.name} AS SELECT * FROM ${tier1ListReader(g.format, urls)};`,
      );
      materializedViews.add(name);
      console.error(
        `[lake-mcp] bound view "${name}" (${g.format}, ${urls.length} file(s)) on demand`,
      );
    } catch (err) {
      console.error(
        `[lake-mcp] failed to bind view "${name}" (${g.format}, ${urls.length} file(s)): ` +
          String(err).split("\n")[0].slice(0, 140),
      );
    }
  }
}

/** Resolves when startup() finishes. Tool handlers await this so the server can
 *  accept the MCP handshake immediately while view registration runs in the
 *  background; the first query simply waits for the background work to land. */

let startupPromise: Promise<void> | null = null;
async function awaitReady(): Promise<void> {
  if (startupPromise) await startupPromise;
}

/** Loads httpfs and applies S3 credentials to a connection. Mirrors
 *  composeQuery's S3 block (refinery/sources/duckdb-source.mts). Each connection
 *  that reads a Tier-1 s3:// view needs its own copy of these session settings. */
async function configureS3(
  conn: DuckDBConn,
  s3: { endpoint: string; accessKey: string; secretKey: string },
): Promise<void> {
  await conn.run("INSTALL httpfs; LOAD httpfs;");
  await conn.run(
    [
      `SET s3_endpoint='${sqlEscape(s3.endpoint)}';`,
      `SET s3_access_key_id='${sqlEscape(s3.accessKey)}';`,
      `SET s3_secret_access_key='${sqlEscape(s3.secretKey)}';`,
      "SET s3_region='us-east-1';",
      "SET s3_url_style='path';",
      "SET s3_use_ssl=true;",
    ].join("\n"),
  );
}

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

  // Step 2 — Group inventory rows into the views to register. Partitioned
  // datasets merge into one view per top folder; flat files stay per-file;
  // geojson / unknown formats are skipped (reachable via pg.data_lake.*).
  const groups = buildViewGroups(inventoryRows);
  const viewableRows = groups.reduce((n, g) => n + g.rows.length, 0);
  const skippedCount = inventoryRows.length - viewableRows;

  // Step 3 — Resolve S3 creds (required to read any Tier-1 view).
  let s3: { endpoint: string; accessKey: string; secretKey: string } | undefined;
  if (groups.length > 0) {
    const endpointRaw = process.env["SUPABASE_S3_ENDPOINT"];
    const accessKey = process.env["SUPABASE_S3_ACCESS_KEY_ID"];
    const secretKey = process.env["SUPABASE_S3_SECRET_ACCESS_KEY"];
    if (!endpointRaw || !accessKey || !secretKey) {
      console.error("[lake-mcp] Warning: SUPABASE_S3_* env vars missing; Tier-1 views skipped.");
    } else {
      s3 = {
        endpoint: endpointRaw.replace(/^https?:\/\//, ""),
        accessKey,
        secretKey,
      };
    }
  }

  // Step 4 — Open the connection and run setup. Postgres attach comes from
  // composeQuery (parquetViews: [] => pg-only, emits no view statements); the
  // S3/httpfs block is emitted directly here. Views are registered per-group in
  // Step 5 so a single unreadable dataset can never abort startup again.
  const instance = await DuckDBInstance.create(":memory:");
  const conn = await instance.connect();

  const pgSetup = composeQuery({
    source_id: "lake_mcp",
    parquetViews: [],
    pgAttachments: [{ alias: "pg", readOnly: true }],
    query: "SELECT 1", // placeholder — dropped below
    pg,
  }).slice(0, -1);
  for (const stmt of pgSetup) {
    await conn.run(stmt);
  }

  if (s3) {
    await configureS3(conn, s3);
  }

  // mainConn must be live before we await the (slow) view registration so that
  // the MCP handshake — which the caller has already accepted — can serve
  // pg.data_lake.* queries the instant Step 4 finishes, even while Tier-1 views
  // are still being built in the background.
  mainConn = conn;

  // Step 5 — Catalog every dataset view from the INVENTORY ONLY. No CREATE VIEW
  // here, and therefore ZERO S3 bytes at startup.
  //
  // This used to be the slow part of boot: each CREATE VIEW forces DuckDB to
  // sniff the backing S3 object(s) to bind a schema (csv_auto ~5s/file; a
  // 26-file ndjson union_by_name read ~30s), summing to ~90s. What nobody
  // costed is that sniffing is a DATA READ, and on a `.csv.gz` it is a FULL
  // read — gzip is not seekable, so DuckDB cannot range-request a footer the
  // way it can with Parquet. Every boot re-downloaded most of the bucket
  // (~18 MB per leepa file), which is how egress scaled with SERVER BOOTS
  // instead of with queries and reached ~300 GB/day on 07/21/2026.
  //
  // Every field ViewMeta needs — name, format, file_count, source, vintage —
  // comes from `data_lake._tier1_inventory` over Postgres. Only binding a
  // SCHEMA needs the object itself, and only a real query needs a schema. So
  // list_views is now free, and views materialize on demand in ensureViews().
  const registered: ViewMeta[] = [];
  pendingGroups.clear();
  materializedViews.clear();
  if (s3) {
    for (const g of groups) {
      const urls = g.rows.map((r) => `s3://${r.bucket}/${r.path}`);
      const top = g.rows[0]!.path.split("/")[0] ?? "";
      pendingGroups.set(g.name, g);
      registered.push({
        name: g.name,
        format: g.format,
        file_count: urls.length,
        source:
          urls.length === 1 ? urls[0]! : `s3://${g.rows[0]!.bucket}/${top}/ (${urls.length} files)`,
        vintage:
          g.rows
            .map((r) => r.vintage)
            .filter((v): v is string => !!v)
            .sort()
            .pop() ?? null,
      });
    }
  }
  registeredViews = registered;

  console.error(
    `[lake-mcp] Ready — ${registeredViews.length} Tier-1 view(s) over ${viewableRows} file(s); ` +
      `${skippedCount} row(s) skipped (geojson/other — query via pg.data_lake.*); ` +
      `Postgres READ_ONLY (pg.data_lake.*)`,
  );
}

// ---------- Tool handlers ----------

function handleListViews(): object {
  return {
    views: registeredViews,
    postgres_alias: "pg",
    note:
      "Tier-1 datasets are exposed as the views above (parquet/csv/ndjson) — use their " +
      "names with query_lake / describe_view. Tier-2 tables live under the pg alias, e.g. " +
      'query_lake("SELECT * FROM pg.data_lake.<table> LIMIT 10").',
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
  await ensureViews([viewName]);
  const reader = await mainConn!.runAndReadAll(`DESCRIBE SELECT * FROM ${viewName} LIMIT 0`);
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
  // Bind only the Tier-1 views this statement names. A pg.data_lake.* query
  // touches no Tier-1 object at all and so costs zero Storage egress.
  await ensureViews(viewsReferencedBy(sql, [...pendingGroups.keys()]));
  const finalSql = buildFinalQuery(sql);
  const reader = await mainConn!.runAndReadAll(finalSql);
  return { rows: reader.getRowObjects() };
}

/** JSON.stringify that survives DuckDB's native value types. DuckDB returns
 *  64-bit integers (count/sum, ids) as JS BigInt, which JSON.stringify throws
 *  on. Convert BigInt within the safe-integer range to Number; anything larger
 *  to a string (lossless). Dates already serialize to ISO strings.
 */
export function jsonSafe(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, v) =>
      typeof v === "bigint"
        ? v >= BigInt(Number.MIN_SAFE_INTEGER) && v <= BigInt(Number.MAX_SAFE_INTEGER)
          ? Number(v)
          : v.toString()
        : v,
    2,
  );
}

// ---------- MCP server ----------

const server = new Server({ name: "lake", version: "1.0.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_views",
      description:
        "List registered Tier 1 dataset views (parquet/csv/ndjson) and the Tier 2 " +
        "Postgres alias (pg). Use these names with query_lake or describe_view.",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
      name: "describe_view",
      description: "Show the column names and types of a registered Tier 1 dataset view.",
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
        "Execute a read-only SQL query against Tier 1 dataset views (from list_views) or " +
        "Tier 2 Postgres (pg.data_lake.*). Allowed keywords: SELECT, WITH, EXPLAIN, DESCRIBE, " +
        "SHOW, PRAGMA. Results capped at 10,000 rows. " +
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
  // Block until startup() has finished registering views. The handshake was
  // accepted early (transport connects before startup completes); the first
  // tool call is where we actually wait for the lake to be ready.
  await awaitReady();
  try {
    if (name === "list_views") {
      return {
        content: [{ type: "text", text: jsonSafe(handleListViews()) }],
      };
    }
    if (name === "describe_view") {
      const result = await handleDescribeView((args as { view: string }).view);
      return {
        content: [{ type: "text", text: jsonSafe(result) }],
      };
    }
    if (name === "query_lake") {
      const result = await handleQueryLake((args as { sql: string }).sql);
      return {
        content: [{ type: "text", text: jsonSafe(result) }],
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

/**
 * EGRESS BOOT GUARD — added 07/21/2026 after this server burned ~300 GB/day.
 *
 * Incident: every request in the storage log for the burn window carried
 * `duckdb/v1.5.4(windows_amd64) node-neo-api` — this server, on the operator's
 * own machine. Four copies were alive at once. The mechanism is structural, not
 * a bug: `tier1ListReader` builds each view over EVERY inventoried file in a
 * dataset and emits `read_csv_auto([...], union_by_name=true)`. Cold objects are
 * `.csv.gz`; gzip is not seekable, so there is no range read, no column pruning
 * and no predicate pushdown — every query downloads every snapshot WHOLE, and
 * nothing caches between queries. One `raw-tabular-cold` object averages 11 MB.
 *
 * Why the guard lives HERE and not only in `.mcp.json`: the config is per
 * checkout. Renaming the mcpServers key (the first attempt) changed only the
 * server's display name — the entry still ran `bun tools/lake-mcp-server.mts`
 * and its tools reappeared under a new prefix. Removing the entry stops THIS
 * checkout; it does not stop a stale config in a worktree, a teammate's clone,
 * or someone running `bun tools/lake-mcp-server.mts` by hand. The guard is in
 * the one file all of those share.
 *
 * To re-enable, the read path must first stop pulling whole `.csv.gz` snapshots
 * per query (convert cold CSV to Parquet, or scope views to the latest vintage,
 * or cache locally). Setting the flag without doing that restarts the burn.
 */
export const EGRESS_OPT_IN_ENV = "LAKE_MCP_ALLOW_EGRESS";

export class LakeMcpEgressBlockedError extends Error {
  constructor() {
    super(
      `[lake-mcp] REFUSING TO START — this server bills Supabase Storage egress.\n` +
        `Each query re-downloads every .csv.gz snapshot in the dataset whole ` +
        `(no range read, no pruning, no cache). It burned ~300 GB/day on 07/21/2026.\n` +
        `Fix the read path before re-enabling (Parquet, or latest-vintage-only views, or a local cache).\n` +
        `Deliberate override: set ${EGRESS_OPT_IN_ENV}=1`,
    );
    this.name = "LakeMcpEgressBlockedError";
  }
}

/**
 * Pure, exported for the test. Throws unless the operator explicitly opted in.
 * Only `"1"` counts — a stray empty string or `"0"` left in a shell profile must
 * not read as consent.
 */
export function assertEgressOptIn(env: Record<string, string | undefined>): void {
  if (env[EGRESS_OPT_IN_ENV] !== "1") throw new LakeMcpEgressBlockedError();
}

// Only start when invoked directly (not when imported by tests).
if (import.meta.main) {
  // Fires BEFORE any DuckDB instance, S3 credential or inventory read, so a
  // blocked boot cannot issue a single billable request.
  try {
    assertEgressOptIn(process.env);
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
  // Opted in — never let that be silent. The incident's root cause was three
  // copies running unnoticed for hours.
  console.error(
    `[lake-mcp] ${EGRESS_OPT_IN_ENV}=1 — EGRESS BILLING IS LIVE. Every query downloads whole snapshots.`,
  );
  process.on("exit", () => {
    mainConn?.closeSync();
  });
  // Connect the transport FIRST so the MCP handshake (initialize + list_tools)
  // is answered immediately, then build the lake in the background. Previously
  // startup() ran to completion before connect(), so its ~90s of S3 schema
  // sniffing blocked the handshake and the client timed out → "failed to
  // connect". Tool handlers await awaitReady(), so the first query waits for
  // the background startup; the connection itself never stalls.
  startupPromise = startup().catch((err) => {
    console.error("[lake-mcp] Fatal startup error:", err);
    process.exit(1);
  });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
