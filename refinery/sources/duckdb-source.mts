import { readFile } from "node:fs/promises";
import { DuckDBInstance } from "@duckdb/node-api";
import type { RawFragment } from "../types/fragment.mts";
import type {
  CitationRow,
  SourceConnector,
  TrustTier,
} from "../types/pack.mts";
import { env, requirePgEnv } from "../config/env.mts";
import { isoTimestamp } from "../lib/dates.mts";

/**
 * makeDuckDBSource — generic cross-tier source connector factory.
 *
 * Materializes an in-memory DuckDB instance, attaches Tier 1 Storage Parquet
 * views and/or Tier 2 Supabase Postgres via the `postgres` extension's secret
 * + ATTACH dance, runs ONE SQL query that joins / aggregates across them, and
 * yields the result rows back to TypeScript for fragment normalization.
 *
 * ---------------------------------------------------------------------------
 * TRUST TIER vs STORAGE TIER — DO NOT CONFLATE
 *
 * `trust_tier` here is a property of the upstream ORIGIN of the data, NOT
 * where the bytes happen to live. NOAA HURDAT2 sitting in `s3://lake-tier1/`
 * is T1 trust. OpenFEMA NFIP sitting in `data_lake.fema_nfip_claims` is ALSO
 * T1 trust — it just happens to be staged in Postgres because env-swfl ships
 * a brain that consumes it. The Data Tier Policy in docs/API_BLUEPRINTS.md
 * is about STORAGE cost discipline; trust tier is about source authority.
 *
 * The connector therefore does NOT auto-downgrade based on which side the
 * data lives on. Callers pass a single trust_tier reflecting the WORST trust
 * tier across upstream origins (if the join mixes T1 NOAA with a T3 web
 * scrape, declare `trust_tier: 3`).
 * ---------------------------------------------------------------------------
 *
 * Two run modes:
 *   - env.source === "fixture": reads `opts.fixturePath` JSON (an array of
 *     row objects shaped like the live query's output) and bypasses DuckDB
 *     entirely. Required for offline tests; gracefully throws if absent.
 *   - env.source === "live": full DuckDB pipeline. Needs SUPABASE_S3_* when
 *     parquetViews is set, SUPABASE_PG_* when pgAttachments is set.
 *
 * Lifecycle invariants:
 *   - One DuckDBInstance per fetch(), closed in `finally`.
 *   - `pg_connection_limit=4` is SET before any ATTACH (matches the smoke
 *     test). Per-instance, NOT per-process; document for callers that fan
 *     out across multiple cross-tier brains.
 *   - If `opts.query` lacks LIMIT, a `LIMIT 5_000_000` rail is appended.
 *     Cheap insurance against accidentally pulling unbounded result sets.
 */

export interface ParquetView {
  /** DuckDB view name the query references (e.g. "hurdat2_fl"). */
  name: string;
  /** Full s3:// URL of the Parquet file in Tier 1 Storage. */
  s3_url: string;
}

export interface PgAttachment {
  /** Schema alias the query references (e.g. "pg" -> `pg.data_lake.fema_nfip_claims`). */
  alias: string;
  /**
   * DuckDB secret name. Defaults to `pg_${source_id}`. Multiple ATTACHes can
   * share one secret, but separate names keep credentials scoped if a future
   * connector wants to attach to two distinct PG instances.
   */
  secret_name?: string;
  /**
   * When true, appends READ_ONLY to the ATTACH clause. Pass true in the MCP
   * server to prevent any accidental write back to data_lake.*.
   * Default false — existing pack connectors are unaffected.
   */
  readOnly?: boolean;
}

