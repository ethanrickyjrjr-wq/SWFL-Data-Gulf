# Rebuild egress meter — design

**Date:** 2026-07-22 · **Slug:** `rebuild-egress-meter` · **Check:** `rebuild_egress_meter_live_verify`
**Operator decree:** *"Get it done correctly. Have data flowing on rebuild so you know immediately.
We need to know anyway."*

---

## Problem

Three days of egress argument produced zero measured bytes. Verified in-session 07/21/2026 against
`https://api.supabase.com/api/v1-json`: the words "egress" and "bandwidth" appear **zero times** in
Supabase Management API v1. There is no egress endpoint. The usage endpoints return **counts, not
bytes**. The only byte-level path needs a bearer token with scope `analytics_usage_read`, and
`SUPABASE_ACCESS_TOKEN` is absent from the shell env AND from all 52 GitHub secrets (verified
07/22/2026). The org invoice total is not API-reachable at all — dashboard export only.

## Goal

Stop waiting on the vendor and measure our own side. Every source connector reads through ONE client
— `refinery/sources/supabase.mts::getSupabase()`, whose own doc comment states it is "the canonical
READ client for every source connector." That is the chokepoint. Meter it, and have the number
flowing the moment a rebuild runs.

## What this measures — and what it does NOT

**MEASURES (state it exactly this way, always):** bytes of response payload *received by the refinery
client*, per table, per rebuild run. A real measurement of data that really crossed the wire to us.

**DOES NOT MEASURE:** the bill. Not the invoice, not Supabase's accounting, not wire compression, not
egress from any other consumer (website, lake MCP, ingest pipelines). A run total of 40 MB does NOT
mean the account billed 40 MB.

**Naming rule:** this number is called *"bytes the rebuild pulled."* Never "egress," never "the bill,"
never "our usage." Mislabeling recreates the exact problem it exists to solve — two honest, verified,
mutually-irrelevant numbers reading to the operator as contradiction.

**Sibling, not duplicate:** `scripts/supabase-egress-read.mjs` measures the VENDOR side (served bytes
from the log query) and is blocked on the missing token. This measures the CLIENT side and needs no
token. Different sides of the same wire. Neither replaces the other; do not merge them.

---

## FAILURE MODES — every way this breaks, and the guard that stops it

Locked rule 07/20/2026: no design is approved without this section.

**F1 — Silent under-count from missed chain links.** supabase-js `.from()` returns a query builder;
`.select()` returns a *new* filter builder; filter methods return `this`. Wrap only `from()` and every
read reports 0 bytes → a false all-clear, the worst possible outcome. **Primary risk.**
→ **Guard:** recursive proxy re-wrapping any returned thenable, plus a TDD test
(`meters a from().select().eq().order() chain, not just from()`) asserting a multi-link chain counts.
A test exercising only `from().select()` does NOT satisfy this.

**F2 — Meter reports zero and reads as "clean."** Zero bytes is indistinguishable from "instrument
never fired" — the same shape as the `n_live_tup` zeros and the `emptyTitle` props that misled twice
on 07/22/2026.
→ **Guard:** the report distinguishes three states explicitly — `no reads observed (meter may not be
wired)`, `0 tables / 0 bytes`, and real totals. Never print a bare `0`.

**F3 — The meter breaks the rebuild.** A proxy throwing inside a read path takes down every brain
build. Telemetry must never be load-bearing.
→ **Guard:** every meter call site wrapped in try/catch that swallows and continues; the accumulator
never throws. Same posture as the existing telemetry writebacks (append-only, failure-tolerant).

**F4 — Cross-run bleed.** A module-level accumulator persists across builds in one process, so run
two reports run one + two. Inflated, quietly wrong.
→ **Guard:** explicit `resetMeter()` at build start; the report carries its own run start timestamp.

**F5 — Counting fixture reads as live bytes.** Fixture mode never touches the network; counting
fixture payloads manufactures egress that never happened — an invented number, the one hard block.
→ **Guard:** the meter lives inside `getSupabase()`, which is live-mode only ("fixture mode never
touches the network"). Test asserts the fixture path records nothing.

**F6 — `JSON.stringify` cost on large payloads.** Stringifying a 500k-row response to measure it
doubles memory and can OOM the runner.
→ **Guard:** prefer the response's own byte length where available; cap stringify at a size ceiling
and mark the row `approx` beyond it. Measurement must never cost more than the read.

**F7 — Mislabeled in the report and quoted as the bill.**
→ **Guard:** the report header prints the scope limit verbatim every run, so a screenshot of it
cannot be misread out of context.

**F8 — Nobody reads it.** 72 recorded ceilings sat invisible until promoted to checks. A number in a
log nobody opens is not surfacing.
→ **Guard:** report prints to rebuild stdout (visible in the run) AND the run total writes to
`public.supabase_db_metrics` as metric `rebuild_bytes_pulled`. That table's real shape, read live
07/22/2026: `scraped_at` timestamptz, `metric` text, `value` double precision. It already has a
scraper and history, so the number trends instead of scrolling past.

---

## Shape

1. `refinery/lib/egress-meter.mts` — accumulator (`recordRead`, `resetMeter`, `meterReport`) +
   `meterClient(client)` recursive thenable-wrapping proxy. Pure, no I/O, unit-testable.
2. `refinery/lib/egress-meter.test.mts` — TDD, one test named per failure mode above.
3. `refinery/sources/supabase.mts` — wrap the cached client in `meterClient()`. One-line change
   at `getSupabase()` (`refinery/sources/supabase.mts:24`).
4. Rebuild entry — `resetMeter()` at start, print `meterReport()` at end, write the run total.

## Verification

`rebuild_egress_meter_live_verify` closes ONLY on a real rebuild run whose stdout shows a per-table
breakdown with non-zero bytes. **A green unit suite does NOT close it** — F1 and F2 are precisely the
failures a passing test suite can coexist with.

## Status 07/22/2026

Spec + failure modes filed. Implementation NOT started — session context exhausted at this point,
and shipping a half-wired meter is F2 by definition.

Next session, in this order: TDD from the failure-mode names above, starting with **F1** (the
multi-link chain test), then **F2**. Do not wire step 3 until F1's test is green — an
unwired-but-present meter reports zero and reads as clean, which is F2 shipped.

**Pre-flight facts already verified this session, do not re-derive:** `getSupabase()` is the sole
read client (its own doc comment says so); reads also flow through `refinery/lib/paginate.mts`
`selectAllPaged` (bounded by a `maxRows` abort ceiling); the storage log shows no burner signature
as of 07/22/2026; the last rebuild ran 07/20 at 01:30 and the 07/21 overage happened AFTER it, so
the rebuild is not the burner.
