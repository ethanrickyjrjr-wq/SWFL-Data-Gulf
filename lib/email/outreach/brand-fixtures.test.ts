// lib/email/outreach/brand-fixtures.test.ts
import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBrandFixtures, validateFixture } from "./brand-fixtures";

const GOOD = {
  slug: "test-realty",
  company_name: "Test Realty",
  domain: "testrealty.com",
  brand: {
    status: "crawled",
    palette: { primaryColor: "#219653", accentColor: "#FFCA00" },
    confidence: 0.85,
    logo_url: "https://testrealty.com/logo.png",
    source_url: "https://testrealty.com",
  },
};

async function writeDir(files: Record<string, unknown>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "brand-fx-"));
  const index = {
    brokerages: Object.keys(files)
      .filter((f) => f.endsWith(".json") && f !== "index.json")
      .map((f) => ({ slug: f.replace(/\.json$/, ""), file: f })),
  };
  await writeFile(join(dir, "index.json"), JSON.stringify(index));
  for (const [name, body] of Object.entries(files)) {
    await writeFile(join(dir, name), typeof body === "string" ? body : JSON.stringify(body));
  }
  return dir;
}

describe("validateFixture", () => {
  test("accepts the gold-standard shape", () => {
    const r = validateFixture(GOOD);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.fixture.slug).toBe("test-realty");
  });
  test("rejects a bad hex", () => {
    const bad = structuredClone(GOOD);
    bad.brand.palette.primaryColor = "green";
    expect(validateFixture(bad).ok).toBe(false);
  });
  test("rejects out-of-range confidence", () => {
    const bad = structuredClone(GOOD);
    bad.brand.confidence = 1.5;
    expect(validateFixture(bad).ok).toBe(false);
  });
  test("rejects a missing palette", () => {
    expect(
      validateFixture({ slug: "x", company_name: "X", brand: { status: "api", confidence: 0.5 } })
        .ok,
    ).toBe(false);
  });
});

describe("loadBrandFixtures", () => {
  test("loads valid fixtures listed in index.json", async () => {
    const dir = await writeDir({ "test-realty.json": GOOD });
    const { fixtures, skipped } = await loadBrandFixtures(dir);
    expect(fixtures.length).toBe(1);
    expect(fixtures[0]!.domain).toBe("testrealty.com");
    expect(skipped.length).toBe(0);
  });
  test("skips malformed files loudly, loads the rest", async () => {
    const dir = await writeDir({ "test-realty.json": GOOD, "broken.json": "{not json" });
    const { fixtures, skipped } = await loadBrandFixtures(dir);
    expect(fixtures.length).toBe(1);
    expect(skipped.length).toBe(1);
    expect(skipped[0]!.file).toBe("broken.json");
  });
  test("missing index.json → empty result, no throw", async () => {
    const dir = await mkdtemp(join(tmpdir(), "brand-fx-empty-"));
    const { fixtures, skipped } = await loadBrandFixtures(dir);
    expect(fixtures).toEqual([]);
    expect(skipped.length).toBe(1); // index.json itself reported
  });
  test("loads the REAL repo folder without errors", async () => {
    const { fixtures, skipped } = await loadBrandFixtures("fixtures/real-estate-brands");
    expect(fixtures.length).toBeGreaterThanOrEqual(25);
    expect(
      skipped.filter(
        (s) => s.file !== "agents.json" && s.file !== "dbpr-all-corps-lee-collier.json",
      ).length,
    ).toBe(0);
  });
});
