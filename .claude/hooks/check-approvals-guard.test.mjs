// check-approvals-guard.test.mjs — the agent must not be able to mint or tamper with
// approval tokens through the ordinary tool surface. Failure mode: self-approval.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isProtectedWritePath, bashTouchesApprovals } from "./check-approvals-guard.mjs";

test("writes into the approvals dir are protected", () => {
  assert.equal(isProtectedWritePath(".claude/approvals/paid-dispatch.token"), true);
  assert.equal(isProtectedWritePath("C:\\repo\\.claude\\approvals\\x.token"), true);
});

test("the minter and the token lib are protected from agent edits", () => {
  assert.equal(isProtectedWritePath(".claude/hooks/mint-approval-on-prompt.mjs"), true);
  assert.equal(isProtectedWritePath(".claude/hooks/lib/approval-token.mjs"), true);
  assert.equal(isProtectedWritePath(".claude/hooks/check-approvals-guard.mjs"), true);
});

test("their TESTS are not protected — tests stay editable", () => {
  assert.equal(isProtectedWritePath(".claude/hooks/lib/approval-token.test.mjs"), false);
  assert.equal(isProtectedWritePath(".claude/hooks/mint-approval-on-prompt.test.mjs"), false);
});

test("ordinary paths pass", () => {
  assert.equal(isProtectedWritePath("lib/email/foo.ts"), false);
  assert.equal(isProtectedWritePath(".claude/hooks/check-prepush-gate.mjs"), false);
});

test("bash that reads or writes the approvals dir is caught", () => {
  assert.equal(bashTouchesApprovals("cat .claude/approvals/paid-dispatch.token"), true);
  assert.equal(bashTouchesApprovals("echo x > .claude/approvals/tdd-write.token"), true);
});

test("bash that executes the minter or lib directly is caught", () => {
  assert.equal(bashTouchesApprovals("node .claude/hooks/mint-approval-on-prompt.mjs"), true);
  assert.equal(
    bashTouchesApprovals("node -e \"import('./.claude/hooks/lib/approval-token.mjs')\""),
    true,
  );
});

test("running the TEST files is allowed — the suite must stay runnable", () => {
  assert.equal(
    bashTouchesApprovals("node --test .claude/hooks/lib/approval-token.test.mjs"),
    false,
  );
  assert.equal(
    bashTouchesApprovals("bun test .claude/hooks/mint-approval-on-prompt.test.mjs"),
    false,
  );
});

test("unrelated commands pass", () => {
  assert.equal(bashTouchesApprovals("git status"), false);
  assert.equal(bashTouchesApprovals("node scripts/check.mjs list"), false);
});
