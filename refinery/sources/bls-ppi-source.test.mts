import { test } from "bun:test";
import assert from "node:assert/strict";

// Set fixture mode before any source import so env.source resolves correctly.
process.env["REFINERY_SOURCE"] = "fixture";

const { blsPpiSource } = await import("./bls-ppi-source.mts");

test("fixture mode returns 12 fragments (one per scoped series)", async () => {
  const fragments = await blsPpiSource.fetch();
  assert.equal(fragments.length, 12);
});

test("every fragment has kind = bls-ppi-index", async () => {
  const fragments = await blsPpiSource.fetch();
  for (const f of fragments) {
    const n = f.normalized as { kind: string };
    assert.equal(n.kind, "bls-ppi-index");
  }
});

test("236211 (industrial) resolves to latest value 205 with rising direction", async () => {
  const fragments = await blsPpiSource.fetch();
  const n = fragments.find(
    (f) => (f.normalized as { series_id: string }).series_id === "PCU236211236211",
  )!.normalized as { value: number; direction: string; period: string };
  assert.equal(n.value, 205);
  assert.equal(n.direction, "rising");
  assert.equal(n.period, "2026-06");
});

test("236221 (warehouse) resolves to latest value 205 with falling direction", async () => {
  const fragments = await blsPpiSource.fetch();
  const n = fragments.find(
    (f) => (f.normalized as { series_id: string }).series_id === "PCU236221236221",
  )!.normalized as { value: number; direction: string };
  assert.equal(n.value, 205);
  assert.equal(n.direction, "falling");
});

test("236223 (office) resolves to stable direction under the 2% threshold", async () => {
  const fragments = await blsPpiSource.fetch();
  const n = fragments.find(
    (f) => (f.normalized as { series_id: string }).series_id === "PCU236223236223",
  )!.normalized as { direction: string };
  assert.equal(n.direction, "stable");
});

test("236222 (school, single-row series) still normalizes with stable direction (< 2 observations)", async () => {
  const fragments = await blsPpiSource.fetch();
  const n = fragments.find(
    (f) => (f.normalized as { series_id: string }).series_id === "PCU236222236222",
  )!.normalized as { value: number; direction: string };
  assert.equal(n.value, 198);
  assert.equal(n.direction, "stable");
});

test("fragment_ids are unique", async () => {
  const fragments = await blsPpiSource.fetch();
  const ids = fragments.map((f) => f.fragment_id);
  assert.equal(new Set(ids).size, ids.length);
});

test("citationMeta returns source naming BLS PPI", () => {
  const meta = blsPpiSource.citationMeta("2026-07-17", 2592000);
  assert.ok(meta.source.includes("BLS Producer Price Index"));
  assert.equal(typeof meta.verified, "string");
  assert.equal(typeof meta.expires, "string");
});
