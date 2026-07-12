// Termination classifier tests. EVERY non-synthetic fixture below is a REAL run from
// this repo's history (`gh run list --json ...`, read-only, 07/11/2026).
//
// The load-bearing vendor fact: a job that hits its `timeout-minutes` ceiling surfaces
// at the RUN level as conclusion `cancelled`, NOT `timed_out`. Proven by corridor-pulse
// runs 27903898570 / 28321195281 / 28739416924 — three consecutive SCHEDULED runs, each
// ~45.3 min wall clock against the 45-minute ceiling then in force, all `cancelled`.
// The workflow's own comment records the kills (corridor-pulse-weekly.yml:31-36:
// "06/21 + 06/28 + 07/05 ALL hit the 45m wall and were killed — full API spend, zero
// rows kept"). A watcher gate that only admits `conclusion == 'failure'` is blind to
// all three. That burn is why TIMEOUT maps to should_retry = false.
//
// Run: node --test .github/scripts/classify-termination.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyTermination, TIMEOUT_RATIO } from "./classify-cron-failure.mjs";

// --- REAL: corridor-pulse-weekly run 28739416924 (07/05/2026) ---
const CORRIDOR_KILL = {
  id: 28739416924,
  conclusion: "cancelled",
  event: "schedule",
  run_started_at: "2026-07-05T11:35:10Z",
  updated_at: "2026-07-05T12:20:28Z", // 45m 18s = 45.30 min
  name: "Corridor pulse weekly",
  path: ".github/workflows/corridor-pulse-weekly.yml",
};
// timeout_minutes: 45 is the ceiling IN FORCE AT KILL TIME. The file says 90 today —
// it was raised in response to these very kills. DO NOT "fix" this fixture to 90: the
// point is the ratio at the moment of death. At runtime the live 90 is the correct
// value, and a future 45-min cancel would classify UNKNOWN_CANCEL — which is right,
// because the ceiling was raised and 45 min is no longer the wall.
const CORRIDOR_WF_AT_KILL = {
  file: "corridor-pulse-weekly.yml",
  timeout_minutes: 45,
  cancel_in_progress: false,
};

// --- REAL: leepa-parcels-annual run 27558172620 (06/15/2026) ---
// leepa is 4-for-4 cancelled, but only THIS one was event=schedule; the other three
// (26459301120, 26457915958, 26455991329) were workflow_dispatch and are out of scope.
const LEEPA_CANCEL = {
  id: 27558172620,
  conclusion: "cancelled",
  event: "schedule",
  run_started_at: "2026-06-15T15:44:55Z",
  updated_at: "2026-06-15T16:15:14Z", // 30m 19s = 30.32 min, vs a 90-min ceiling
  name: "LeePA parcels annual",
  path: ".github/workflows/leepa-parcels-annual.yml",
};
const LEEPA_WF = {
  file: "leepa-parcels-annual.yml",
  timeout_minutes: 90,
  cancel_in_progress: false,
};

// --- REAL: leepa run 26459301120 — a DISPATCH cancel, out of scope ---
const LEEPA_DISPATCH_CANCEL = {
  ...LEEPA_CANCEL,
  id: 26459301120,
  event: "workflow_dispatch",
  run_started_at: "2026-05-26T15:52:50Z",
  updated_at: "2026-05-26T16:23:13Z",
};

test("TIMEOUT — corridor-pulse's 45-minute kill (real run 28739416924)", () => {
  const t = classifyTermination(CORRIDOR_KILL, CORRIDOR_WF_AT_KILL);
  assert.equal(t.klass, "TIMEOUT");
  assert.equal(t.prescription, "TIMEOUT_KILL");
  assert.ok(t.elapsed_minutes > 45.2 && t.elapsed_minutes < 45.4, `elapsed=${t.elapsed_minutes}`);
  assert.ok(t.timeout_ratio >= 1.0, `ratio=${t.timeout_ratio}`);
});

test("MONEY GUARD — a TIMEOUT is NEVER retried (the corridor-pulse burn: 3 kills, full API spend, zero rows kept)", () => {
  assert.equal(classifyTermination(CORRIDOR_KILL, CORRIDOR_WF_AT_KILL).should_retry, false);
});

test("TIMEOUT's prescription names the workflow file it applies to (spec §11)", () => {
  const t = classifyTermination(CORRIDOR_KILL, CORRIDOR_WF_AT_KILL);
  assert.match(t.reason, /corridor-pulse-weekly\.yml/);
  assert.match(t.reason, /timeout-minutes/);
});

