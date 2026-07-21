#!/usr/bin/env node
// supabase-metrics-scrape.mjs — scrape the Supabase Metrics API into
// public.supabase_db_metrics so /db-health on the ops dashboard has a leading
// indicator instead of a postmortem.
//
//   node scripts/supabase-metrics-scrape.mjs --dry-run    # parse + print, write nothing
//   node scripts/supabase-metrics-scrape.mjs              # scrape, upsert, prune
//
// WHAT THIS IS NOT — read before wiring anything to it:
//   The Metrics API is the Postgres instance and its host. It publishes ZERO
//   storage metrics (verified 07/21/2026: `grep -i storag` over all 317 returned
//   families matches nothing). The 07/21 egress burn was Storage/S3 traffic and
//   this endpoint could not have seen it. This is not the invoice either.
//
// VENDOR CONTRACT — verified live 07/21/2026 against our own project, not from
// memory and not from docs prose:
//   GET https://<ref>.supabase.co/customer/v1/privileged/metrics
//   HTTP Basic auth: username `service_role`, password = the service key.
//   Prometheus text exposition format. Our project returned HTTP 200, 135 KB,
//   1138 lines, 317 metric families.
//   Source: https://supabase.com/docs/guides/telemetry/metrics/vendor-agnostic
//   Supabase marks this BETA: "Metric names and labels might evolve." That is
//   why REQUIRED exists and why a missing series aborts the run.
//
// Design + failure modes: docs/superpowers/specs/2026-07-21-supabase-db-metrics-design.md
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveSupabaseCreds } from "./lib/supabase-creds.mjs";

const ROOT = process.cwd();
const SECRETS_PATH = resolve(ROOT, ".dlt/secrets.toml");
const TABLE = "supabase_db_metrics";

export const RETENTION_DAYS = 90;

export const NOT_EGRESS =
  "DB instance only. This feed carries no storage metrics and is not the invoice.";

// Every series a complete scrape must contain. A beta rename makes one of these
// vanish; we would rather fail loudly than write a dashboard full of zeros (F2).
export const REQUIRED = [
  "pg_stat_database_num_backends",
  "max_connections_connection_count",
  "node_memory_MemTotal_bytes",
  "node_memory_MemAvailable_bytes",
  "node_filesystem_size_bytes",
  "node_filesystem_avail_bytes",
  "pg_database_size_mb",
  "node_load1",
  "physical_replication_lag_physical_replication_lag_seconds",
];

// --- parsing ----------------------------------------------------------------

// One sample line: `name{label="v",label2="v2"} 1.23e+04 [timestamp]`
// Labels are optional. A trailing millisecond timestamp is optional and is NOT
// the value (F4). Anything non-finite — NaN, +Inf, -Inf — is dropped here so it
// can never reach a derivation or the database (F4).
const LINE = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{([^}]*)\})?\s+(\S+)(?:\s+\S+)?\s*$/;

function parseLabels(raw) {
  const labels = {};
  if (!raw) return labels;
  for (const m of raw.matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\]|\\.)*)"/g)) {
    labels[m[1]] = m[2].replace(/\\"/g, '"').replace(/\\n/g, "\n").replace(/\\\\/g, "\\");
  }
  return labels;
}

export function parsePrometheusText(text) {
  const out = [];
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const m = LINE.exec(trimmed);
    if (!m) continue; // HTML, JSON error bodies, junk — none of it parses (F1)
    const value = Number(m[3]);
    if (!Number.isFinite(value)) continue;
    out.push({ name: m[1], labels: parseLabels(m[2]), value });
  }
  return out;
}

// Match on a label predicate, never on position — `node_filesystem_*` emits one
// row per mountpoint and "/" comes first (F3).
export function selectSeries(series, name, labels = {}) {
  return series.find(
    (s) => s.name === name && Object.entries(labels).every(([k, v]) => s.labels[k] === v),
  );
}

export function missingRequired(series) {
  const present = new Set(series.map((s) => s.name));
  return REQUIRED.filter((n) => !present.has(n));
}

// --- derivation -------------------------------------------------------------

function val(series, name, labels) {
  return selectSeries(series, name, labels)?.value;
}

// Emit a gauge only if it is a finite number. A zero denominator drops the gauge
// rather than poisoning the dashboard with Infinity or NaN (F5).
function put(gauges, key, value) {
  if (Number.isFinite(value)) gauges[key] = value;
}

function pct(n) {
  return Math.round(n * 10000) / 100;
}

