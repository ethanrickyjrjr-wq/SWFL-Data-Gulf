// Proof for the worktree-drift SessionStart line.
// Run: node --test .claude/hooks/print-worktree-drift.test.mjs
//
// Born 08/30/2026, operator: "why would there be 6 other checkouts carrying the old shit
// CLAUDE.md and not have .claude/playbooks????? Just do it all correctly!!!!!" Six worktrees
// from July sat 560–808 commits behind main; three were fully merged and clean (dead), two
// carried one unlanded commit each, one held superseded subagent work. Nothing printed any of
// it. This line does.
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyWorktree, renderLine } from "./print-worktree-drift.mjs";

const base = {
  path: "C:/Users/ethan/dev/bp-x",
  branch: "wt/x",
  dirty: 0,
  ahead: 0,
  behind: 0,
  merged: true,
  ageDays: 1,
  claudeMdMatchesMain: true,
};

test("clean, merged, nothing ahead → DEAD with the cleanup command", () => {
  const c = classifyWorktree({ ...base, behind: 801, ageDays: 40 });
  assert.equal(c.status, "DEAD");
  assert.match(renderLine(c), /worktree\.mjs cleanup x/);
});

// FAILURE MODE: a dead-looking worktree with unlanded commits is NOT dead — deleting it
// loses work (the 07/22 four-lane fix and the 08/03 permits wiring were exactly this).
test("unlanded commits → UNLANDED, never DEAD, count named", () => {
  const c = classifyWorktree({ ...base, ahead: 1, merged: false, behind: 765 });
  assert.equal(c.status, "UNLANDED");
  assert.match(renderLine(c), /1 commit\(s\) not on main/);
});

test("dirty files on a stale worktree → DIRTY, never DEAD", () => {
  const c = classifyWorktree({ ...base, dirty: 5, behind: 98, ageDays: 18 });
  assert.equal(c.status, "DIRTY");
  assert.match(renderLine(c), /5 uncommitted/);
});

// FAILURE MODE: the reason this exists — a checkout running old rules.
test("CLAUDE.md differing from main is named on every status", () => {
  const c = classifyWorktree({ ...base, ahead: 1, merged: false, claudeMdMatchesMain: false });
  assert.match(renderLine(c), /CLAUDE\.md differs from main/);
});

test("fresh, in-sync worktree is quiet", () => {
  const c = classifyWorktree({ ...base, merged: false, ahead: 2, behind: 0, ageDays: 0 });
  assert.equal(c.status, "OK");
  assert.equal(renderLine(c), "");
});

test("far behind main with nothing to land → STALE", () => {
  const c = classifyWorktree({ ...base, merged: false, ahead: 0, behind: 300, ageDays: 20 });
  assert.equal(c.status, "STALE");
});
