// paid-approval-unattended.test.mjs — failure mode: OPERATOR_APPROVED_PAID_RUN=1 is a HUMAN's
// word, but an unattended session (cloud routine, CI) could set it on itself and spend — the
// same hole the weekly-dep-scan routine used on the push hook 09/07 + 09/14/2026. Four sites of
// the shape: two hooks and the two scripts they guard. A local operator session is unchanged.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const at = (rel) => fileURLToPath(new URL(rel, import.meta.url));

function run(file, args, { input = "", env: extra = {} } = {}) {
  const env = { ...process.env, ...extra };
  for (const k of ["CI", "CLAUDE_CODE_REMOTE", "OPERATOR_APPROVED_PAID_RUN"])
    if (!(k in extra)) delete env[k];
  return spawnSync(process.execPath, [at(file), ...args], { input, env, encoding: "utf8" });
}
const REMOTE = { CLAUDE_CODE_REMOTE: "true" };

test("paid-dispatch hook: self-set token in a cloud session → blocked, says why", () => {
  const input = JSON.stringify({
    tool_input: { command: "OPERATOR_APPROVED_PAID_RUN=1 gh workflow run daily-rebuild.yml" },
  });
  const r = run("./check-no-paid-dispatch.mjs", [], { input, env: REMOTE });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unattended/i);
});

test("paid-dispatch hook: operator's token in a local session → allowed as before", () => {
  const input = JSON.stringify({
    tool_input: { command: "OPERATOR_APPROVED_PAID_RUN=1 gh workflow run daily-rebuild.yml" },
  });
  assert.equal(run("./check-no-paid-dispatch.mjs", [], { input }).status, 0);
});

test("apify hook: env token in a cloud session → blocked; local → allowed", () => {
  const input = JSON.stringify({ tool_name: "mcp__plugin_apify_apify__call-actor" });
  const blocked = run("./check-no-apify-actor-run.mjs", [], {
    input,
    env: { ...REMOTE, OPERATOR_APPROVED_PAID_RUN: "1" },
  });
  assert.equal(blocked.status, 2);
  assert.match(blocked.stderr, /unattended/i);
  const ok = run("./check-no-apify-actor-run.mjs", [], {
    input,
    env: { OPERATOR_APPROVED_PAID_RUN: "1" },
  });
  assert.equal(ok.status, 0);
});

test("dispatch-rebuild.mjs: token + CI=true → refuses as unattended before anything else", () => {
  // master + force is refused later anyway, so this can never dispatch a real paid run —
  // what is pinned is that the UNATTENDED refusal comes first.
  const r = run("../../scripts/dispatch-rebuild.mjs", ["master", "--reason", "test"], {
    env: { CI: "true", OPERATOR_APPROVED_PAID_RUN: "1" },
  });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /unattended/i);
});

test("paid-run.mjs: token + cloud session → refuses as unattended, never runs the command", () => {
  const r = run("../../scripts/paid-run.mjs", ["node", "-e", "console.log('RAN')"], {
    env: { ...REMOTE, OPERATOR_APPROVED_PAID_RUN: "1" },
  });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unattended/i);
  assert.doesNotMatch(r.stdout, /RAN/);
});
