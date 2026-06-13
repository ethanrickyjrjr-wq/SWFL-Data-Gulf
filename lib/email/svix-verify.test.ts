import { test, expect } from "bun:test";
import { createHmac } from "node:crypto";
import { verifySvixSignature } from "./svix-verify";

// Build a valid signature the way Svix does, so the test is self-contained.
function sign(secret: string, id: string, ts: string, payload: string): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const sig = createHmac("sha256", key).update(`${id}.${ts}.${payload}`).digest("base64");
  return `v1,${sig}`;
}

const SECRET = "whsec_" + Buffer.from("super-secret-key").toString("base64");
const NOW = 1_700_000_000_000;
const TS = String(Math.floor(NOW / 1000));
const PAYLOAD = JSON.stringify({ type: "email.received", data: { email_id: "abc" } });
const ID = "msg_123";

test("accepts a correctly signed payload", () => {
  const signature = sign(SECRET, ID, TS, PAYLOAD);
  expect(verifySvixSignature(SECRET, PAYLOAD, { id: ID, timestamp: TS, signature }, NOW)).toBe(
    true,
  );
});

test("accepts when one of several space-delimited signatures matches", () => {
  const good = sign(SECRET, ID, TS, PAYLOAD);
  const signature = `v1,deadbeef ${good}`;
  expect(verifySvixSignature(SECRET, PAYLOAD, { id: ID, timestamp: TS, signature }, NOW)).toBe(
    true,
  );
});

test("rejects a tampered payload", () => {
  const signature = sign(SECRET, ID, TS, PAYLOAD);
  expect(
    verifySvixSignature(SECRET, PAYLOAD + "x", { id: ID, timestamp: TS, signature }, NOW),
  ).toBe(false);
});

test("rejects a wrong secret", () => {
  const signature = sign(SECRET, ID, TS, PAYLOAD);
  const other = "whsec_" + Buffer.from("different-key").toString("base64");
  expect(verifySvixSignature(other, PAYLOAD, { id: ID, timestamp: TS, signature }, NOW)).toBe(
    false,
  );
});

test("rejects a stale timestamp (replay guard)", () => {
  const signature = sign(SECRET, ID, TS, PAYLOAD);
  const muchLater = NOW + 10 * 60 * 1000; // 10 min later, tolerance is 5
  expect(
    verifySvixSignature(SECRET, PAYLOAD, { id: ID, timestamp: TS, signature }, muchLater),
  ).toBe(false);
});

test("rejects missing headers", () => {
  expect(
    verifySvixSignature(SECRET, PAYLOAD, { id: ID, timestamp: TS, signature: null }, NOW),
  ).toBe(false);
});
