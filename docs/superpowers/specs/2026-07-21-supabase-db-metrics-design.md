# Supabase Metrics API scrape to ops db-health page

**Date:** 2026-07-21
**Check:** `supabase_db_metrics_live_verify`

## Problem

Operator 07/21/2026, handing `https://supabase.com/docs/guides/telemetry/metrics`:
*"why do we not have all of this in /ops (other repo)"*

Answer: nobody wired it. `grep -ri 'privileged/metrics|prometheus|customer/v1'` over
`swfldatagulf-ops` returns zero hits. Not a decision — never built.

On 07/21/2026 PostgREST went down, `/desk` rendered blank and login broke (SCRATCHPAD item
19). We had no leading indicator. Connection saturation, memory pressure, disk fill and
replication lag are all published by Supabase and we were not looking at any of them.

## What this is NOT — read before wiring anything to it

**The Metrics API is DB-instance-only. It has ZERO storage metrics.** Verified in-session:
`grep -i storag` over all 317 returned metric families returns nothing. The 07/21 egress
burn was Storage/S3 (SCRATCHPAD item 0a — lake MCP sniffing whole `.csv.gz` objects on
boot). **This surface would not have caught it and must never be presented as egress
coverage.** It is also not the invoice — same limitation as the analytics endpoint.

## Vendor contract — verified live 07/21/2026, not from memory

- `GET https://<project-ref>.supabase.co/customer/v1/privileged/metrics`
- HTTP Basic auth: username `service_role`, password = the service key.
- Prometheus text exposition format.
- Live probe against our project: **HTTP 200, 135 KB, 1138 lines, 317 metric families.**
- Supabase marks this **beta** — "Metric names and labels might evolve." That is a named
  failure mode below, not a footnote.
- Source: `https://supabase.com/docs/guides/telemetry/metrics/vendor-agnostic`

## Goal

Nine human-meaningful gauges, scraped hourly into one Supabase table, rendered on an ops
page that shows its own staleness. No Prometheus, no Grafana, no collector.

## Scale check (RULE 11)

We are one project. Standing up Prometheus + Grafana Cloud to watch 317 series at 60s is
the hyperscaler pattern and is dropped. Hourly x 9 gauges = 79k rows/year, ~3.2 MB/day of
additional scrape egress. A `node` script on a GHA cron and one table is the whole build.

## What we're building

1. `public.supabase_db_metrics` — long format: `scraped_at`, `metric`, `value`.
2. `scripts/supabase-metrics-scrape.mjs` — fetch, parse, derive, upsert. `--dry-run`.
3. `.github/workflows/supabase-metrics-scrape.yml` — hourly cron wrapper.
4. `swfldatagulf-ops` `/db-health` page + `lib/db-health.ts` read adapter.

### The nine gauges (each derived from a verified-present series)

- `connections_used` <- `pg_stat_database_num_backends`
- `connections_max` <- `max_connections_connection_count`
- `connections_pct` <- used / max * 100
- `mem_used_pct` <- 1 - `node_memory_MemAvailable_bytes` / `node_memory_MemTotal_bytes`
- `disk_data_used_pct` <- `node_filesystem_{size,avail}_bytes` @ `mountpoint="/data"`
- `disk_root_used_pct` <- `node_filesystem_{size,avail}_bytes` @ `mountpoint="/"`
- `db_size_mb` <- `pg_database_size_mb`
- `cpu_load1` <- `node_load1`
- `replication_lag_seconds` <- `physical_replication_lag_physical_replication_lag_seconds`

## Failure modes — every one paired with its guard (RULE 3.5)

**F1. Endpoint returns HTML or an error body instead of Prometheus text** (auth expiry,
beta endpoint moved, Supabase incident). A naive line parser yields zero metrics and we
write a row of zeros that renders as a healthy green dashboard.
-> **Guard:** `parsePrometheusText` is tested against an HTML body; the scraper aborts with
a non-zero exit and writes NOTHING if the required-metric list is not fully satisfied.

**F2. Beta metric rename** — Supabase says names may evolve. A renamed series silently
disappears and the gauge derived from it silently becomes zero/absent.
-> **Guard:** explicit `REQUIRED` list. Any missing required series -> named error listing
exactly which ones vanished -> non-zero exit -> no partial write. Loud, not silent.

**F3. Multi-label-set collapse** — `node_filesystem_*` publishes one row per mountpoint,
`node_cpu_seconds_total` one per cpu x mode. Taking the first match silently reports `/`
when we meant `/data`.
-> **Guard:** the selector matches on a label predicate, never position. Tested with a
two-mountpoint fixture asserting the `/data` value is chosen.

**F4. Prometheus value grammar** — values arrive as `1.0359754752e+10`, and the format
permits `NaN`, `+Inf`, `-Inf`. `parseFloat` on `NaN` gives NaN, which Postgres rejects or
stores as garbage.
-> **Guard:** parser tests for exponent notation and for NaN/Inf; non-finite values are
dropped at parse time, never written.

**F5. Divide-by-zero in derived gauges** — if `connections_max` or `MemTotal` reads 0, the
percentage becomes Infinity or NaN.
-> **Guard:** every derivation guards its denominator; a zero denominator drops that gauge
rather than emitting a poisoned number.

**F6. Unbounded table growth.**
-> **Guard:** the script deletes rows older than 90 days on each run. Hourly cadence, not
per-minute.

**F7. Secret leak** — the service key in a workflow file or echoed into a public Actions
log. This exact class caused the 07/18/2026 incident.
-> **Guard:** key comes from `secrets.SUPABASE_SERVICE_KEY` only; the script never prints
the key or the full URL with credentials; `--dry-run` prints parsed gauges only.

**F8. The page shows stale data as if it were live** — the cron dies, the page keeps
rendering yesterday's numbers in green. This is the documented `/ops` failure class.
-> **Guard:** the page renders `scraped_at` age and marks anything older than 3 hours as
stale in the UI; the read adapter returns the age, never just the value.

**F9. This surface gets cited as egress coverage** — the single most likely misuse, given
it was requested during an egress crisis.
-> **Guard:** a header line on the page and in the script stating DB-instance only, no
storage metrics, not the invoice. Same pattern as `scripts/supabase-egress-read.mjs`.

## TDD scope

Deterministic logic under test: `parsePrometheusText`, `selectSeries` (label predicate),
and `deriveGauges`. Tests are named for F1-F5. Network, auth, and the write path are not
unit-tested — they are covered by `--dry-run` against the live endpoint and by the
`supabase_db_metrics_live_verify` check.
