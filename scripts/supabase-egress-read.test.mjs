// Unit tests for supabase-egress-read.mjs. No network, no env, no token.
// Run: node --test scripts/supabase-egress-read.test.mjs
//
// Named for the failure mode each prevents. The governing failure: on 07/21/2026
// two sessions each reported an "egress" number, neither had read the bill, and
// the operator got days of apparent contradiction.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TOKEN_ENV,
  REQUIRED_SCOPE,
  buildLogsUrl,
  explainBlocked,
  canReadEgress,
  sumBytes,
  humanBytes,
} from "./supabase-egress-read.mjs";

// --- The verified vendor contract must not drift silently -------------------

test("contract — url matches the spec path and encodes all three query params", () => {
  const url = buildLogsUrl({
    ref: "abc123",
    sql: "select count(*) from edge_logs",
    since: "2026-07-20T00:00:00Z",
    until: "2026-07-21T00:00:00Z",
  });
  assert.ok(
    url.startsWith("https://api.supabase.com/v1/projects/abc123/analytics/endpoints/logs.all"),
  );
  assert.match(url, /sql=select\+count/);
  assert.match(url, /iso_timestamp_start=2026-07-20T00%3A00%3A00Z/);
  assert.match(url, /iso_timestamp_end=2026-07-21T00%3A00%3A00Z/);
});

test("contract — a missing project ref throws rather than building a bad url", () => {
  assert.throws(() => buildLogsUrl({ ref: "", sql: "select 1" }), /ref is required/);
});

// --- FM: "no token" silently becomes "no egress" ----------------------------
// The most dangerous wrong answer available here is a confident zero.

test("FM — absent token is a LOUD refusal naming the token and scope, never a zero", () => {
  const msg = explainBlocked({ token: undefined, ref: "abc123" });
  assert.match(msg, new RegExp(TOKEN_ENV));
  assert.match(msg, new RegExp(REQUIRED_SCOPE));
  assert.match(msg, /NOT zero egress/);
});

test("FM — absent ref is explained separately, not folded into the token error", () => {
  assert.match(explainBlocked({ token: "sbp_x", ref: undefined }), /NO PROJECT REF/);
});

test("FM — with token and ref, nothing blocks", () => {
  assert.equal(explainBlocked({ token: "sbp_x", ref: "abc123" }), null);
});

test("FM — canReadEgress reflects whether the machine can answer at all", () => {
  assert.equal(canReadEgress({}), false);
  assert.equal(canReadEgress({ [TOKEN_ENV]: "sbp_x" }), true);
});

// --- FM: inventing a total from rows that carry no byte column --------------

test("FM — rows with no summable byte column return null (unknown), NOT 0", () => {
  assert.equal(sumBytes([{ path: "/a" }, { path: "/b" }]), null);
});

test("FM — an empty result set is unknown, not zero", () => {
  assert.equal(sumBytes([]), null);
  assert.equal(sumBytes(undefined), null);
});

test("sumBytes — sums numeric and numeric-string byte columns", () => {
  assert.equal(sumBytes([{ bytes: 100 }, { bytes: "250" }, { bytes: null }]), 350);
});

test("humanBytes — unknown stays unknown; scales without locale surprises", () => {
  assert.equal(humanBytes(null), "unknown");
  assert.equal(humanBytes(999), "999 B");
  assert.equal(humanBytes(1000), "1.0 kB");
  assert.equal(humanBytes(300_000_000_000), "300 GB");
});
