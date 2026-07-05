// Unit tests for the cron-failure classifier.
// Run: node --test .github/scripts/classify-cron-failure.test.mjs
//
// Inputs are real (or realistic) log tails drawn from docs/cron-rebuild-failures.md.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classify,
  isLocalModule,
  isFreshnessProbe,
  shouldRetry,
  needsLlm,
} from "./classify-cron-failure.mjs";

test("MISSING_DEP — bs4 resolves to beautifulsoup4 via the allowlist", () => {
  const c = classify("ModuleNotFoundError: No module named 'bs4'");
  assert.equal(c.klass, "MISSING_DEP");
  assert.equal(c.signal, "bs4");
  assert.match(c.suggestedAction, /beautifulsoup4/);
  assert.doesNotMatch(c.suggestedAction, /Add `bs4`/); // must NOT suggest the raw import name
});

test("MISSING_DEP — unknown package keeps a verify-the-name caveat", () => {
  const c = classify("ModuleNotFoundError: No module named 'somerandompkg'");
  assert.equal(c.klass, "MISSING_DEP");
  assert.match(c.suggestedAction, /verify the exact PyPI name/i);
});

test("MISSING_DEP — stdlib name is flagged as an env problem, not a missing package", () => {
  const c = classify("ModuleNotFoundError: No module named 'sqlite3'");
  assert.equal(c.klass, "MISSING_DEP");
  assert.match(c.suggestedAction, /standard-library/i);
});

test("MISSING_SECRET — KeyError on an UPPER_SNAKE name", () => {
  const c = classify("KeyError: 'SUPABASE_S3_ENDPOINT'");
  assert.equal(c.klass, "MISSING_SECRET");
  assert.match(c.signal, /SUPABASE_S3_ENDPOINT/);
  assert.match(c.suggestedAction, /env:/);
});

test("MISSING_SECRET — 'missing required env var(s)' multi-name", () => {
  const c = classify(
    "storm-history-source: missing required env var(s) for live mode: SUPABASE_S3_ENDPOINT, SUPABASE_S3_ACCESS_KEY_ID, SUPABASE_S3_SECRET_ACCESS_KEY. Set the",
  );
  assert.equal(c.klass, "MISSING_SECRET");
  assert.match(c.signal, /SUPABASE_S3_ENDPOINT/);
});

test("MISSING_SECRET — 'X not set'", () => {
  const c = classify("RuntimeError: FRED_API_KEY not set");
  assert.equal(c.klass, "MISSING_SECRET");
  assert.equal(c.signal.split(" ")[0], "FRED_API_KEY");
});

test("MISSING_SECRET — a lowercase KeyError is NOT a secret", () => {
  const c = classify("KeyError: 'year_'");
  assert.notEqual(c.klass, "MISSING_SECRET");
});

test("LOCKFILE — frozen-lockfile drift", () => {
  const c = classify("error: lockfile had changes, but lockfile is frozen");
  assert.equal(c.klass, "LOCKFILE");
  assert.match(c.suggestedAction, /bun install/);
});

test("ACTION_VERSION — nonexistent action pin", () => {
  const c = classify(
    "Error: Unable to resolve action `actions/checkout@v6`, unable to find version `v6`",
  );
  assert.equal(c.klass, "ACTION_VERSION");
  assert.match(c.signal, /actions\/checkout@v6/);
});

test("SCHEMA_DRIFT — orphan concept", () => {
  const c = classify(
    'FAILED: [normalize] Orphan Concept error: 3 slug claim(s) in pack "master" are not registered in refinery/vocab/brain-vocabulary.json:',
  );
  assert.equal(c.klass, "SCHEMA_DRIFT");
});

test("SCHEMA_DRIFT — relation does not exist", () => {
  const c = classify('relation "data_lake.faf_sctg_lookup" does not exist');
  assert.equal(c.klass, "SCHEMA_DRIFT");
});

