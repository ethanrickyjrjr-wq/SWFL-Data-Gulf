// Unit tests for check.mjs's pure close/tier/proof helpers. No DB, no creds.
// Run: node --test scripts/check.test.mjs
// (Importing check.mjs does NOT run the CLI — the dispatch is isMain-guarded.)

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  closeTier,
  buildSignalProof,
  buildManualProof,
  parseSignalFlag,
  ageDays,
  sortByStaleness,
} from "./check.mjs";

const NOW = "2026-07-05T12:00:00Z";

// --- closeTier: the fork the trigger also enforces ---
test("closeTier — a stored signal ⇒ signal tier", () => {
  assert.equal(closeTier({ signal: { type: "http_ok", url: "https://x" } }), "signal");
});

test("closeTier — no signal ⇒ manual tier", () => {
  assert.equal(closeTier({ signal: null }), "manual");
  assert.equal(closeTier({}), "manual");
  assert.equal(closeTier(undefined), "manual");
});

// --- buildSignalProof: what a signal-bearing close writes ---
test("buildSignalProof — kind=signal, ok=true, echoes the STORED signal (trigger binds proof→signal)", () => {
  const signal = { type: "http_ok", url: "https://www.swfldatagulf.com/api/b/master" };
  const observed = { status: 200 };
  const p = buildSignalProof({ signal, observed, nowIso: NOW, by: "ricky" });
  assert.equal(p.kind, "signal");
  assert.equal(p.ok, true);
  assert.deepEqual(p.signal, signal);
  assert.deepEqual(p.observed, observed);
  assert.equal(p.observed_at, NOW);
  assert.equal(p.by, "ricky");
});

test("buildSignalProof — by defaults to session; observed defaults to null", () => {
  const p = buildSignalProof({ signal: { type: "http_ok", url: "x" }, nowIso: NOW });
  assert.equal(p.by, "session");
  assert.equal(p.observed, null);
});

// --- buildManualProof: the honestly-weaker tier ---
test("buildManualProof — kind=manual with evidence", () => {
  const p = buildManualProof({ evidence: "policy pinned @ commit abc", nowIso: NOW });
  assert.equal(p.kind, "manual");
  assert.equal(p.evidence, "policy pinned @ commit abc");
  assert.equal(p.observed_at, NOW);
  assert.equal(p.by, "session");
});

// --- parseSignalFlag: success paths only (failure paths call fail() → exitCode) ---
test("parseSignalFlag — valid http_ok JSON parses", () => {
  const s = parseSignalFlag('{"type":"http_ok","url":"https://x"}');
  assert.equal(s.type, "http_ok");
  assert.equal(s.url, "https://x");
});

test("parseSignalFlag — accepts every phase-1 type", () => {
  for (const type of ["http_ok", "http_body", "db_row_exists", "db_fresh", "workflow_success"]) {
    assert.equal(parseSignalFlag(JSON.stringify({ type, url: "x" })).type, type);
  }
});

// --- ageDays: pure date math ---
test("ageDays — whole days between two ISO timestamps", () => {
  assert.equal(ageDays("2026-07-07T12:00:00Z", "2026-07-03T12:00:00Z"), 4);
});

test("ageDays — null sinceIso returns null (row has no timestamp)", () => {
  assert.equal(ageDays("2026-07-07T12:00:00Z", null), null);
});

test("ageDays — same instant is 0 days", () => {
  assert.equal(ageDays("2026-07-07T12:00:00Z", "2026-07-07T12:00:00Z"), 0);
});

// --- sortByStaleness: oldest-untouched-first, updated_at wins over created_at ---
test("sortByStaleness — orders oldest updated_at first", () => {
  const rows = [
    { check_key: "b", created_at: "2026-06-01T00:00:00Z", updated_at: "2026-07-01T00:00:00Z" },
    { check_key: "a", created_at: "2026-06-01T00:00:00Z", updated_at: "2026-06-05T00:00:00Z" },
  ];
  const sorted = sortByStaleness(rows);
  assert.deepEqual(
    sorted.map((r) => r.check_key),
    ["a", "b"],
  );
});

test("sortByStaleness — falls back to created_at when updated_at is null", () => {
  const rows = [
    { check_key: "recent", created_at: "2026-07-06T00:00:00Z", updated_at: null },
    { check_key: "old", created_at: "2026-06-01T00:00:00Z", updated_at: null },
  ];
  const sorted = sortByStaleness(rows);
  assert.deepEqual(
    sorted.map((r) => r.check_key),
    ["old", "recent"],
  );
});

test("sortByStaleness — does not mutate the input array", () => {
  const rows = [
    { check_key: "b", created_at: "2026-06-01T00:00:00Z", updated_at: "2026-07-01T00:00:00Z" },
    { check_key: "a", created_at: "2026-06-01T00:00:00Z", updated_at: "2026-06-05T00:00:00Z" },
  ];
  const original = [...rows];
  sortByStaleness(rows);
  assert.deepEqual(rows, original);
});
