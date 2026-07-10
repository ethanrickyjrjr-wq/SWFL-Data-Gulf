import { describe, expect, it } from "bun:test";
import { corridorBakeFacts, corridorBakeContext } from "./corridor-inputs";
import type { CorridorNormalized } from "../../refinery/sources/cre-source.mts";

const c = {
  kind: "corridor",
  name: "US 41 Fort Myers",
  display_name: "US 41 — Fort Myers",
  city: "Fort Myers",
  county: "Lee",
  corridor_type: "retail-strip",
  metrics_period: "2026-Q2",
  cap_rate_pct: 6.2,
  cap_rate_direction: null,
  cap_rate_source_url: "https://x.example/cap",
  vacancy_rate_pct: null,
  vacancy_rate_direction: null,
  vacancy_rate_source_url: null,
  absorption_sqft: null,
  absorption_sqft_direction: null,
  absorption_sqft_source_url: null,
  asking_rent_psf: 27.51,
  asking_rent_psf_direction: null,
  asking_rent_psf_source_url: null,
  character_facts: "Anchored by big-box retail [internal-1].\n\nVacancy tightened in 2025 [web-2].",
  flags: [{ flag: "New Publix under construction", status: "active", type: "development" }],
} as unknown as CorridorNormalized;

describe("corridorBakeFacts", () => {
  it("maps metric rows to facts with display strings and a named source", () => {
    const facts = corridorBakeFacts(c);
    expect(facts.map((f) => f.label)).toEqual(["Cap rate", "Asking rent (NNN)"]);
    expect(facts[0].display).toBe("6.2%");
    expect(facts[1].display).toBe("$27.51/sf");
    for (const f of facts) expect(f.source.length).toBeGreaterThan(0);
  });
  it("carries the metrics period as the fact sub-line", () => {
    expect(corridorBakeFacts(c)[0].sub).toBe("period: 2026-Q2");
  });
});

describe("corridorBakeContext", () => {
  it("strips citation tokens and folds in active-intel flags", () => {
    const ctx = corridorBakeContext(c);
    expect(ctx.join(" ")).not.toMatch(/\[(?:internal|web)-\d+\]/);
    expect(ctx.some((l) => l.includes("Publix"))).toBe(true);
  });
  it("is empty when the corridor has neither character facts nor flags", () => {
    expect(
      corridorBakeContext({ ...c, character_facts: null, flags: [] } as CorridorNormalized),
    ).toEqual([]);
  });
});