test("SCHEMA_DRIFT — Postgres DatatypeMismatch (column type drift)", () => {
  const c = classify(
    'psycopg2.errors.DatatypeMismatch: column "published_date" is of type date but expression is of type character varying',
  );
  assert.equal(c.klass, "SCHEMA_DRIFT");
});

test("SCHEMA_DRIFT — Stage 4 failed validation", () => {
  const c = classify(
    "FAILED: Stage 4: rendered pack failed validation — NOT writing brains/master.md",
  );
  assert.equal(c.klass, "SCHEMA_DRIFT");
});

test("DATA_EMPTY — zero rows from sources", () => {
  const c = classify("WARN: 0 rows from all 4 broker URLs");
  assert.equal(c.klass, "DATA_EMPTY");
});

test("TRANSIENT — FRED HTTP 429", () => {
  const c = classify("FRED FLUR HTTP 429 — macro-florida-source rate-limited mid-rebuild");
  assert.equal(c.klass, "TRANSIENT");
});

test("TRANSIENT — socket closed", () => {
  const c = classify(
    "FAILED: The socket connection was closed unexpectedly. For more information, pass `verbose: true`",
  );
  assert.equal(c.klass, "TRANSIENT");
});

test("TRANSIENT — SSL UNEXPECTED_EOF", () => {
  const c = classify("SSL: UNEXPECTED_EOF_WHILE_READING at resultOffset=4000");
  assert.equal(c.klass, "TRANSIENT");
});

test("TRANSIENT — plain connection error", () => {
  const c = classify("FAILED: Connection error.");
  assert.equal(c.klass, "TRANSIENT");
});

test("UNKNOWN — unrecognised shape", () => {
  const c = classify("some totally novel failure mode nobody has seen");
  assert.equal(c.klass, "UNKNOWN");
});

test("DETERMINISTIC_HOLD — build-02 CRON-DIAG echo from a master HOLD", () => {
  const c = classify("CRON-DIAG failureClass=deterministic reason=brains/fgcu-reri.md not found");
  assert.equal(c.klass, "DETERMINISTIC_HOLD");
});

test("DETERMINISTIC_HOLD — raw _build-report.json deterministic failureClass", () => {
  const c = classify(
    '  "failureClass": "deterministic",\n  "reason": "brains/fgcu-reri.md not found",',
  );
  assert.equal(c.klass, "DETERMINISTIC_HOLD");
});

test("DETERMINISTIC_HOLD — a brain .md not found error", () => {
  const c = classify(
    "Error: brains/sector-credit-swfl.md not found. Run `npm run refinery sector-credit-swfl` first.",
  );
  assert.equal(c.klass, "DETERMINISTIC_HOLD");
});

test("DETERMINISTIC_HOLD — master HOLD line is NOT bucketed UNKNOWN", () => {
  const c = classify(
    "CRON-DIAG failureClass=deterministic reason=HOLD: critical upstream eligibility expired",
  );
  assert.notEqual(c.klass, "UNKNOWN");
  assert.equal(c.klass, "DETERMINISTIC_HOLD");
});

test("DETERMINISTIC_HOLD — a generic (non-brains) .md not found is NOT mis-bucketed", () => {
  // Regression: the dropped 3rd regex arm false-matched these benign lines.
  for (const s of [
    "reason: see CHANGELOG.md not found upstream",
    "fetch failed for reason=docs/guide.md not found on CDN",
  ]) {
    assert.notEqual(classify(s).klass, "DETERMINISTIC_HOLD", s);
  }
});

test("DETERMINISTIC_HOLD — `deterministically` does not match (word boundary)", () => {
  assert.notEqual(classify("failureClass=deterministically computed").klass, "DETERMINISTIC_HOLD");
});

test("BILLING — Anthropic 402 billing_error is pulled out of the generic HOLD bucket", () => {
  const c = classify(
    'CRON-DIAG failureClass=deterministic reason=402 {"type":"error","error":{"type":"billing_error","message":"Your credit balance is too low to access the Claude API."}}',
  );
  assert.equal(c.klass, "BILLING");
  assert.match(c.suggestedAction, /platform\.claude\.com/);
  assert.doesNotMatch(c.suggestedAction, /input_brains/);
});

