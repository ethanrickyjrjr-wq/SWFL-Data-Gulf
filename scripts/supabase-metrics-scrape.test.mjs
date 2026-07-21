// Unit tests for supabase-metrics-scrape.mjs. No network, no env, no key.
// Run: node --test scripts/supabase-metrics-scrape.test.mjs
//
// Each test is named for the failure mode it prevents (F1-F5 in
// docs/superpowers/specs/2026-07-21-supabase-db-metrics-design.md).
//
// The governing failure this whole file exists to stop: a scrape that quietly
// returns nothing and renders as a healthy green dashboard. On 07/21/2026
// PostgREST went down with no leading indicator. A monitor that fails silent is
// worse than no monitor, because it is believed.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  REQUIRED,
  RETENTION_DAYS,
  NOT_EGRESS,
  parsePrometheusText,
  selectSeries,
  missingRequired,
  deriveGauges,
} from "./supabase-metrics-scrape.mjs";

const LBL = 'supabase_project_ref="abc123",service_type="db"';

// A trimmed but grammatically faithful sample of what the live endpoint
// returned on 07/21/2026 (HTTP 200, 1138 lines, 317 families).
const SAMPLE = `# HELP node_load1 1m load average.
# TYPE node_load1 gauge
node_load1{${LBL}} 0.04
# HELP pg_stat_database_num_backends Number of backends currently connected
pg_stat_database_num_backends{${LBL},server="localhost:5432"} 9
# HELP max_connections_connection_count Maximum allowed connections
max_connections_connection_count{${LBL},server="localhost:5432"} 60
node_memory_MemTotal_bytes{${LBL}} 9.50153216e+08
node_memory_MemAvailable_bytes{${LBL}} 5.0003968e+08
node_filesystem_size_bytes{${LBL},device="/dev/nvme0n1p2",mountpoint="/"} 1.0359754752e+10
node_filesystem_size_bytes{${LBL},device="/dev/nvme1n1",mountpoint="/data"} 1.2643950592e+10
node_filesystem_avail_bytes{${LBL},device="/dev/nvme0n1p2",mountpoint="/"} 2.321707008e+09
node_filesystem_avail_bytes{${LBL},device="/dev/nvme1n1",mountpoint="/data"} 9.262518272e+09
pg_database_size_mb{${LBL},server="localhost:5432"} 2032.902512550354
physical_replication_lag_physical_replication_lag_seconds{${LBL},server="localhost:5432"} 0
`;

// --- F1: an error body must never parse as "everything is fine" -------------

test("F1 — an HTML error body yields zero series, never a silent partial parse", () => {
  const html = "<!DOCTYPE html>\n<html><body><h1>401 Unauthorized</h1></body></html>\n";
  assert.equal(parsePrometheusText(html).length, 0);
});

test("F1 — zero series means every required metric reports missing, loudly", () => {
  const missing = missingRequired(parsePrometheusText("<html></html>"));
  assert.deepEqual(missing.sort(), [...REQUIRED].sort());
  assert.ok(missing.length > 0, "an empty parse must not look satisfied");
});

test("F1 — comment and blank lines are skipped, not parsed as series", () => {
  const series = parsePrometheusText(SAMPLE);
  assert.ok(series.every((s) => !s.name.startsWith("#")));
  assert.ok(series.every((s) => s.name.length > 0));
});

// --- F2: a beta rename must be named, not swallowed -------------------------

test("F2 — a renamed required series is reported by name, not defaulted to zero", () => {
  const renamed = SAMPLE.replace(/max_connections_connection_count/g, "pg_max_conns_v2");
  const missing = missingRequired(parsePrometheusText(renamed));
  assert.deepEqual(missing, ["max_connections_connection_count"]);
});

test("F2 — a full scrape of the live-shaped sample leaves nothing missing", () => {
  assert.deepEqual(missingRequired(parsePrometheusText(SAMPLE)), []);
});

// --- F3: multi-label-set collapse -------------------------------------------

test("F3 — filesystem selection matches on mountpoint label, never on position", () => {
  const series = parsePrometheusText(SAMPLE);
  // "/" is emitted FIRST in the sample. Position-based selection would return it.
  const data = selectSeries(series, "node_filesystem_size_bytes", { mountpoint: "/data" });
  assert.equal(data.value, 1.2643950592e10);
  const root = selectSeries(series, "node_filesystem_size_bytes", { mountpoint: "/" });
  assert.equal(root.value, 1.0359754752e10);
  assert.notEqual(data.value, root.value);
});

test("F3 — a label predicate that matches nothing returns undefined, not a wrong row", () => {
  const series = parsePrometheusText(SAMPLE);
  assert.equal(
    selectSeries(series, "node_filesystem_size_bytes", { mountpoint: "/nope" }),
    undefined,
  );
});