export interface MakeDuckDBSourceOptions<TRow> {
  /** Stable id, also used as RawFragment.source_id. */
  source_id: string;
  /** Authority tier of the WORST upstream origin (see header comment). */
  trust_tier: TrustTier;
  /** Tier 1 Parquet views to register. Omit if the query is Postgres-only. */
  parquetViews?: ParquetView[];
  /** Tier 2 Postgres attachments. Omit if the query is Parquet-only. */
  pgAttachments?: PgAttachment[];
  /**
   * Single SQL query executed after setup. May reference any registered
   * parquetView name OR any pgAttachment alias (e.g. `pg.data_lake.foo`).
   * Must be self-bounded — a hard `LIMIT 5_000_000` rail is appended if
   * the query lacks any LIMIT clause.
   */
  query: string;
  /**
   * Per-row type coercion. DuckDB returns BigInt for 64-bit ints, native
   * Date for DATE/TIMESTAMP, etc.; rowShape normalizes these to a stable
   * TS shape before normalize() sees them.
   */
  rowShape: (raw: Record<string, unknown>) => TRow;
  /**
   * Build the connector's RawFragments from the shaped rows. Receives the
   * fetched_at timestamp so per-fragment provenance can carry it.
   */
  normalize: (rows: TRow[], ctx: { fetched_at: string }) => RawFragment[];
  /** Citation metadata — same contract as SourceConnector.citationMeta. */
  citation: (
    verifiedDate: string,
    ttlSeconds: number,
  ) => Omit<CitationRow, "id">;
  /**
   * Absolute path to a JSON fixture file. Required for env.source==="fixture"
   * runs; ignored in live mode. The JSON must be a top-level array of row
   * objects matching the live query's column shape (pre-shape, so rowShape
   * runs on them too).
   */
  fixturePath?: string;
}

/** SQL string-escape — single quotes only (DuckDB SET / CREATE SECRET syntax). */
export function sqlEscape(s: string): string {
  return s.replace(/'/g, "''");
}

/**
 * Build the full SQL setup + query script. Extracted as a pure function so
 * the test can assert ordering (httpfs install -> S3 SET -> parquet views ->
 * postgres install -> pg_connection_limit -> CREATE SECRET -> ATTACH ->
 * query) without spinning DuckDB.
 *
 * Returns the script as a list of statements; caller `await conn.run(stmt)`s
 * each in order. (DuckDB will parse a multi-statement string fine, but
 * stepping one-at-a-time gives better error messages on failure.)
 */
export function composeQuery(opts: {
  source_id: string;
  parquetViews?: ParquetView[];
  pgAttachments?: PgAttachment[];
  query: string;
  s3?: { endpoint: string; accessKey: string; secretKey: string };
  pg?: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
  };
}): string[] {
  const statements: string[] = [];
  const hasParquet = (opts.parquetViews?.length ?? 0) > 0;
  const hasPg = (opts.pgAttachments?.length ?? 0) > 0;

  if (hasParquet) {
    if (!opts.s3) {
      throw new Error(
        `composeQuery: parquetViews set but no s3 creds provided for ${opts.source_id}`,
      );
    }
    statements.push("INSTALL httpfs; LOAD httpfs;");
    statements.push(
      [
        `SET s3_endpoint='${sqlEscape(opts.s3.endpoint)}';`,
        `SET s3_access_key_id='${sqlEscape(opts.s3.accessKey)}';`,
        `SET s3_secret_access_key='${sqlEscape(opts.s3.secretKey)}';`,
        "SET s3_region='us-east-1';",
        "SET s3_url_style='path';",
        "SET s3_use_ssl=true;",
      ].join("\n"),
    );
    for (const view of opts.parquetViews!) {
      statements.push(
        `CREATE OR REPLACE VIEW ${view.name} AS SELECT * FROM read_parquet('${sqlEscape(view.s3_url)}');`,
      );
    }
  }

  if (hasPg) {
    if (!opts.pg) {
      throw new Error(
        `composeQuery: pgAttachments set but no pg creds provided for ${opts.source_id}`,
      );
    }
    statements.push("INSTALL postgres; LOAD postgres;");
    statements.push("SET pg_connection_limit=4;");
    for (const att of opts.pgAttachments!) {
      const secretName = att.secret_name ?? `pg_${opts.source_id}`;
      statements.push(
        [
          `CREATE OR REPLACE SECRET ${secretName} (`,
          "  TYPE POSTGRES,",
          `  HOST '${sqlEscape(opts.pg.host)}',`,
          `  PORT ${opts.pg.port},`,
          `  DATABASE '${sqlEscape(opts.pg.database)}',`,
          `  USER '${sqlEscape(opts.pg.user)}',`,
          `  PASSWORD '${sqlEscape(opts.pg.password)}'`,
          ");",
        ].join("\n"),
      );
      statements.push(
        `ATTACH '' AS ${att.alias} (TYPE POSTGRES, SECRET ${secretName}${att.readOnly ? ", READ_ONLY" : ""});`,
      );
    }
  }

  // Append a hard rail if the query is unbounded.
  const queryHasLimit = /\blimit\b/i.test(opts.query);
  const finalQuery = queryHasLimit
    ? opts.query
    : `${opts.query.trimEnd().replace(/;\s*$/, "")}\nLIMIT 5000000;`;
  statements.push(finalQuery);

  return statements;
}

