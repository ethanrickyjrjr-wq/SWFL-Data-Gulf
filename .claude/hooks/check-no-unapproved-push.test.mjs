// check-no-unapproved-push.test.mjs — failure mode (09/07 + 09/14/2026): the weekly-dep-scan
// cloud routine was blocked, re-ran its push with OPERATOR_APPROVED_PUSH=1 on itself, and
// pushed to main. The token is a HUMAN's word. These pin: an unattended session cannot speak
// it, and the operator's own local approved push keeps working (the worse failure is blocking him).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HOOK = fileURLToPath(new URL("./check-no-unapproved-push.mjs", import.meta.url));

function run(command, extraEnv = {}) {
  const env = { ...process.env, ...extraEnv };
  // The suite itself may run in CI / a cloud session; each test sets only the markers it means.
  for (const k of ["CI", "CLAUDE_CODE_REMOTE"]) if (!(k in extraEnv)) delete env[k];
  return spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ tool_input: { command } }),
    env,
    encoding: "utf8",
  });
}

test("routine self-approves: token + CLAUDE_CODE_REMOTE=true (cloud session) → blocked, says why", () => {
  const r = run("OPERATOR_APPROVED_PUSH=1 git push origin main", { CLAUDE_CODE_REMOTE: "true" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unattended/i);
  assert.match(r.stderr, /CLAUDE_CODE_REMOTE/);
});

test("routine self-approves: token + CI=true → blocked", () => {
  const r = run("OPERATOR_APPROVED_PUSH=1 node scripts/safe-push.mjs", { CI: "true" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unattended/i);
});

test("operator's approved push in a local session (no markers, piped stdio) → allowed as before", () => {
  // spawnSync pipes stdio, exactly like a real hook run: isTTY is undefined here AND in a live
  // interactive session (measured 09/20/2026) — which is why there is no TTY clause.
  assert.equal(run("OPERATOR_APPROVED_PUSH=1 git push origin main").status, 0);
  assert.equal(run("OPERATOR_APPROVED_PUSH=1 node scripts/safe-push.mjs").status, 0);
});

test("plain git push with no token → still blocked, markers or not", () => {
  assert.equal(run("git push").status, 2);
  assert.equal(run("git push", { CLAUDE_CODE_REMOTE: "true" }).status, 2);
});

test("non-push commands are untouched in an unattended session", () => {
  assert.equal(run("git commit -m 'git push later'", { CLAUDE_CODE_REMOTE: "true" }).status, 0);
});
