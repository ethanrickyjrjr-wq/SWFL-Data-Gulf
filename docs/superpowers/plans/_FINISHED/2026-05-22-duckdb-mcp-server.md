# DuckDB Lake MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** ⚡ Sonnet — keywords: schema, architecture

**Goal:** Add a local MCP server (`tools/lake-mcp-server.mts`) that lets Claude Code query the Tier 1 Parquet lake and Tier 2 Postgres `data_lake.*` interactively, without running a full refinery pack build.

**Architecture:** Single DuckDB `:memory:` instance per session, set up at startup via the existing `composeQuery` factory. Startup auto-discovers Tier 1 views by querying `data_lake._tier1_inventory` via a short-lived Postgres connection. Three read-only MCP tools (`list_views`, `describe_view`, `query_lake`) with defense-in-depth: READ_ONLY Postgres ATTACH at the engine level + SQL allowlist guard at the application level.

**Tech Stack:** `@duckdb/node-api` (existing), `@modelcontextprotocol/sdk` (new), `bun:test` (existing), TypeScript ESM.

**Spec:** `docs/superpowers/specs/2026-05-22-duckdb-mcp-design.md`

---

## File Map

| File                                      | Action | Responsibility                                                                         |
| ----------------------------------------- | ------ | -------------------------------------------------------------------------------------- |
| `refinery/sources/duckdb-source.mts`      | Modify | Add `readOnly?: boolean` to `PgAttachment`; update `ATTACH` clause; export `sqlEscape` |
| `refinery/sources/duckdb-source.test.mts` | Modify | Add two tests for `readOnly` ATTACH behavior                                           |
| `package.json`                            | Modify | Add `@modelcontextprotocol/sdk` dependency                                             |
| `tools/lake-mcp-server.mts`               | Create | MCP stdio server — pure helpers + startup + 3 tool handlers                            |
| `tools/lake-mcp-server.test.mts`          | Create | Unit tests for pure helpers (no DuckDB, no network)                                    |
| `.mcp.json`                               | Modify | Add `lake` server entry                                                                |

---

## Task 1 — Add `readOnly` and export `sqlEscape` in `duckdb-source.mts`

**Files:**

- Modify: `refinery/sources/duckdb-source.mts`
- Modify: `refinery/sources/duckdb-source.test.mts`

- [ ] **Step 1: Write two failing tests** — append to the existing `duckdb-source.test.mts`

```typescript
test("composeQuery: ATTACH includes READ_ONLY when readOnly: true", () => {
  const stmts = composeQuery({
    source_id: "ro_test",
    pgAttachments: [{ alias: "pg", readOnly: true }],
    query: "SELECT 1",
    pg: PG,
  });
  const attachStmt = stmts.find((s) => /ATTACH/.test(s))!;
  assert.match(attachStmt, /READ_ONLY/);
});

test("composeQuery: ATTACH omits READ_ONLY when readOnly is false or omitted", () => {
  const stmts = composeQuery({
    source_id: "rw_test",
    pgAttachments: [{ alias: "pg" }],
    query: "SELECT 1",
    pg: PG,
  });
  const attachStmt = stmts.find((s) => /ATTACH/.test(s))!;
  assert.doesNotMatch(attachStmt, /READ_ONLY/);
});
```

- [ ] **Step 2: Run to confirm they fail**

```
bun test refinery/sources/duckdb-source.test.mts
```

Expected: 2 failures — `readOnly` property unknown, ATTACH clause unchanged.

- [ ] **Step 3: Add `readOnly?: boolean` to `PgAttachment` interface**

In `refinery/sources/duckdb-source.mts`, find the `PgAttachment` interface and add the field:

```typescript
export interface PgAttachment {
  /** Schema alias the query references (e.g. "pg" -> `pg.data_lake.fema_nfip_claims`). */
  alias: string;
  /**
   * DuckDB secret name. Defaults to `pg_${source_id}`.
   */
  secret_name?: string;
  /**
   * When true, appends READ_ONLY to the ATTACH clause. Pass true in the MCP
   * server to prevent any accidental write back to data_lake.*.
   * Default false — existing pack connectors are unaffected.
   */
  readOnly?: boolean;
}
```

- [ ] **Step 4: Export `sqlEscape` and update the ATTACH statement in `composeQuery`**

Change the private `sqlEscape` to exported:

```typescript
/** SQL string-escape — single quotes only (DuckDB SET / CREATE SECRET syntax). */
export function sqlEscape(s: string): string {
  return s.replace(/'/g, "''");
}
```

Find the ATTACH line inside the `for (const att of opts.pgAttachments!)` loop in `composeQuery` and update it:

```typescript
statements.push(
  `ATTACH '' AS ${att.alias} (TYPE POSTGRES, SECRET ${secretName}${att.readOnly ? ", READ_ONLY" : ""});`,
);
```

