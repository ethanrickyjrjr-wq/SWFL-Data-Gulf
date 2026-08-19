// Positive controls for Gate 19 (root-entry allowlist) — the real 08/19/2026 offenders
// must block, and every current legitimate root entry must pass.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ROOT_ALLOWLIST, newRootViolations } from "./root-allowlist.mjs";

test("the real historical offenders would have blocked", () => {
  const added = [
    "GET DONE/TURN SYSTEM ON.md",
    "GO-LIVE/email-scheduler-unit-f.md",
    "SOCIAL BUILD/README.md",
    "__snapshots__/dock-chart-migration/zhvi-before.json",
    "response.html",
    "crawl4ai-email-out.md",
  ];
  assert.deepEqual(newRootViolations(added), [
    "GET DONE",
    "GO-LIVE",
    "SOCIAL BUILD",
    "__snapshots__",
    "crawl4ai-email-out.md",
    "response.html",
  ]);
});

test("adds inside allowlisted roots pass — the gate is about NEW top-level entries only", () => {
  const added = [
    "docs/runbooks/email-scheduler-unit-f.md",
    "lib/listings/CLAUDE.md",
    "_RESEARCH/audits/2026-08-11-crawl4ai-email-out.md",
    "scripts/new-thing.mjs",
    ".claude/hooks/lib/root-allowlist.mjs",
  ];
  assert.deepEqual(newRootViolations(added), []);
});

test("windows separators and ./ prefixes normalize", () => {
  assert.deepEqual(newRootViolations(["NEW JUNK\\brief.md", "./docs/x.md"]), ["NEW JUNK"]);
});

test("empty/no input never throws, never blocks", () => {
  assert.deepEqual(newRootViolations([]), []);
  assert.deepEqual(newRootViolations(undefined), []);
});

test("allowlist carries the load-bearing generic-named dirs so no one 'cleans' them", () => {
  for (const mustHave of ["brains", "utils", "tools", "content", "verification"]) {
    assert.ok(ROOT_ALLOWLIST.has(mustHave), `${mustHave} missing from allowlist`);
  }
});