test("BILLING — wins over TRANSIENT when retry/timeout noise precedes the 402", () => {
  const c = classify(
    "Max retries exceeded ... ReadTimeout ... terminal: 402 billing_error, credit balance is too low",
  );
  assert.equal(c.klass, "BILLING");
});

test("BILLING — the human 'credit balance is too low' message", () => {
  const c = classify(
    "anthropic.BadRequestError: Your credit balance is too low to access the Claude API",
  );
  assert.equal(c.klass, "BILLING");
});

test("CONTENT_STALE — a stalled content guard trips (ContentStaleError)", () => {
  const c = classify(
    "ingest.lib.guards.ContentStaleError: [content-guard] lee_permits: newest content date 2026-06-17 is 18d old (> 14d max) — content stalled; the load may be LOAD-fresh but the source has not advanced — aborting",
  );
  assert.equal(c.klass, "CONTENT_STALE");
  assert.match(c.suggestedAction, /do NOT auto-retry/i);
});

test("CONTENT_STALE — an empty-batch content guard (no dated rows) classifies too", () => {
  const c = classify(
    "ContentStaleError: [content-guard] zhvi_swfl: no dated rows in the fetched batch — source produced nothing datable (dead scrape / empty pull) — aborting",
  );
  assert.equal(c.klass, "CONTENT_STALE");
});

test("CONTENT_STALE — wins over DATA_EMPTY when both a 0-row line and the guard marker appear", () => {
  const c = classify(
    "WARN: 0 rows in delta\nContentStaleError: [content-guard] lee_permits: content stalled — aborting",
  );
  assert.equal(c.klass, "CONTENT_STALE");
});

test("DATA_EMPTY — the redfin empty-pull VolumeGuardError classifies as a 0-row pull", () => {
  const c = classify(
    "ingest.lib.guards.VolumeGuardError: redfin_lee: returned 0 rows — no Lee County rows found (check LEE_REGION filter / URL)",
  );
  assert.equal(c.klass, "DATA_EMPTY");
});

test("routing — CONTENT_STALE never retries and needs no LLM", () => {
  assert.equal(shouldRetry("CONTENT_STALE"), false);
  assert.equal(needsLlm("CONTENT_STALE"), false);
});

test("routing — BILLING never retries and needs no LLM", () => {
  assert.equal(shouldRetry("BILLING"), false);
  assert.equal(needsLlm("BILLING"), false);
});

test("routing — shouldRetry only for TRANSIENT", () => {
  assert.equal(shouldRetry("TRANSIENT"), true);
  for (const k of [
    "MISSING_DEP",
    "MISSING_SECRET",
    "SCHEMA_DRIFT",
    "DETERMINISTIC_HOLD",
    "DATA_EMPTY",
    "CONTENT_STALE",
    "LOCKFILE",
    "UNKNOWN",
  ]) {
    assert.equal(shouldRetry(k), false, k);
  }
});

test("routing — needsLlm only for the fuzzy classes", () => {
  for (const k of ["DATA_EMPTY", "SCHEMA_DRIFT", "UNKNOWN"]) assert.equal(needsLlm(k), true, k);
  for (const k of [
    "MISSING_DEP",
    "MISSING_SECRET",
    "LOCKFILE",
    "ACTION_VERSION",
    "TRANSIENT",
    "DETERMINISTIC_HOLD",
    "CONTENT_STALE",
  ]) {
    assert.equal(needsLlm(k), false, k);
  }
});

test("isFreshnessProbe — only the probe slug", () => {
  assert.equal(isFreshnessProbe("freshness-probe-daily"), true);
  assert.equal(isFreshnessProbe("lee-permits-weekly"), false);
});

test("isLocalModule — a real pipeline dir is local; a PyPI name is not", () => {
  // Runs from repo root in CI/local; ingest/pipelines/fred_g17 exists.
  assert.equal(isLocalModule("fred_g17"), true);
  assert.equal(isLocalModule("beautifulsoup4"), false);
});