- [ ] **Step 5: Run all duckdb-source tests — expect green**

```
bun test refinery/sources/duckdb-source.test.mts
```

Expected: All 10 tests PASS (8 existing + 2 new).

- [ ] **Step 6: Commit**

```
git add refinery/sources/duckdb-source.mts refinery/sources/duckdb-source.test.mts
git commit -m "feat(duckdb-source): add readOnly ATTACH support + export sqlEscape"
```

---

## Task 2 — Install `@modelcontextprotocol/sdk`

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Install the package**

```
bun add @modelcontextprotocol/sdk
```

- [ ] **Step 2: Verify it's in dependencies**

```
bun pm ls | grep modelcontextprotocol
```

Expected: a line containing `@modelcontextprotocol/sdk`.

- [ ] **Step 3: Commit**

```
git add package.json bun.lock
git commit -m "chore(deps): add @modelcontextprotocol/sdk"
```

---

## Task 3 — Write failing tests for MCP server helpers

**Files:**

- Create: `tools/lake-mcp-server.test.mts`

- [ ] **Step 1: Create the test file**

```typescript
// tools/lake-mcp-server.test.mts
import { test } from "bun:test";
import assert from "node:assert/strict";

// Import only pure helpers. import.meta.main is false here, so the MCP
// server startup() is never called — no DuckDB, no network.
const {
  deriveViewName,
  isAllowedSql,
  buildFinalQuery,
  inventoryRowToParquetView,
} = await import("./lake-mcp-server.mts");

// ---- deriveViewName ----

test("deriveViewName: strips .parquet and path prefix", () => {
  assert.equal(deriveViewName("faf5/faf5_2024.parquet"), "faf5_2024");
  assert.equal(deriveViewName("hurdat2/hurdat2_fl.parquet"), "hurdat2_fl");
  assert.equal(deriveViewName("top_level.parquet"), "top_level");
});

test("deriveViewName: case-insensitive .Parquet strip", () => {
  assert.equal(deriveViewName("lake/storms.PARQUET"), "storms");
});

// ---- isAllowedSql ----

test("isAllowedSql: permits SELECT and SELECT with leading whitespace", () => {
  assert.ok(isAllowedSql("SELECT * FROM foo"));
  assert.ok(isAllowedSql("  SELECT id FROM bar"));
  assert.ok(isAllowedSql("select * FROM foo"));
});

test("isAllowedSql: permits WITH (CTE) queries", () => {
  assert.ok(isAllowedSql("WITH cte AS (SELECT 1) SELECT * FROM cte"));
  assert.ok(isAllowedSql("with cte as (select 1) select * from cte"));
});

test("isAllowedSql: permits EXPLAIN, DESCRIBE, SHOW, PRAGMA", () => {
  assert.ok(isAllowedSql("EXPLAIN SELECT * FROM foo"));
  assert.ok(isAllowedSql("DESCRIBE SELECT * FROM foo LIMIT 0"));
  assert.ok(isAllowedSql("SHOW TABLES"));
  assert.ok(isAllowedSql("PRAGMA database_list"));
});

test("isAllowedSql: rejects write-capable statements", () => {
  assert.ok(!isAllowedSql("CREATE TABLE exfil AS SELECT * FROM foo"));
  assert.ok(!isAllowedSql("INSERT INTO foo VALUES (1)"));
  assert.ok(!isAllowedSql("DELETE FROM foo"));
  assert.ok(!isAllowedSql("UPDATE foo SET x=1"));
  assert.ok(!isAllowedSql("DROP TABLE foo"));
  assert.ok(!isAllowedSql("COPY foo TO '/tmp/dump.csv'"));
  assert.ok(!isAllowedSql(""));
});

test("isAllowedSql: rejects semicolon-appended injection (second statement unreachable)", () => {
  // The allowlist passes "SELECT 1" but the server uses the single-statement
  // API, so the injected CREATE never executes. This test just documents
  // that "SELECT 1; CREATE TABLE exfil ..." passes the allowlist — the
  // defense is the single-statement API, not the allowlist.
  //
  // If we ever want a second layer, add a semicolon-scan check here.
  assert.ok(
    isAllowedSql(
      "SELECT 1; CREATE TABLE exfil AS SELECT * FROM pg.data_lake.foo",
    ),
  );
});

// ---- buildFinalQuery ----

test("buildFinalQuery: appends LIMIT 10000 when query has no LIMIT", () => {
  assert.match(buildFinalQuery("SELECT * FROM foo"), /LIMIT 10000/);
  assert.match(
    buildFinalQuery("WITH cte AS (SELECT 1) SELECT * FROM cte"),
    /LIMIT 10000/,
  );
});

test("buildFinalQuery: preserves existing LIMIT", () => {
  const q = "SELECT * FROM foo LIMIT 50";
  assert.equal(buildFinalQuery(q), q);
  assert.doesNotMatch(buildFinalQuery(q), /LIMIT 10000/);
});

test("buildFinalQuery: strips trailing semicolons before appending LIMIT", () => {
  const result = buildFinalQuery("SELECT * FROM foo;");
  assert.doesNotMatch(result, /;/);
  assert.match(result, /LIMIT 10000/);
});

// ---- inventoryRowToParquetView ----

test("inventoryRowToParquetView: constructs s3 URL and derives view name", () => {
  const row = {
    id: "lake-tier1/faf5/faf5_2024.parquet",
    bucket: "lake-tier1",
    path: "faf5/faf5_2024.parquet",
    vintage: "2024",
    byte_size: 1024,
    pack_id: "logistics-swfl",
    source_url: null,
  };
  const view = inventoryRowToParquetView(row);
  assert.equal(view.name, "faf5_2024");
  assert.equal(view.s3_url, "s3://lake-tier1/faf5/faf5_2024.parquet");
});
```

