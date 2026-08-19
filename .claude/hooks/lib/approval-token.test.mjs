// approval-token.test.mjs — the token is single-use, human-minted, and expires.
// Each test is named for the failure mode it prevents (RULE 3.5).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mintToken, consumeToken } from "./approval-token.mjs";

const dir = () => mkdtempSync(join(tmpdir(), "approvals-"));

test("consume without a mint is refused — no ambient approval", () => {
  const d = dir();
  const r = consumeToken("paid-dispatch", { dir: d });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "missing");
});

test("mint then consume opens exactly once", () => {
  const d = dir();
  mintToken("paid-dispatch", { dir: d });
  const first = consumeToken("paid-dispatch", { dir: d });
  assert.equal(first.ok, true);
  const second = consumeToken("paid-dispatch", { dir: d });
  assert.equal(second.ok, false, "a token must never open two gates");
  assert.equal(second.reason, "missing");
});

test("consumed token leaves no claimable file behind", () => {
  const d = dir();
  mintToken("tdd-write", { dir: d });
  consumeToken("tdd-write", { dir: d });
  const leftovers = readdirSync(d).filter((f) => f.endsWith(".token"));
  assert.deepEqual(leftovers, []);
});

test("an expired token is refused — stale approval never carries", () => {
  const d = dir();
  const t0 = Date.now();
  mintToken("paid-dispatch", { dir: d, now: t0 });
  const r = consumeToken("paid-dispatch", { dir: d, now: t0 + 31 * 60_000 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "expired");
});

test("within TTL the token is honored", () => {
  const d = dir();
  const t0 = Date.now();
  mintToken("paid-dispatch", { dir: d, now: t0 });
  const r = consumeToken("paid-dispatch", { dir: d, now: t0 + 5 * 60_000 });
  assert.equal(r.ok, true);
});

test("mint and consume both leave audit lines — refusals are on the record", () => {
  const d = dir();
  mintToken("paid-dispatch", { dir: d });
  consumeToken("paid-dispatch", { dir: d });
  consumeToken("paid-dispatch", { dir: d }); // refused — must also be logged
  assert.ok(existsSync(join(d, "audit.log")));
  const lines = readFileSync(join(d, "audit.log"), "utf8").trim().split("\n");
  const events = lines.map((l) => JSON.parse(l).event);
  assert.ok(events.includes("mint"));
  assert.ok(events.includes("consume"));
  assert.ok(events.includes("refused"));
});