test("F3 — the two disk gauges are distinct values, proving no collapse", () => {
  const g = deriveGauges(parsePrometheusText(SAMPLE));
  assert.notEqual(g.disk_data_used_pct, g.disk_root_used_pct);
});

// --- F4: Prometheus value grammar -------------------------------------------

test("F4 — exponent notation parses to the full number, not a truncated mantissa", () => {
  const series = parsePrometheusText(SAMPLE);
  assert.equal(selectSeries(series, "node_memory_MemTotal_bytes").value, 950153216);
});

test("F4 — NaN and +Inf/-Inf are dropped at parse time, never carried forward", () => {
  const text = [
    `node_load1{${LBL}} NaN`,
    `node_load15{${LBL}} +Inf`,
    `node_load5{${LBL}} -Inf`,
    `pg_database_size_mb{${LBL}} 12.5`,
  ].join("\n");
  const series = parsePrometheusText(text);
  assert.equal(series.length, 1);
  assert.equal(series[0].name, "pg_database_size_mb");
  assert.ok(series.every((s) => Number.isFinite(s.value)));
});

test("F4 — a series with no labels at all still parses", () => {
  const series = parsePrometheusText("pg_up 1\n");
  assert.equal(series.length, 1);
  assert.equal(series[0].value, 1);
  assert.deepEqual(series[0].labels, {});
});

test("F4 — an optional trailing timestamp is not mistaken for the value", () => {
  const series = parsePrometheusText(`node_load1{${LBL}} 0.04 1750000000000\n`);
  assert.equal(series[0].value, 0.04);
});

// --- F5: divide-by-zero in derived gauges -----------------------------------

test("F5 — a zero connections_max drops the pct gauge rather than emitting Infinity", () => {
  const zeroed = SAMPLE.replace(
    /max_connections_connection_count\{([^}]*)\} 60/,
    "max_connections_connection_count{$1} 0",
  );
  const g = deriveGauges(parsePrometheusText(zeroed));
  assert.ok(!("connections_pct" in g), "a poisoned percentage must not be emitted");
  assert.equal(g.connections_used, 9, "the raw gauge still survives");
});

test("F5 — a zero MemTotal drops mem_used_pct rather than emitting NaN", () => {
  const zeroed = SAMPLE.replace(
    /node_memory_MemTotal_bytes\{([^}]*)\} [\d.e+]+/,
    "node_memory_MemTotal_bytes{$1} 0",
  );
  const g = deriveGauges(parsePrometheusText(zeroed));
  assert.ok(!("mem_used_pct" in g));
});

test("F5 — every derived gauge is a finite number", () => {
  const g = deriveGauges(parsePrometheusText(SAMPLE));
  for (const [k, v] of Object.entries(g)) {
    assert.ok(Number.isFinite(v), `${k} is not finite: ${v}`);
  }
});

// --- The gauges themselves, against the live-shaped sample ------------------

test("gauges — connection saturation is computed from used and max", () => {
  const g = deriveGauges(parsePrometheusText(SAMPLE));
  assert.equal(g.connections_used, 9);
  assert.equal(g.connections_max, 60);
  assert.equal(g.connections_pct, 15);
});

test("gauges — memory used percent inverts MemAvailable", () => {
  const g = deriveGauges(parsePrometheusText(SAMPLE));
  // 1 - 500039680/950153216 = 47.37%
  assert.ok(Math.abs(g.mem_used_pct - 47.37) < 0.01, `got ${g.mem_used_pct}`);
});

test("gauges — disk used percent inverts avail over size", () => {
  const g = deriveGauges(parsePrometheusText(SAMPLE));
  // /data: 1 - 9262518272/12643950592 = 26.74%
  assert.ok(Math.abs(g.disk_data_used_pct - 26.74) < 0.01, `got ${g.disk_data_used_pct}`);
});

test("gauges — all nine spec'd gauges are produced from a complete scrape", () => {
  const g = deriveGauges(parsePrometheusText(SAMPLE));
  assert.deepEqual(Object.keys(g).sort(), [
    "connections_max",
    "connections_pct",
    "connections_used",
    "cpu_load1",
    "db_size_mb",
    "disk_data_used_pct",
    "disk_root_used_pct",
    "mem_used_pct",
    "replication_lag_seconds",
  ]);
});

// --- F6 / F9: the standing guards that are easy to quietly delete -----------

test("F6 — retention is bounded and stated in days", () => {
  assert.equal(typeof RETENTION_DAYS, "number");
  assert.ok(RETENTION_DAYS > 0 && RETENTION_DAYS <= 365);
});

test("F9 — the disclaimer says DB-only, no storage, not the invoice", () => {
  assert.match(NOT_EGRESS, /storage/i);
  assert.match(NOT_EGRESS, /not the invoice|not the bill/i);
});
