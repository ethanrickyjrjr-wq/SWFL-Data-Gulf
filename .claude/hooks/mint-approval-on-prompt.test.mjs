// mint-approval-on-prompt.test.mjs — a token is minted ONLY from a strict, whole-prompt
// approval phrase. Loose matching = accidental approvals; that is the failure mode.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseApprovalPhrase } from "./mint-approval-on-prompt.mjs";

test("plain approval phrase mints its gate", () => {
  assert.equal(parseApprovalPhrase("approve paid-dispatch"), "paid-dispatch");
});

test("case and trailing punctuation are tolerated, gate is normalized", () => {
  assert.equal(parseApprovalPhrase("  Approve TDD-WRITE! "), "tdd-write");
});

test("the word approve inside a sentence mints NOTHING", () => {
  assert.equal(parseApprovalPhrase("I approve paid-dispatch"), null);
  assert.equal(parseApprovalPhrase("please approve the plan"), null);
  assert.equal(parseApprovalPhrase("can you approve paid-dispatch for me"), null);
});

test("short aliases mint their full gate — operator types 2 letters, not 13", () => {
  assert.equal(parseApprovalPhrase("approve pd"), "paid-dispatch");
  assert.equal(parseApprovalPhrase("approve tw"), "tdd-write");
  assert.equal(parseApprovalPhrase("approve ge"), "guard-edit");
  assert.equal(parseApprovalPhrase("Approve PD!"), "paid-dispatch");
});

test("bare approve mints the wildcard gate for whichever gate asks next", () => {
  assert.equal(parseApprovalPhrase("approve"), "any");
  assert.equal(parseApprovalPhrase("  Approve.  "), "any");
});

test("multi-line prompts never mint — the phrase must be the whole message", () => {
  assert.equal(parseApprovalPhrase("approve paid-dispatch\nand also do X"), null);
});

test("non-string / empty input is safe", () => {
  assert.equal(parseApprovalPhrase(""), null);
  assert.equal(parseApprovalPhrase(undefined), null);
});
