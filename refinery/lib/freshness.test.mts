import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LAKE_ID,
  freshnessToken,
  freshnessComment,
  parseFreshnessComment,
} from "./freshness.mts";

test("LAKE_ID is the fixed SWFL constant", () => {
  assert.equal(LAKE_ID, "7421");
});

test("freshnessToken builds SWFL-7421-v{n}-{YYYYMMDD}", () => {
  assert.equal(
    freshnessToken(4, "2026-05-14T19:21:08Z"),
    "SWFL-7421-v4-20260514",
  );
  assert.equal(
    freshnessToken(2, "2026-05-14T11:44:04Z"),
    "SWFL-7421-v2-20260514",
  );
});

test("freshnessComment wraps the token", () => {
  assert.equal(
    freshnessComment(4, "SWFL-7421-v4-20260514"),
    "<!-- FRESHNESS: v4 | Token: SWFL-7421-v4-20260514 -->",
  );
});

test("parseFreshnessComment reads a well-formed comment", () => {
  assert.deepEqual(
    parseFreshnessComment(
      "<!-- FRESHNESS: v4 | Token: SWFL-7421-v4-20260514 -->",
    ),
    { version: 4, token: "SWFL-7421-v4-20260514" },
  );
});

test("parseFreshnessComment returns null on malformed input", () => {
  assert.equal(parseFreshnessComment(""), null);
  assert.equal(parseFreshnessComment("not a comment"), null);
  assert.equal(parseFreshnessComment("<!-- something else -->"), null);
  assert.equal(parseFreshnessComment("<!-- FRESHNESS: 4 | Token: x -->"), null);
  assert.equal(parseFreshnessComment("FRESHNESS: v4 | Token: x"), null);
});

test("round-trip: parse(comment(token)) recovers version and token", () => {
  for (const [v, ts] of [
    [4, "2026-05-14T19:21:08Z"],
    [5, "2026-05-14T19:21:06Z"],
    [2, "2026-05-14T11:44:04Z"],
    [3, "2026-05-14T04:00:00Z"],
  ] as const) {
    const token = freshnessToken(v, ts);
    const parsed = parseFreshnessComment(freshnessComment(v, token));
    assert.deepEqual(parsed, { version: v, token });
  }
});
