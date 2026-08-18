// check-proof-of-red-on-push.test.mjs — pure-helper proof for the proof-of-red gate.
// Fixtures are REAL output shapes (bun, node:test, pytest), both directions — the
// "0 fail is green" case is the one that would make this gate lie loudest.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isGitPush,
  isTestFile,
  hasRedMarker,
  basenameKey,
  unprovenFiles,
} from "./check-proof-of-red-on-push.mjs";

test("isGitPush sees plain, chained and safe-push forms", () => {
  assert.ok(isGitPush("git push"));
  assert.ok(isGitPush("cd x && git push origin main"));
  assert.ok(isGitPush("node scripts/safe-push.mjs"));
  assert.ok(!isGitPush("git commit -m x"));
  assert.ok(!isGitPush("echo git pushed"));
});

test("isTestFile: bun/node suffixes, __tests__ dirs, pytest files — and not sources", () => {
  assert.ok(isTestFile("lib/deliverable/cell-policy.test.ts"));
  assert.ok(isTestFile(".claude/hooks/check-area-fence.test.mjs"));
  assert.ok(isTestFile("lib/x/foo.spec.tsx"));
  assert.ok(isTestFile("lib/x/__tests__/foo.ts"));
  assert.ok(isTestFile("ingest/tests/test_geo_ladder.py"));
  assert.ok(!isTestFile("lib/deliverable/cell-policy.ts"));
  assert.ok(!isTestFile("docs/standards/emails.md"));
  assert.ok(!isTestFile("lib/x/testdata.ts"));
});

test("hasRedMarker: red shapes are red", () => {
  assert.ok(hasRedMarker(" 6 pass\n 2 fail\nRan 8 tests"));
  assert.ok(hasRedMarker("not ok 1 - sweeps banned cells"));
  assert.ok(hasRedMarker("✗ drops the emptied block"));
  assert.ok(hasRedMarker("✖ failing tests: 1"));
  assert.ok(hasRedMarker("AssertionError [ERR_ASSERTION]: expected 2"));
  assert.ok(hasRedMarker("FAILED ingest/tests/test_geo_ladder.py::test_zcta_miss"));
});

test("hasRedMarker: green shapes are NOT red — especially bun's routine '0 fail'", () => {
  assert.ok(!hasRedMarker(" 12 pass\n 0 fail\nRan 12 tests across 1 files"));
  assert.ok(!hasRedMarker("ok 3 - renders the strip"));
  assert.ok(!hasRedMarker("all tests passed"));
  assert.ok(!hasRedMarker("0 failed, 14 passed"));
});

test("basenameKey strips test suffix and extension", () => {
  assert.equal(basenameKey("lib/deliverable/cell-policy.test.ts"), "cell-policy");
  assert.equal(basenameKey(".claude/hooks/check-claim-read.test.mjs"), "check-claim-read");
  assert.equal(basenameKey("ingest/tests/test_geo_ladder.py"), "test_geo_ladder");
  assert.equal(basenameKey("lib\\x\\foo.spec.tsx"), "foo");
});

test("unprovenFiles: only files with NO red-evidence line block", () => {
  const evidence = new Set(["cell-policy"]);
  const got = unprovenFiles(
    ["lib/deliverable/cell-policy.test.ts", "lib/email/voice-guard.test.ts"],
    (key) => evidence.has(key),
  );
  assert.deepEqual(got, ["lib/email/voice-guard.test.ts"]);
});

test("unprovenFiles: empty input never blocks", () => {
  assert.deepEqual(
    unprovenFiles([], () => false),
    [],
  );
});