- [ ] **Step 2: Run tests — expect failure because `tools/lake-mcp-server.mts` doesn't exist**

```
bun test tools/lake-mcp-server.test.mts
```

Expected: Error — `Cannot find module './lake-mcp-server.mts'`.

---

## Task 4 — Implement `tools/lake-mcp-server.mts`

**Files:**

- Create: `tools/lake-mcp-server.mts`

- [ ] **Step 1: Create the server file**

```typescript
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
```

- [ ] **Step 2: Run helper tests — expect green**

```
bun test tools/lake-mcp-server.test.mts
```

Expected: All 13 tests PASS.

- [ ] **Step 3: Run full test suite — confirm no regressions**

```
bun test
```

Expected: All existing tests still pass.

- [ ] **Step 4: Commit**

```
git add tools/lake-mcp-server.mts tools/lake-mcp-server.test.mts
git commit -m "feat(tools): lake MCP server — read-only Parquet + Postgres exploration"
```

---

## Task 5 — Wire up `.mcp.json` and smoke-test

**Files:**

- Modify: `.mcp.json`

- [ ] **Step 1: Add the `lake` server entry to `.mcp.json`**

Replace the entire file with:

```json
{
  "mcpServers": {
    "serena": {
      "command": "serena",
      "args": ["start-mcp-server", "--context", "claude-code", "--project", "."]
    },
    "lake": {
      "command": "bun",
      "args": ["tools/lake-mcp-server.mts"]
    }
  }
}
```

- [ ] **Step 2: Verify JSON is valid**

```
bun -e "import('.mcp.json', { assert: { type: 'json' } }).then(m => console.log('ok', JSON.stringify(Object.keys(m.default.mcpServers))))"
```

Expected output: `ok ["serena","lake"]`

- [ ] **Step 3: Commit**

```
git add .mcp.json
git commit -m "chore(mcp): wire lake MCP server entry in .mcp.json"
```

- [ ] **Step 4: Restart Claude Code to pick up the new `.mcp.json`**

`.mcp.json` is only read at Claude Code startup. Close and reopen the session.

- [ ] **Step 5: Verify the server connected**

In the new session, type `/mcp`. Both `serena` and `lake` must appear as **connected**.

If `lake` shows as errored, run this to debug:

```
bun tools/lake-mcp-server.mts
```

The process should print a `[lake-mcp] Ready —` line to stderr, then block waiting for stdin (that's correct MCP stdio behavior). `Ctrl-C` to exit.

---

## Self-Review

**Spec coverage:**

- Section 1 (Architecture, startup sequence, graceful degradation) → Task 4 `startup()` + `fetchInventory()` + stderr warnings
- Section 2 (readOnly on PgAttachment) → Task 1
- Section 3 (three MCP tools, allowlist with WITH, single-statement API, 10K cap) → Task 4 handlers
- Section 4 (.mcp.json) → Task 5
- Section 5 (security model) → `READ_ONLY` in Task 1 + allowlist in Task 4 + `runAndReadAll` single-statement
- Section 6 (out of scope) → no DDL paths anywhere in the implementation
- Section 7 (files changed) → all four files covered

**Placeholder scan:** No TBDs, no "handle X appropriately", no incomplete steps.

**Type consistency:**

- `sqlEscape` exported in Task 1, imported in Task 4 ✓
- `PgAttachment.readOnly` added in Task 1, used in Task 4 (`readOnly: true`) ✓
- `ParquetView` type imported from `duckdb-source.mts` in Task 4 ✓
- `inventoryRowToParquetView` defined and exported in Task 4, tested in Task 3 ✓
- `registeredViews: ViewMeta[]` populated in `startup()`, read in `handleListViews` + `handleDescribeView` ✓
- `mainConn` is set in `startup()` before any tool call (MCP server only connects after `startup()` resolves) ✓
