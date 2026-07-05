// Unit tests for the live-assertion runner. Run: node --test scripts/lib/check-signals.test.mjs
// No network: fetchImpl + rest are injected mocks. Proves each type's pass AND fail path —
// a runner that only ever returned ok:true would be theater.

import { test } from "node:test";
import assert from "node:assert/strict";
import { runSignal } from "./check-signals.mjs";

// --- mock helpers ---
const fakeFetch =
  (status, body = "") =>
  async () => ({
    status,
    text: async () => body,
  });
const throwingFetch = () => {
  throw new Error("ECONNREFUSED");
};
const fakeRest = (rows) => async () => rows;
const throwingRest = () => {
  throw new Error("Supabase 500");
};

// --- http_ok ---
test("http_ok — 200 passes", async () => {
  const r = await runSignal({ type: "http_ok", url: "https://x/y" }, { fetchImpl: fakeFetch(200) });
  assert.equal(r.ok, true);
  assert.equal(r.observed.status, 200);
});

test("http_ok — 404 fails", async () => {
  const r = await runSignal({ type: "http_ok", url: "https://x/y" }, { fetchImpl: fakeFetch(404) });
  assert.equal(r.ok, false);
  assert.match(r.detail, /404/);
});

test("http_ok — expect_status mismatch fails", async () => {
  const r = await runSignal(
    { type: "http_ok", url: "https://x/y", expect_status: 204 },
    { fetchImpl: fakeFetch(200) },
  );
  assert.equal(r.ok, false);
});

test("http_ok — fetch error fails closed, does not throw", async () => {
  const r = await runSignal({ type: "http_ok", url: "https://x/y" }, { fetchImpl: throwingFetch });
  assert.equal(r.ok, false);
  assert.match(r.detail, /fetch failed/);
});

test("http_ok — missing url fails", async () => {
  const r = await runSignal({ type: "http_ok" }, { fetchImpl: fakeFetch(200) });
  assert.equal(r.ok, false);
});

// --- http_body ---
test("http_body — 200 + body contains passes", async () => {
  const r = await runSignal(
    { type: "http_body", url: "https://x", contains: "freshness_token" },
    { fetchImpl: fakeFetch(200, '{"freshness_token":"SWFL-1-v5-20260705"}') },
  );
  assert.equal(r.ok, true);
  assert.equal(r.observed.matched, true);
  assert.ok(r.observed.snippet.includes("freshness_token"));
});

test("http_body — 200 but body missing string fails", async () => {
  const r = await runSignal(
    { type: "http_body", url: "https://x", contains: "freshness_token" },
    { fetchImpl: fakeFetch(200, "no token here") },
  );
  assert.equal(r.ok, false);
  assert.equal(r.observed.matched, false);
});

test("http_body — non-2xx fails even if string present", async () => {
  const r = await runSignal(
    { type: "http_body", url: "https://x", contains: "token" },
    { fetchImpl: fakeFetch(500, "token") },
  );
  assert.equal(r.ok, false);
});

// --- db_row_exists ---
test("db_row_exists — a matching row passes", async () => {
  const r = await runSignal(
    { type: "db_row_exists", table: "deliverables", filter: "id=eq.42" },
    { rest: fakeRest([{ id: 42 }]) },
  );
  assert.equal(r.ok, true);
  assert.equal(r.observed.count, 1);
});

test("db_row_exists — no rows fails", async () => {
  const r = await runSignal(
    { type: "db_row_exists", table: "deliverables", filter: "id=eq.999" },
    { rest: fakeRest([]) },
  );
  assert.equal(r.ok, false);
  assert.equal(r.observed.count, 0);
});

test("db_row_exists — min not met fails", async () => {
  const r = await runSignal(
    { type: "db_row_exists", table: "t", filter: "x=eq.1", min: 2 },
    { rest: fakeRest([{ x: 1 }]) },
  );
  assert.equal(r.ok, false);
});

test("db_row_exists — query error fails closed", async () => {
  const r = await runSignal(
    { type: "db_row_exists", table: "t", filter: "x=eq.1" },
    { rest: throwingRest },
  );
  assert.equal(r.ok, false);
  assert.match(r.detail, /query failed/);
});

test("db_row_exists — schema sets Accept-Profile header", async () => {
  let seen = null;
  const spyRest = async (_path, init) => {
    seen = init;
    return [{ ok: 1 }];
  };
  await runSignal(
    { type: "db_row_exists", table: "city_pulse", filter: "id=gt.0", schema: "data_lake" },
    { rest: spyRest },
  );
  assert.equal(seen.headers["Accept-Profile"], "data_lake");
});

// --- db_fresh (+ table_fresh alias) ---
const NOW = new Date("2026-07-05T12:00:00Z");

test("db_fresh — recent row passes", async () => {
  const r = await runSignal(
    { type: "db_fresh", table: "t", column: "period_end", max_age_days: 55 },
    { rest: fakeRest([{ period_end: "2026-06-30" }]), now: NOW },
  );
  assert.equal(r.ok, true);
  assert.equal(r.observed.age_days, 5);
});

test("db_fresh — stale row fails", async () => {
  const r = await runSignal(
    { type: "db_fresh", table: "t", column: "period_end", max_age_days: 30 },
    { rest: fakeRest([{ period_end: "2026-01-01" }]), now: NOW },
  );
  assert.equal(r.ok, false);
  assert.ok(r.observed.age_days > 30);
});

test("db_fresh — no dated rows fails", async () => {
  const r = await runSignal(
    { type: "db_fresh", table: "t", column: "period_end", max_age_days: 55 },
    { rest: fakeRest([]), now: NOW },
  );
  assert.equal(r.ok, false);
  assert.match(r.detail, /no dated/);
});

test("table_fresh — alias routes to db_fresh", async () => {
  const r = await runSignal(
    { type: "table_fresh", table: "t", column: "run_at", max_age_days: 2 },
    { rest: fakeRest([{ run_at: "2026-07-04T12:00:00Z" }]), now: NOW },
  );
  assert.equal(r.ok, true);
});

// --- workflow_success + unknown ---
test("workflow_success — recognized but not enabled in phase 1", async () => {
  const r = await runSignal({ type: "workflow_success", workflow: "daily.yml" }, {});
  assert.equal(r.ok, false);
  assert.match(r.detail, /not enabled in phase 1/);
});

test("unknown type — fails closed", async () => {
  const r = await runSignal({ type: "banana" }, {});
  assert.equal(r.ok, false);
  assert.match(r.detail, /unknown signal type/);
});

test("no signal at all — fails closed", async () => {
  const r = await runSignal(undefined, {});
  assert.equal(r.ok, false);
});
