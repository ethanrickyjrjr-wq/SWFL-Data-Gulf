// check-claim-read.test.mjs — pure-helper proof for THE BAR's Stop gate.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  claimPaths,
  openedPaths,
  wasOpened,
  unopenedClaims,
  readTranscript,
} from "./check-claim-read.mjs";

test("a claim sentence naming a code path is caught", () => {
  const t =
    "The chrome sweeps every stats block through lib/deliverable/cell-policy.ts before layout.";
  assert.deepEqual(claimPaths(t), ["lib/deliverable/cell-policy.ts"]);
});

test("a hedged sentence is honest without a read — not caught", () => {
  assert.deepEqual(claimPaths("I have not read lib/email/voice-guard.ts yet."), []);
  assert.deepEqual(claimPaths("Next step: wire it into lib/email/lifecycle-chrome.ts."), []);
  assert.deepEqual(claimPaths("I'll update lib/social/engagement.ts to poll hourly."), []);
});

test("a mention with no claim verb is not caught", () => {
  assert.deepEqual(claimPaths("See also lib/email/voice-guard.ts and the playbook."), []);
});

test("paths inside code fences are commands, not claims", () => {
  const t = "Run this:\n```\nbun test lib/deliverable/cell-policy.test.ts\n```\nDone.";
  assert.deepEqual(claimPaths(t), []);
});

test("doc paths are out of scope — THE BAR is about code", () => {
  assert.deepEqual(claimPaths("The playbook docs/standards/emails.md governs every build."), []);
});

test("openedPaths credits Read/Edit/Write and Serena symbol reads, not Grep", () => {
  const calls = [
    {
      name: "Read",
      input: { file_path: "C:\\Users\\e\\dev\\brain-platform\\lib\\deliverable\\cell-policy.ts" },
    },
    { name: "Edit", input: { file_path: "lib/email/lifecycle-chrome.ts" } },
    { name: "mcp__serena__find_symbol", input: { relative_path: "lib/social/engagement.ts" } },
    { name: "Grep", input: { path: "lib/email/voice-guard.ts" } },
  ];
  const opened = openedPaths(calls);
  assert.ok(wasOpened("lib/deliverable/cell-policy.ts", opened));
  assert.ok(wasOpened("lib/email/lifecycle-chrome.ts", opened));
  assert.ok(wasOpened("lib/social/engagement.ts", opened));
  assert.ok(!wasOpened("lib/email/voice-guard.ts", opened));
});

test("unopenedClaims: claimed + opened passes, claimed + never-opened blocks", () => {
  const finalText =
    "lib/deliverable/cell-policy.ts strips the banned family. " +
    "And lib/email/voice-guard.ts rejects Playfair by name.";
  const calls = [{ name: "Read", input: { file_path: "lib/deliverable/cell-policy.ts" } }];
  assert.deepEqual(unopenedClaims(finalText, calls), ["lib/email/voice-guard.ts"]);
});

test("readTranscript returns ALL calls and the LAST assistant text", () => {
  const lines = [
    JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "tool_use", name: "Read", input: { file_path: "lib/a.ts" } }] },
    }),
    JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "text", text: "working…" }] },
    }),
    JSON.stringify({ type: "user", message: { content: [{ type: "text", text: "ok" }] } }),
    JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "text", text: "final answer" }] },
    }),
    "not json at all",
  ];
  const { calls, finalText } = readTranscript(lines);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "Read");
  assert.equal(finalText.trim(), "final answer");
});
