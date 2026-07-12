// Unit tests for tripwire-scan.mjs's pure classifiers. No git, no DB.
// Run: node --test scripts/tripwire-scan.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyWorktree, classifyDispatch } from "./tripwire-scan.mjs";

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

const RUN = "https://github.com/ethanrickyjrjr-wq/SWFL-Data-Gulf/actions/runs/29179495252";

test("classifyDispatch — a run URL in the committed acceptance list is yellow (operator recognizes it)", () => {
  assert.equal(classifyDispatch({ url: RUN, acceptedUrls: [RUN] }), "yellow");
});

test("classifyDispatch — an unlisted run URL stays red (the bypass arm is untouched)", () => {
  assert.equal(classifyDispatch({ url: RUN, acceptedUrls: [`${RUN.slice(0, -1)}0`] }), "red");
});

test("classifyDispatch — empty acceptance list means every dispatch is red (fail-closed default)", () => {
  assert.equal(classifyDispatch({ url: RUN, acceptedUrls: [] }), "red");
});