function usedPct(gauges, key, size, avail) {
  if (!Number.isFinite(size) || !Number.isFinite(avail) || size <= 0) return;
  put(gauges, key, pct(1 - avail / size));
}

export function deriveGauges(series) {
  const g = {};

  const used = val(series, "pg_stat_database_num_backends");
  const max = val(series, "max_connections_connection_count");
  put(g, "connections_used", used);
  put(g, "connections_max", max);
  if (Number.isFinite(used) && Number.isFinite(max) && max > 0) {
    put(g, "connections_pct", pct(used / max));
  }

  usedPct(
    g,
    "mem_used_pct",
    val(series, "node_memory_MemTotal_bytes"),
    val(series, "node_memory_MemAvailable_bytes"),
  );

  for (const [key, mountpoint] of [
    ["disk_data_used_pct", "/data"],
    ["disk_root_used_pct", "/"],
  ]) {
    usedPct(
      g,
      key,
      val(series, "node_filesystem_size_bytes", { mountpoint }),
      val(series, "node_filesystem_avail_bytes", { mountpoint }),
    );
  }

  put(g, "db_size_mb", val(series, "pg_database_size_mb"));
  put(g, "cpu_load1", val(series, "node_load1"));
  put(
    g,
    "replication_lag_seconds",
    val(series, "physical_replication_lag_physical_replication_lag_seconds"),
  );

  return g;
}

// --- io ---------------------------------------------------------------------

function creds() {
  let tomlText = "";
  try {
    tomlText = readFileSync(SECRETS_PATH, "utf8");
  } catch {
    // No local secrets file (CI) — env vars are the fallback.
  }
  const c = resolveSupabaseCreds({ tomlText, env: process.env });
  if (!c) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_KEY not found in .dlt/secrets.toml or env");
  }
  return c;
}

export function projectRef(url) {
  const m = /^https:\/\/([a-z0-9]+)\.supabase\./.exec(url);
  if (!m) throw new Error("could not derive project ref from SUPABASE_URL");
  return m[1];
}

// The key is never printed and never interpolated into a logged URL (F7).
async function fetchMetrics({ ref, key }) {
  const res = await fetch(`https://${ref}.supabase.co/customer/v1/privileged/metrics`, {
    headers: {
      authorization: `Basic ${Buffer.from(`service_role:${key}`).toString("base64")}`,
    },
  });
  if (!res.ok) {
    throw new Error(
      `metrics endpoint returned HTTP ${res.status} — check the service key and that ` +
        `the beta endpoint still exists at /customer/v1/privileged/metrics`,
    );
  }
  return res.text();
}

async function rest(path, init = {}) {
  const { url, key } = creds();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(
      `PostgREST ${init.method ?? "GET"} ${path} -> ${res.status} ${await res.text()}`,
    );
  }
  return res;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const { url, key } = creds();
  const ref = projectRef(url);

  const text = await fetchMetrics({ ref, key });
  const series = parsePrometheusText(text);

  // F1/F2: nothing is written unless the scrape is complete. A partial write is
  // how a dead monitor renders green.
  const missing = missingRequired(series);
  if (missing.length) {
    throw new Error(
      `scrape incomplete — ${missing.length} required series absent from the ` +
        `${series.length} parsed: ${missing.join(", ")}. Nothing written. If Supabase ` +
        `renamed these (the API is beta), update REQUIRED and the derivations together.`,
    );
  }

  const gauges = deriveGauges(series);
  const scrapedAt = new Date().toISOString();
  const rows = Object.entries(gauges).map(([metric, value]) => ({
    scraped_at: scrapedAt,
    metric,
    value,
  }));

  console.log(NOT_EGRESS);
  console.log(`parsed ${series.length} series; ${rows.length} gauges at ${scrapedAt}`);
  for (const r of rows) console.log(`  ${r.metric.padEnd(24)} ${r.value}`);

  if (dryRun) {
    console.log("--dry-run: nothing written");
    return;
  }

  await rest(TABLE, {
    method: "POST",
    body: JSON.stringify(rows),
    headers: { prefer: "resolution=merge-duplicates" },
  });

  // F6: bounded growth.
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400_000).toISOString();
  await rest(`${TABLE}?scraped_at=lt.${encodeURIComponent(cutoff)}`, { method: "DELETE" });

  console.log(`wrote ${rows.length} rows; pruned older than ${cutoff}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err) => {
    console.error(`supabase-metrics-scrape: ${err.message}`);
    process.exitCode = 1;
  });
}
