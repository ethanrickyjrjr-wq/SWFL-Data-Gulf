// check-red-before-write.test.mjs — TDD's red run enforced BETWEEN writing the test and
// writing the implementation. Failure modes: the gate fires too widely (habit tax,
// RULE 11) or not at all (silent no-op). These pin the narrow trigger shape.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionTestWrites, pendingRedTarget } from "./check-red-before-write.mjs";

const W = (p) => ({ name: "Write", input: { file_path: p } });
const E = (p) => ({ name: "Edit", input: { file_path: p } });

test("Write-created test files are collected; Edits and impl writes are not", () => {
  const calls = [
    W("lib/x/foo.test.mts"),
    E("lib/x/bar.test.mts"), // edit of an existing test — not a session creation
    W("lib/x/baz.mts"), // impl, not a test
  ];
  assert.deepEqual(sessionTestWrites(calls), ["lib/x/foo.test.mts"]);
});

test("impl write matching a session-written test is the pending-red target", () => {
  const t = pendingRedTarget("lib/x/foo.mts", ["lib/x/foo.test.mts"]);
  assert.equal(t, "lib/x/foo.test.mts");
});

test("Windows-style impl path still matches", () => {
  const t = pendingRedTarget("lib\\x\\foo.mts", ["lib/x/foo.test.mts"]);
  assert.equal(t, "lib/x/foo.test.mts");
});

test("unrelated impl write does not fire — no habit tax", () => {
  assert.equal(pendingRedTarget("lib/x/bar.mts", ["lib/x/foo.test.mts"]), null);
});

test("writing the test file itself never fires", () => {
  assert.equal(pendingRedTarget("lib/x/foo.test.mts", ["lib/x/foo.test.mts"]), null);
});

test("docs and config are never implementation targets", () => {
  assert.equal(pendingRedTarget("docs/foo.md", ["lib/x/foo.test.mts"]), null);
  assert.equal(pendingRedTarget("lib/x/foo.json", ["lib/x/foo.test.mts"]), null);
});

test("no session test writes → nothing ever fires (impl-first is the push gate's job)", () => {
  assert.equal(pendingRedTarget("lib/x/foo.mts", []), null);
});
