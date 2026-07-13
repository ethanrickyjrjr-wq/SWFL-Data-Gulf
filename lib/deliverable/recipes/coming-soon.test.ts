// lib/deliverable/recipes/coming-soon.test.ts
//
// R2 · COMING SOON. The one invariant this recipe exists to hold: THE STREET ADDRESS
// NEVER SHIPS. It is sitting in ctx.facts, and every rendered surface — hero, photo
// alt, subject line, CTA url, prose — is a place it could leak out of.
//
// These tests make ZERO network calls on purpose. buildComingSoon short-circuits its
// three impure lanes when the subject has no price/beds/sqft (loadScarcity guards on
// them, chartSpecToEmailImage is only reached with a scarcity, and
// authorListingNarrative returns null when all three are absent) — so the STRUCTURAL
// suppression and the open-slot contract are asserted deterministically. The model's
// OUTPUT is guarded by redactStreetLine/leaksStreet, which are pure and tested here
// directly against a paragraph that does name the street.

import { describe, expect, test } from "bun:test";
import {
  buildComingSoon,
  countyForZip,
  leaksStreet,
  redactStreetLine,
  scarcityBand,
  scarcityChartSpec,
  scarcityStats,
  usdShort,
  type Scarcity,
} from "./coming-soon";
import { defaultDoc } from "@/lib/email/doc/default-docs";
import { RECIPES } from "@/lib/deliverable/recipes";
import type { RecipeBuildContext } from "./index";
import type { EmailDoc } from "@/lib/email/doc/types";
import type { ListingFacts } from "@/lib/email/listing-scrape";

const SUBJECT = "326 Shore Dr, Fort Myers, FL 33905";