async function loadFixtureRows(
  fixturePath: string,
): Promise<Record<string, unknown>[]> {
  const text = await readFile(fixturePath, "utf-8");
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    throw new Error(
      `makeDuckDBSource: fixture at ${fixturePath} must be a top-level JSON array; got ${typeof parsed}`,
    );
  }
  return parsed as Record<string, unknown>[];
}

async function runLive<TRow>(
  opts: MakeDuckDBSourceOptions<TRow>,
): Promise<Record<string, unknown>[]> {
  const hasParquet = (opts.parquetViews?.length ?? 0) > 0;
  const hasPg = (opts.pgAttachments?.length ?? 0) > 0;

  let s3:
    | { endpoint: string; accessKey: string; secretKey: string }
    | undefined;
  if (hasParquet) {
    const required = [
      "SUPABASE_S3_ENDPOINT",
      "SUPABASE_S3_ACCESS_KEY_ID",
      "SUPABASE_S3_SECRET_ACCESS_KEY",
    ];
    const missing = required.filter((k) => !process.env[k]);
    if (missing.length > 0) {
      throw new Error(
        `makeDuckDBSource[${opts.source_id}]: missing required env var(s) for parquetViews: ${missing.join(", ")}. ` +
          "Set them in .env.local, or run with REFINERY_SOURCE=fixture for offline mode.",
      );
    }
    const endpointRaw = process.env["SUPABASE_S3_ENDPOINT"]!;
    s3 = {
      endpoint: endpointRaw.replace(/^https?:\/\//, ""),
      accessKey: process.env["SUPABASE_S3_ACCESS_KEY_ID"]!,
      secretKey: process.env["SUPABASE_S3_SECRET_ACCESS_KEY"]!,
    };
  }

  const pg = hasPg ? requirePgEnv() : undefined;

  const instance = await DuckDBInstance.create(":memory:");
  const conn = await instance.connect();

  try {
    const statements = composeQuery({
      source_id: opts.source_id,
      parquetViews: opts.parquetViews,
      pgAttachments: opts.pgAttachments,
      query: opts.query,
      s3,
      pg,
    });
    // Run setup statements (all but the final query) one at a time for clean
    // error attribution; final statement is the SELECT we read rows from.
    for (let i = 0; i < statements.length - 1; i++) {
      await conn.run(statements[i]!);
    }
    const reader = await conn.runAndReadAll(statements[statements.length - 1]!);
    return reader.getRowObjects();
  } finally {
    conn.closeSync();
  }
}

/**
 * Construct a SourceConnector backed by a single cross-tier DuckDB query.
 * See header comment for the trust-vs-storage rule and lifecycle invariants.
 */
export function makeDuckDBSource<TRow>(
  opts: MakeDuckDBSourceOptions<TRow>,
): SourceConnector {
  return {
    source_id: opts.source_id,
    trust_tier: opts.trust_tier,
    async fetch(): Promise<RawFragment[]> {
      const isFixture = env.source === "fixture";
      let rawRows: Record<string, unknown>[];
      if (isFixture) {
        if (!opts.fixturePath) {
          throw new Error(
            `makeDuckDBSource[${opts.source_id}]: REFINERY_SOURCE=fixture but no fixturePath set on the connector.`,
          );
        }
        rawRows = await loadFixtureRows(opts.fixturePath);
      } else {
        rawRows = await runLive(opts);
      }
      const fetched_at = isoTimestamp();
      const shaped = rawRows.map(opts.rowShape);
      return opts.normalize(shaped, { fetched_at });
    },
    citationMeta(verifiedDate, ttlSeconds): Omit<CitationRow, "id"> {
      return opts.citation(verifiedDate, ttlSeconds);
    },
  };
}
