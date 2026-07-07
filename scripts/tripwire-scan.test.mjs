// Unit tests for tripwire-scan.mjs's pure worktree classifier. No git, no DB.
// Run: node --test scripts/tripwire-scan.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyWorktree } from "./tripwire-scan.mjs";

test("classifyWorktree — 0 commits ahead of origin/main is always green (fully landed)", () => {
  assert.equal(classifyWorktree({ aheadCount: 0, ageHours: 999, staleHoursThreshold: 6 }), "green");
});

test("classifyWorktree — commits ahead + fresh (under threshold) is yellow (likely a live session)", () => {
  assert.equal(classifyWorktree({ aheadCount: 3, ageHours: 1, staleHoursThreshold: 6 }), "yellow");
});

test("classifyWorktree — commits ahead + past the threshold is red (needs landing or abandoning)", () => {
  assert.equal(classifyWorktree({ aheadCount: 1, ageHours: 16, staleHoursThreshold: 6 }), "red");
});

test("classifyWorktree — exactly at the threshold is red (>= not >)", () => {
  assert.equal(classifyWorktree({ aheadCount: 1, ageHours: 6, staleHoursThreshold: 6 }), "red");
});