/** Every string a recipient could ever read, flattened out of a built doc. */
function allText(doc: EmailDoc): string {
  const out: string[] = [...(doc.subjectVariants ?? []), ...(doc.ctaVariants ?? [])];
  const walk = (v: unknown): void => {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  doc.blocks.forEach((b) => walk(b.props));
  return out.join("\n");
}

function ctxFor(facts: Partial<ListingFacts>): RecipeBuildContext {
  return {
    recipe: RECIPES["coming-soon"],
    prompt: `Build a coming-soon teaser email for my listing at ${SUBJECT} — hold the street address back.`,
    currentDoc: defaultDoc(),
    facts: { photos: [], sourceUrl: "https://www.swfldatagulf.com", ...facts } as ListingFacts,
    resolved: true,
  };
}

// The address-bearing subject, WITHOUT the price/beds/sqft that would fire the live
// lanes. Everything the suppression has to defend against is still present.
const TEASER_CTX = ctxFor({
  address: SUBJECT,
  city: "Fort Myers",
  state: "FL",
  zip: "33905",
  photos: ["https://example.com/hero.jpg"],
});

describe("the street address never ships", () => {
  test("no rendered field carries the street line, the street name, or the house number", async () => {
    const doc = await buildComingSoon(TEASER_CTX);
    expect(doc).not.toBeNull();
    const text = allText(doc!);

    expect(text).not.toContain("326 Shore Dr");
    expect(text).not.toContain("Shore");
    expect(text).not.toMatch(/\b326\b/);
    // The ZIP is the finest-grain token of the address — the county is what ships,
    // never the ZIP. (The city DOES ship, by design: a teaser has to say roughly where.)
    expect(text).not.toContain("33905");
    // The full resolved address, in any casing.
    expect(text.toLowerCase()).not.toContain(SUBJECT.toLowerCase());
  });

  test("the photo alt text says the city, never the address (it is read aloud and shown when images are blocked)", async () => {
    const doc = await buildComingSoon(TEASER_CTX);
    const img = doc!.blocks.find((b) => b.type === "image" && b.props.kind === "photo");
    expect(img).toBeDefined();
    const alt = (img!.props as { alt?: string }).alt ?? "";
    expect(alt).toBe("Coming soon — a home in Fort Myers");
    expect(alt).not.toContain("Shore");
  });

  test("the hero is Coming Soon + the city — never the street", async () => {
    const doc = await buildComingSoon(TEASER_CTX);
    const hero = doc!.blocks.find((b) => b.type === "hero");
    const p = hero!.props as { kicker?: string; label?: string };
    expect(p.kicker).toBe("Coming Soon");
    expect(p.label).toBe("Fort Myers, FL");
  });

  test("the subject line is a teaser with no street in it", async () => {
    const doc = await buildComingSoon(TEASER_CTX);
    expect(doc!.subjectVariants?.[0]).toBe("Coming soon in Fort Myers — before it hits the market");
  });

  test("the CTA is the private-preview list and its url carries no address", async () => {
    const doc = await buildComingSoon(TEASER_CTX);
    const btn = doc!.blocks.find((b) => b.type === "button");
    const p = btn!.props as { label?: string; url?: string };
    expect(p.label).toBe("Join the Private Preview List");
    expect(p.url ?? "").not.toContain("326");
    expect((p.url ?? "").toLowerCase()).not.toContain("shore");
  });
});

describe("redactStreetLine / leaksStreet — the guard on the MODEL's output", () => {
  test("strips the full street line", () => {
    const out = redactStreetLine(
      "Set on a quiet stretch of 326 Shore Dr, the home is large.",
      SUBJECT,
    );
    expect(out).not.toContain("326");
    expect(out).not.toContain("Shore");
    expect(leaksStreet(out, SUBJECT)).toBe(false);
  });

  test("strips the street name under ANY suffix spelling (Dr / Drive)", () => {
    expect(redactStreetLine("A rare offering on Shore Drive.", SUBJECT)).not.toContain("Shore");
    expect(redactStreetLine("A rare offering on Shore Dr.", SUBJECT)).not.toContain("Shore");
  });

  test("strips the bare house number", () => {
    expect(redactStreetLine("Number 326 is coming to market.", SUBJECT)).not.toMatch(/\b326\b/);
  });

  test("leaksStreet catches what redaction is meant to remove", () => {
    expect(leaksStreet("It sits on Shore Drive.", SUBJECT)).toBe(true);
    expect(leaksStreet("326 is the one.", SUBJECT)).toBe(true);
    expect(leaksStreet("A three-bedroom home with 2,847 square feet.", SUBJECT)).toBe(false);
  });

  test("leaves ordinary prose (and the real figures) alone", () => {
    const prose = "A three-bedroom home of 2,847 square feet, offered at $595,000.";
    expect(redactStreetLine(prose, SUBJECT)).toBe(prose);
  });

  test("a one-digit house number is never stripped (it would maul ordinary prose)", () => {
    expect(redactStreetLine("There are 3 bedrooms.", "3 Oak Ln, Naples, FL 34102")).toContain(
      "3 bedrooms",
    );
  });

  test("no address → nothing to redact, nothing flagged", () => {
    expect(redactStreetLine("Anything at all.", undefined)).toBe("Anything at all.");
    expect(leaksStreet("Anything at all.", undefined)).toBe(false);
  });
});

describe("scarcity — real counts, disclosed criterion, never a zero for a gap", () => {
  test("the band is ±10% of price and 80% of size, floored to a clean 50 sq ft", () => {
    expect(scarcityBand(595000, 2847)).toEqual({
      bandLo: 535500,
      bandHi: 654500,
      sqftFloor: 2250,
    });
  });

  test("usdShort keeps a cell label readable", () => {
    expect(usdShort(535500)).toBe("$536K");
    expect(usdShort(654500)).toBe("$655K");
    expect(usdShort(10_000_000)).toBe("$10M");
  });

  test("countyForZip reads the committed crosswalk (the value listing_state.county actually carries)", () => {
    expect(countyForZip("33905")).toBe("Lee");
    expect(countyForZip("34102")).toBe("Collier");
    expect(countyForZip("90210")).toBeNull();
    expect(countyForZip(undefined)).toBeNull();
  });

  const S: Scarcity = {
    county: "Lee",
    countyHomes: 13122,
    inBand: 1062,
    comparable: 328,
    bandLo: 535500,
    bandHi: 654500,
    bedFloor: 3,
    sqftFloor: 2250,
    asOfIso: "2026-07-13",
  };

  test("the cells restate the real counts and state what is being counted", () => {
    expect(scarcityStats(S)).toEqual([
      { value: "13,122", label: "Active homes · Lee County" },
      { value: "1,062", label: "Priced $536K–$655K" },
      { value: "328", label: "…that also match beds + size" },
    ]);
  });

  test("the chart is a count funnel — never dollar-formatted, and its bar labels survive the 26-char truncation", () => {
    const spec = scarcityChartSpec(S);
    expect(spec.value_format).toBe("number"); // "count" abbreviates 1,062 -> "1k" and contradicts the cells
    expect(spec.chart_type).toBe("bar");
    expect(spec.rows).toEqual([
      ["All active homes", 13122],
      ["In this price range", 1062],
      ["Beds + size match too", 328],
    ]);
    for (const [label] of spec.rows as [string, number][]) {
      expect(label.length).toBeLessThanOrEqual(26); // barChartSvg truncates past this
    }
    // The funnel must actually narrow, or there is no scarcity claim to make.
    const values = (spec.rows as [string, number][]).map(([, v]) => v);
    expect(values[0]).toBeGreaterThan(values[1]);
    expect(values[1]).toBeGreaterThan(values[2]);
  });
});

describe("the open-slot contract — a gap is an invitation, never a zero", () => {
  test("unsourced scarcity leaves three EMPTY cells whose labels are the instruction", async () => {
    const doc = await buildComingSoon(TEASER_CTX); // no price/beds/sqft → no counts
    const stats = doc!.blocks.filter((b) => b.type === "stats");
    expect(stats).toHaveLength(2);
    const scarcityRow = stats[1].props as { stats: { value: string; label: string }[] };
    for (const cell of scarcityRow.stats) {
      expect(cell.value).toBe(""); // an OPEN SLOT — never a 0, never a naked label
      expect(cell.label.length).toBeGreaterThan(0);
    }
    expect(scarcityRow.stats.map((c) => c.label)).toEqual([
      "Active homes in your county — add the count",
      "How many are in this price range",
      "How many match beds + size",
    ]);
  });

  test("no cell anywhere renders a fabricated zero", async () => {
    const doc = await buildComingSoon(TEASER_CTX);
    for (const b of doc!.blocks) {
      if (b.type !== "stats") continue;
      for (const cell of b.props.stats) expect(cell.value).not.toBe("0");
    }
  });

  test("an unresolved chart DROPS the slot — an empty chart box is worse than no chart", async () => {
    const doc = await buildComingSoon(TEASER_CTX);
    const charts = doc!.blocks.filter((b) => b.type === "image" && b.props.kind === "chart");
    expect(charts).toHaveLength(0);
  });

  test("no subject → fall through to the generic author (never a faked house)", async () => {
    const doc = await buildComingSoon({ ...TEASER_CTX, facts: null });
    expect(doc).toBeNull();
  });

  test("an empty photo becomes a dropzone whose label instructs — and still names no street", async () => {
    const doc = await buildComingSoon(
      ctxFor({ address: SUBJECT, city: "Fort Myers", state: "FL" }),
    );
    const img = doc!.blocks.find((b) => b.type === "image" && b.props.kind === "photo");
    const p = img!.props as { url?: string; alt?: string };
    expect(p.url).toBe("");
    expect(p.alt).toContain("Add the teaser photo");
    expect(p.alt).not.toContain("Shore");
  });
});

describe("brand is sticky — a recipe never authors one", () => {
  test("the agent's header, agent card and footer carry through from the canvas", async () => {
    const doc = await buildComingSoon(TEASER_CTX);
    const types = doc!.blocks.map((b) => b.type);
    expect(types).toContain("header");
    expect(types).toContain("agent-card");
    expect(types).toContain("footer");
    expect(types[types.length - 1]).toBe("footer");
  });
});
