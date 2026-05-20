import { test } from "bun:test";
import assert from "node:assert/strict";

// Force fixture mode BEFORE importing — env.mts reads process.env at module init.
process.env["REFINERY_SOURCE"] = "fixture";

const { composeQuery, makeDuckDBSource } = await import("./duckdb-source.mts");

const S3 = {
  endpoint: "xxx.supabase.co/storage/v1/s3",
  accessKey: "AKIAxxx",
  secretKey: "secret_xxx",
};
const PG = {
  host: "db.xxx.supabase.co",
  port: 5432,
  user: "postgres",
  password: "pw",
  database: "postgres",
};

test("composeQuery: parquetView + pgAttachment produce statements in canonical order", () => {
  const stmts = composeQuery({
    source_id: "test_x_brain",
    parquetViews: [{ name: "tracks", s3_url: "s3://lake-tier1/test.parquet" }],
    pgAttachments: [{ alias: "pg" }],
    query: "SELECT * FROM tracks t JOIN pg.data_lake.foo f ON t.id = f.id",
    s3: S3,
    pg: PG,
  });

  // Expected ordering: httpfs install -> S3 SET -> parquet views ->
  // postgres install -> pg_connection_limit -> CREATE SECRET -> ATTACH -> query.
  assert.match(stmts[0]!, /INSTALL httpfs/);
  assert.match(stmts[1]!, /SET s3_endpoint=/);
  assert.match(stmts[2]!, /CREATE OR REPLACE VIEW tracks/);
  assert.match(stmts[3]!, /INSTALL postgres/);
  assert.match(stmts[4]!, /SET pg_connection_limit=4/);
  assert.match(stmts[5]!, /CREATE OR REPLACE SECRET pg_test_x_brain/);
  assert.match(stmts[5]!, /TYPE POSTGRES/);
  assert.match(
    stmts[6]!,
    /ATTACH '' AS pg \(TYPE POSTGRES, SECRET pg_test_x_brain\)/,
  );
  assert.match(stmts[7]!, /SELECT \* FROM tracks/);
});

test("composeQuery: appends LIMIT 5000000 when query lacks one", () => {
  const stmts = composeQuery({
    source_id: "x",
    parquetViews: [{ name: "v", s3_url: "s3://bucket/x.parquet" }],
    query: "SELECT * FROM v",
    s3: S3,
  });
  const finalStmt = stmts[stmts.length - 1]!;
  assert.match(finalStmt, /LIMIT 5000000/);
});

test("composeQuery: preserves explicit LIMIT (no double-rail)", () => {
  const stmts = composeQuery({
    source_id: "x",
    parquetViews: [{ name: "v", s3_url: "s3://bucket/x.parquet" }],
    query: "SELECT * FROM v LIMIT 100",
    s3: S3,
  });
  const finalStmt = stmts[stmts.length - 1]!;
  // Should still contain only the original LIMIT 100, not LIMIT 5000000.
  assert.match(finalStmt, /LIMIT 100/);
  assert.doesNotMatch(finalStmt, /LIMIT 5000000/);
});

test("composeQuery: Postgres-only (no parquetViews) skips httpfs", () => {
  const stmts = composeQuery({
    source_id: "x",
    pgAttachments: [{ alias: "pg" }],
    query: "SELECT * FROM pg.data_lake.foo",
    pg: PG,
  });
  assert.ok(!stmts.some((s) => /INSTALL httpfs/.test(s)));
  assert.match(stmts[0]!, /INSTALL postgres/);
});

test("composeQuery: Parquet-only (no pgAttachments) skips postgres", () => {
  const stmts = composeQuery({
    source_id: "x",
    parquetViews: [{ name: "v", s3_url: "s3://bucket/x.parquet" }],
    query: "SELECT * FROM v",
    s3: S3,
  });
  assert.ok(!stmts.some((s) => /INSTALL postgres/.test(s)));
  assert.ok(!stmts.some((s) => /CREATE.*SECRET/.test(s)));
});

test("composeQuery: custom secret_name overrides default", () => {
  const stmts = composeQuery({
    source_id: "x",
    pgAttachments: [{ alias: "pg", secret_name: "my_secret" }],
    query: "SELECT 1",
    pg: PG,
  });
  assert.ok(stmts.some((s) => /CREATE OR REPLACE SECRET my_secret/.test(s)));
  assert.ok(stmts.some((s) => /SECRET my_secret/.test(s)));
});

test("composeQuery: throws when parquetViews set but no s3 creds", () => {
  assert.throws(
    () =>
      composeQuery({
        source_id: "x",
        parquetViews: [{ name: "v", s3_url: "s3://x/y.parquet" }],
        query: "SELECT 1",
      }),
    /no s3 creds/,
  );
});

test("composeQuery: throws when pgAttachments set but no pg creds", () => {
  assert.throws(
    () =>
      composeQuery({
        source_id: "x",
        pgAttachments: [{ alias: "pg" }],
        query: "SELECT 1",
      }),
    /no pg creds/,
  );
});

test("composeQuery: single-quote escaping in s3 + pg creds", () => {
  const stmts = composeQuery({
    source_id: "x",
    parquetViews: [{ name: "v", s3_url: "s3://x/y'z.parquet" }],
    pgAttachments: [{ alias: "pg" }],
    query: "SELECT 1",
    s3: { endpoint: "ho'st", accessKey: "k'k", secretKey: "v'v" },
    pg: { ...PG, password: "pa'ss" },
  });
  // Single quotes doubled per DuckDB SQL escaping.
  assert.ok(stmts.some((s) => /'ho''st'/.test(s)));
  assert.ok(stmts.some((s) => /'pa''ss'/.test(s)));
  assert.ok(stmts.some((s) => /'k''k'/.test(s)));
  assert.ok(stmts.some((s) => /y''z\.parquet/.test(s)));
});

test("makeDuckDBSource: fixture mode reads fixturePath and applies rowShape + normalize", async () => {
  // Use the bundled hurricane fixture as a smoke check of the fixture branch.
  const { fileURLToPath } = await import("node:url");
  const path = await import("node:path");
  const fixturePath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "__fixtures__",
    "hurricane-tracks-fl.sample.json",
  );

  const connector = makeDuckDBSource<{ storm_id: string }>({
    source_id: "smoke_fixture",
    trust_tier: 1,
    parquetViews: [{ name: "tracks", s3_url: "s3://lake-tier1/x.parquet" }],
    pgAttachments: [{ alias: "pg" }],
    query: "SELECT storm_id FROM tracks",
    rowShape: (r) => ({ storm_id: String(r["storm_id"]) }),
    normalize: (rows, ctx) =>
      rows.map((r, i) => ({
        fragment_id: `frag_${i}`,
        source_id: "smoke_fixture",
        source_trust_tier: 1,
        fetched_at: ctx.fetched_at,
        raw: { storm_id: r.storm_id },
        normalized: r,
      })),
    citation: (verified, ttl) => ({
      source: "test",
      verified,
      expires: new Date(Date.parse(verified) + ttl * 1000)
        .toISOString()
        .slice(0, 10),
    }),
    fixturePath,
  });

  const fragments = await connector.fetch();
  assert.ok(fragments.length > 0, "fixture should yield >0 fragments");
  for (const f of fragments) {
    assert.equal(f.source_id, "smoke_fixture");
    assert.equal(f.source_trust_tier, 1);
    assert.ok(
      typeof (f.normalized as { storm_id: unknown }).storm_id === "string",
    );
  }
});