test("UNKNOWN_CANCEL — leepa's scheduled cancel at 34% of its ceiling (real run 27558172620)", () => {
  const t = classifyTermination(LEEPA_CANCEL, LEEPA_WF);
  assert.equal(t.klass, "UNKNOWN_CANCEL");
  assert.equal(t.prescription, "UNKNOWN");
  assert.equal(t.should_retry, false);
  assert.ok(t.timeout_ratio < 0.4, `ratio=${t.timeout_ratio}`);
  // "print the evidence, say so" — never an invented diagnosis (spec §11 UNKNOWN).
  assert.match(t.reason, /30\.3/);
  assert.match(t.reason, /90/);
  assert.match(t.reason, /leepa-parcels-annual\.yml/);
});

test("OUT OF SCOPE — a cancelled DISPATCH run is not an incident (leepa 26459301120)", () => {
  const t = classifyTermination(LEEPA_DISPATCH_CANCEL, LEEPA_WF);
  assert.equal(t.klass, "OTHER");
  assert.equal(t.should_retry, false);
});

test("SUPERSEDED — cancel-in-progress + a newer run = a self-cancel, skip silently", () => {
  // Forward guard: NO scheduled workflow declares cancel-in-progress: true today
  // (only smoke-prod.yml, which has no cron), so this class cannot fire in prod yet.
  const t = classifyTermination(
    { ...LEEPA_CANCEL, id: 999 },
    { file: "future.yml", timeout_minutes: 90, cancel_in_progress: true },
    true, // hasNewerRun
  );
  assert.equal(t.klass, "SUPERSEDED");
  assert.equal(t.should_retry, false);
});

test("SUPERSEDED requires BOTH cancel-in-progress AND a newer run", () => {
  const wf = { file: "future.yml", timeout_minutes: 90, cancel_in_progress: true };
  assert.equal(classifyTermination(LEEPA_CANCEL, wf, false).klass, "UNKNOWN_CANCEL");
  const noCip = { file: "future.yml", timeout_minutes: 90, cancel_in_progress: false };
  assert.equal(classifyTermination(LEEPA_CANCEL, noCip, true).klass, "UNKNOWN_CANCEL");
});

test("TIMEOUT beats SUPERSEDED — a run that already burned its budget is never 'just superseded'", () => {
  const wf = { file: "corridor-pulse-weekly.yml", timeout_minutes: 45, cancel_in_progress: true };
  const t = classifyTermination(CORRIDOR_KILL, wf, true);
  assert.equal(t.klass, "TIMEOUT");
  assert.equal(t.should_retry, false);
});

test("GitHub's own `timed_out` conclusion is a TIMEOUT even with no ceiling in the manifest", () => {
  const t = classifyTermination({ ...LEEPA_CANCEL, conclusion: "timed_out" }, null);
  assert.equal(t.klass, "TIMEOUT");
  assert.equal(t.should_retry, false);
});

test("no declared ceiling -> UNKNOWN_CANCEL, never a guessed TIMEOUT", () => {
  const t = classifyTermination(LEEPA_CANCEL, {
    file: "x.yml",
    timeout_minutes: null,
    cancel_in_progress: false,
  });
  assert.equal(t.klass, "UNKNOWN_CANCEL");
  assert.match(t.reason, /no `timeout-minutes`/);
});

test(`the ${TIMEOUT_RATIO} boundary is inclusive`, () => {
  const at = {
    ...LEEPA_CANCEL,
    run_started_at: "2026-06-15T00:00:00Z",
    updated_at: "2026-06-15T01:35:00Z", // 95.0 min
  };
  const under = { ...at, updated_at: "2026-06-15T01:34:00Z" }; // 94.0 min
  const wf = { file: "x.yml", timeout_minutes: 100, cancel_in_progress: false };
  assert.equal(classifyTermination(at, wf).klass, "TIMEOUT");
  assert.equal(classifyTermination(under, wf).klass, "UNKNOWN_CANCEL");
});

test("a `failure` is left alone — the log-based classify() still owns it", () => {
  const t = classifyTermination({ ...LEEPA_CANCEL, conclusion: "failure" }, LEEPA_WF);
  assert.equal(t.klass, "FAILURE");
  assert.equal(t.should_retry, null, "null = not my call; classify()+shouldRetry() decide");
});

test("a success is OTHER — the widened gate must not turn a green run into an incident", () => {
  assert.equal(
    classifyTermination({ ...LEEPA_CANCEL, conclusion: "success" }, LEEPA_WF).klass,
    "OTHER",
  );
});
