// Unit tests for check-sweep.mjs's pure helpers.
// Run: node --test scripts/check-sweep.test.mjs
// (Importing the module does NOT run the CLI — dispatch is isMain-guarded.)
//
// Every test is named for the failure mode from
// docs/superpowers/specs/2026-07-22-check-sweep-design.md that it targets.

import { test } from "node:test";
import assert from "node:assert/strict";
import { isCloseable, buildClosePatch, buildScanPath, RESOLVED_BY } from "./check-sweep.mjs";

const NOW = "2026-08-01T12:00:00.000Z";
const SIGNAL = { type: "http_body", url: "https://x/y", contains: "phrase" };

// --- FM2: a signal that never evaluated must never read as a pass. ---
// The exact inverse of reverify-signals' isRealRegression. `observed:null` is
// check-signals.mjs's universal marker for "this never actually ran" (missing
// params, fetch threw, unimplemented type) — closing on it would be the
// automated version of the false claim this whole ledger exists to prevent.

test("FM2 — ok:true with a populated observed IS closeable", () => {
  assert.equal(isCloseable({ ok: true, observed: { status: 200, matched: true } }), true);
  assert.equal(isCloseable({ ok: true, observed: { count: 3 } }), true);
  assert.equal(isCloseable({ ok: true, observed: { newest: "2026-07-30", age_days: 2 } }), true);
});

test("FM2 — ok:true with observed:null is NOT closeable (signal never ran)", () => {
  assert.equal(isCloseable({ ok: true, observed: null }), false);
});

test("FM2 — ok:false is never closeable regardless of observed", () => {
  assert.equal(isCloseable({ ok: false, observed: { status: 404 } }), false);
  assert.equal(isCloseable({ ok: false, observed: null }), false);
});

test("FM2 — an unimplemented type (workflow_success shape) is not closeable", () => {
  // check-signals.workflowSuccess returns exactly this: ok:false, observed:null.
  assert.equal(
    isCloseable({ ok: false, observed: null, detail: "workflow_success (x) not enabled" }),
    false,
  );
});

// --- The close patch must satisfy the checks_require_proof DB trigger. ---
// The trigger rejects: proof null · kind != 'signal' · ok != 'true' ·
// proof.signal DISTINCT FROM the stored signal · missing observed_at ·
// observed_at older than 1 day.

test("close patch transitions to done and records the machine as resolver", () => {
  const p = buildClosePatch({ signal: SIGNAL, observed: { status: 200 }, nowIso: NOW });
  assert.equal(p.state, "done");
  assert.equal(p.resolved_at, NOW);
  assert.equal(p.resolved_by, RESOLVED_BY);
});

test("close patch proof satisfies every trigger clause", () => {
  const p = buildClosePatch({ signal: SIGNAL, observed: { status: 200 }, nowIso: NOW });
  assert.equal(p.proof.kind, "signal");
  assert.equal(p.proof.ok, true);
  assert.equal(p.proof.observed_at, NOW);
  assert.ok(p.proof.observed);
});

test("close patch echoes the STORED signal verbatim — trigger compares jsonb equality", () => {
  const p = buildClosePatch({ signal: SIGNAL, observed: { status: 200 }, nowIso: NOW });
  // Not a copy with drift: the trigger does `NEW.proof->'signal' IS DISTINCT FROM stored_signal`.
  assert.deepEqual(p.proof.signal, SIGNAL);
});

test("close patch never invents a signal — a signal-less row cannot be swept", () => {
  // Manual-tier rows are out of scope by construction: the scan filters on
  // signal not null, and the builder refuses to fabricate one.
  assert.throws(() => buildClosePatch({ signal: null, observed: { status: 200 }, nowIso: NOW }), {
    message: /signal/i,
  });
});

// --- FM4: per-check timestamp, so a long sweep can't age out its own proofs. ---

test("FM4 — observed_at is the timestamp passed at run time, not a module constant", () => {
  const early = buildClosePatch({ signal: SIGNAL, observed: { status: 200 }, nowIso: NOW });
  const later = buildClosePatch({
    signal: SIGNAL,
    observed: { status: 200 },
    nowIso: "2026-08-01T18:30:00.000Z",
  });
  assert.notEqual(early.proof.observed_at, later.proof.observed_at);
  assert.equal(later.proof.observed_at, "2026-08-01T18:30:00.000Z");
});

// --- FM5: scan scope. Only open + signal-bearing rows, never a bare state scan. ---

test("FM5 — scan path always constrains to open AND signal-bearing", () => {
  const path = buildScanPath({});
  assert.match(path, /state=eq\.open/);
  assert.match(path, /signal=not\.is\.null/);
});

test("FM5 — class filter narrows the sweep", () => {
  assert.match(buildScanPath({ class: "verify" }), /class=eq\.verify/);
});

test("FM5 — project filter narrows the sweep", () => {
  assert.match(buildScanPath({ project: "ingest" }), /project=eq\.ingest/);
});

test("FM5 — untriaged filter targets rows with a NULL class", () => {
  assert.match(buildScanPath({ class: "untriaged" }), /class=is\.null/);
});

test("FM5 — filter values are URL-encoded, not interpolated raw", () => {
  const path = buildScanPath({ project: "a b&c=d" });
  assert.doesNotMatch(path, /a b&c=d/);
  assert.match(path, /project=eq\.a%20b%26c%3Dd/);
});

test("FM5 — an unknown class is rejected rather than silently widening the sweep", () => {
  assert.throws(() => buildScanPath({ class: "bogus" }), { message: /class/i });
});
