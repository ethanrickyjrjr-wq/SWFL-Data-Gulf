// lib/deliverable/recipes/community-info.test.ts
//
// TDD guards for the community-info recipe — one test per named failure mode
// (docs/superpowers/specs/2026-08-03-community-info-email-design.md). All deps are
// injected; nothing here touches the network or the lake.
import { describe, it, expect } from "bun:test";
import {
  buildCommunityInfo,
  matchNeighborhoodName,
  type CommunityNeighborhood,
} from "./community-info";
import { RECIPES } from "@/lib/deliverable/recipes";
import { seedById, SEED_DOCS } from "@/lib/email/doc/default-docs";
import type { RecipeBuildContext } from "./index";
import type { EmailDoc, StatItem } from "@/lib/email/doc/types";

const NORTH_NAPLES: CommunityNeighborhood = {
  slugId: "North-Naples_Naples_FL",
  name: "North Naples",
  city: "Naples",
  scores: [
    { label: "Walking", text: "Few day-to-day needs are within walking distance", value: 3 },
    {
      label: "Restaurants",
      text: "Variety of restaurants within a short drive",
      value: 4.8,
    },
    { label: "Quiet", text: "Virtually no sources of noise nearby", value: 8.1 },
  ],
  asOf: "2026-08-01",
};

function ctxFor(prompt: string): RecipeBuildContext {
  return {
    recipe: RECIPES["community-info"],
    prompt,
    currentDoc: (seedById("luxury-market-report") ?? SEED_DOCS[0]!).build(),
    facts: null,
    resolved: false,
  };
}

function statCells(doc: EmailDoc): StatItem[] {
  return doc.blocks
    .filter((b) => b.type === "stats")
    .flatMap((b) => (b.props.stats as StatItem[] | undefined) ?? []);
}

describe("community-info recipe", () => {
  it("FM1: unmatched area returns the open-slot grid, never null", async () => {
    const doc = await buildCommunityInfo(ctxFor("Build a community-info email for Atlantis"), {
      findNeighborhood: async () => null,
      loadAmenityCounts: async () => [],
    });
    expect(doc).not.toBeNull();
    const cells = statCells(doc!);
    expect(cells.length).toBeGreaterThan(0);
    // Every cell is an OPEN SLOT: empty value, instruction label. Never a guessed figure.
    for (const c of cells) {
      expect(c.value ?? "").toBe("");
      expect((c.label ?? "").length).toBeGreaterThan(0);
    }
  });

  it("FM1b: never a nearest-guess — ambiguous name matches nothing", () => {
    const names = [
      { slugId: "a", name: "Palmetto", city: "Naples" },
      { slugId: "b", name: "Palmetto", city: "Cape Coral" },
    ];
    expect(matchNeighborhoodName("community info for Palmetto please", names)).toBeNull();
    // City-qualified prompt disambiguates.
    expect(matchNeighborhoodName("Palmetto in Cape Coral", names)?.slugId).toBe("b");
  });

  it("FM2: sparse amenities — only counted categories render, never a zero cell", async () => {
    const doc = await buildCommunityInfo(ctxFor("community info for North Naples"), {
      findNeighborhood: async () => NORTH_NAPLES,
      loadAmenityCounts: async () => [{ category: "restaurants", count: 3 }],
    });
    const cells = statCells(doc!);
    const values = cells.map((c) => c.value ?? "");
    expect(values).toContain("3");
    expect(values).not.toContain("0");
    // No cell claims a category the fixture didn't carry.
    const labels = cells.map((c) => (c.label ?? "").toLowerCase()).join(" | ");
    expect(labels).not.toContain("grocery");
  });

  it("FM3: the vendor's name appears nowhere; the citation is realtor.com", async () => {
    const doc = await buildCommunityInfo(ctxFor("community info for North Naples"), {
      findNeighborhood: async () => NORTH_NAPLES,
      loadAmenityCounts: async () => [{ category: "restaurants", count: 3 }],
    });
    const raw = JSON.stringify(doc);
    expect(raw).not.toMatch(/steadyapi/i);
    expect(raw).toContain("realtor.com");
  });

  it("FM4: provenance carries the ROW's as-of date MM/DD/YYYY, not the build date", async () => {
    const doc = await buildCommunityInfo(ctxFor("community info for North Naples"), {
      findNeighborhood: async () => NORTH_NAPLES,
      loadAmenityCounts: async () => [{ category: "restaurants", count: 3 }],
    });
    const raw = JSON.stringify(doc);
    expect(raw).toContain("08/01/2026");
  });

  it("matched build: the neighborhood leads and the vendor's own sentences are the prose", async () => {
    const doc = await buildCommunityInfo(ctxFor("community info for North Naples"), {
      findNeighborhood: async () => NORTH_NAPLES,
      loadAmenityCounts: async () => [{ category: "restaurants", count: 3 }],
    });
    const raw = JSON.stringify(doc);
    expect(raw).toContain("North Naples");
    // Deterministic narrative composed from the vendor's own score sentences.
    expect(raw).toContain("Variety of restaurants within a short drive");
  });
});
