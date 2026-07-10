// scripts/outreach/pilot-lib.test.mts
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { validateFixture } from "@/lib/email/outreach/brand-fixtures";
import { mapToCandidateFixture, slugFromDomain, type BrandfetchBrand } from "./pilot-lib";

const SAMPLE_PATH = join(import.meta.dir, "__fixtures__", "brandfetch-sample.json");
const hasSample = existsSync(SAMPLE_PATH);

// Minimal synthetic payload matching the vendor-verified skeleton (07/10/2026) —
// the REAL probe fixture replaces the load-bearing assertions once brandfetch_key lands.
const SYNTHETIC: BrandfetchBrand = {
  name: "Test Brokerage",
  domain: "testbrokerage.com",
  logos: [{ formats: [{ src: "https://cdn.example/logo.svg", background: "transparent" }] }],
  colors: [{ hex: "#123456" }, { hex: "#ABCDEF" }],
  fonts: [{ name: "Inter" }],
  qualityScore: 0.9,
};

describe("slugFromDomain", () => {
  test("kebab-cases the registrable name", () => {
    expect(slugFromDomain("JohnRWood.com")).toBe("johnrwood");
    expect(slugFromDomain("premier-sothebys.com")).toBe("premier-sothebys");
  });
  test("strips scheme/www/path", () => {
    expect(slugFromDomain("https://www.viprealty.com/agents")).toBe("viprealty");
  });
});

describe("mapToCandidateFixture (synthetic skeleton)", () => {
  test("maps a skeleton payload to a VALID fixture", () => {
    const fx = mapToCandidateFixture(SYNTHETIC, { slug: "test-brokerage" });
    expect(fx).not.toBeNull();
    const v = validateFixture(fx!);
    expect(v.ok).toBe(true);
    expect(fx!.brand.status).toBe("api");
    expect(fx!.brand.confidence).toBeLessThanOrEqual(0.7);
    expect(fx!.brand.palette.primaryColor).toBe("#123456");
    expect(fx!.brand.palette.accentColor).toBe("#ABCDEF");
    expect(fx!.brand.logo_url).toBe("https://cdn.example/logo.svg");
  });
  test("no colors → null (NEVER an invented palette)", () => {
    expect(mapToCandidateFixture({ ...SYNTHETIC, colors: [] }, { slug: "x" })).toBeNull();
  });
  test("api confidence is capped at 0.7 even for a perfect qualityScore", () => {
    const fx = mapToCandidateFixture({ ...SYNTHETIC, qualityScore: 1 }, { slug: "x" });
    expect(fx!.brand.confidence).toBe(0.7);
  });
});

describe("mapToCandidateFixture (REAL probe payload)", () => {
  // Pinned against the committed quota-free probe of brandfetch.com's own brand.
  // Skips (loudly, as a skip count) until scripts/outreach/__fixtures__/brandfetch-sample.json
  // is captured — Task 4 Step 1 of docs/superpowers/plans/2026-07-10-outreach-brand-injection.md.
  test.skipIf(!hasSample)("maps the real probe payload to a VALID fixture", () => {
    const sample = JSON.parse(readFileSync(SAMPLE_PATH, "utf8")) as BrandfetchBrand;
    const fx = mapToCandidateFixture(sample, { slug: "brandfetch" });
    expect(fx).not.toBeNull();
    const v = validateFixture(fx!);
    expect(v.ok).toBe(true);
    expect(fx!.brand.confidence).toBeLessThanOrEqual(0.7);
    expect(fx!.brand.source_url).toContain("brandfetch");
    expect(fx!.brand.palette.primaryColor).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});
