// Unit tests for reverify-signals.mjs's pure reopen-patch builder.
// Run: node --test scripts/reverify-signals.test.mjs
// (Importing the module does NOT run the CLI — dispatch is isMain-guarded.)

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRegressionPatch, isRealRegression } from "./reverify-signals.mjs";

const NOW = "2026-08-01T12:00:00.000Z";

// --- isRealRegression: the line between "the world changed" and "the signal
// itself never evaluated" — the exact bug caught live against prod on first
// dry-run (city_pulse_first_rows: malformed signal; city_pulse_first_gha:
// workflow_success, unimplemented) before this guard existed. ---
test("isRealRegression — ok:false with a populated observed IS a real regression", () => {
  assert.equal(isRealRegression({ ok: false, observed: { status: 404 } }), true);
  assert.equal(isRealRegression({ ok: false, observed: { count: 0 } }), true);
  assert.equal(isRealRegression({ ok: false, observed: { newest: null } }), true);
});

test("isRealRegression — ok:false with observed:null is NOT a regression (signal never ran)", () => {
  assert.equal(isRealRegression({ ok: false, observed: null }), false);
});

test("isRealRegression — ok:true is never a regression regardless of observed", () => {
  assert.equal(isRealRegression({ ok: true, observed: { status: 200 } }), false);
  assert.equal(isRealRegression({ ok: true, observed: null }), false);
});

test("buildRegressionPatch — reopens with state=open and clears resolution fields", () => {
  const p = buildRegressionPatch({
    result: { detail: "GET https://x/y → 500 (expected 2xx)" },
    existingDetail: null,
    nowIso: NOW,
  });
  assert.equal(p.state, "open");
  assert.equal(p.resolved_at, null);
  assert.equal(p.resolved_by, null);
  assert.equal(p.proof, null);
});

test("buildRegressionPatch — no prior detail: note stands alone", () => {
  const p = buildRegressionPatch({
    result: { detail: "t?x=eq.1 → 0 row(s) (<1)" },
    existingDetail: null,
    nowIso: NOW,
  });
  assert.match(
    p.detail,
    /^AUTO-REOPENED 2026-08-01 \(reverify-signals\): stored signal now fails — t\?x=eq\.1/,
  );
});

test("buildRegressionPatch — prior detail is preserved, note appended", () => {
  const p = buildRegressionPatch({
    result: { detail: "db_fresh: t has no dated period_end" },
    existingDetail: "Original human context about why this check exists.",
    nowIso: NOW,
  });
  assert.match(p.detail, /^Original human context about why this check exists\.\n\nAUTO-REOPENED/);
  assert.match(p.detail, /db_fresh: t has no dated period_end$/);
});

test("buildRegressionPatch — date is sliced to YYYY-MM-DD, not the full timestamp", () => {
  const p = buildRegressionPatch({
    result: { detail: "x" },
    existingDetail: null,
    nowIso: NOW,
  });
  assert.match(p.detail, /AUTO-REOPENED 2026-08-01 /);
  assert.doesNotMatch(p.detail, /T12:00:00/);
});
