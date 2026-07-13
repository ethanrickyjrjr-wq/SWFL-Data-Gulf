// lib/deliverable/recipes/coming-soon.test.ts
//
// R2 · COMING SOON. The one invariant this recipe exists to hold: THE STREET ADDRESS
// NEVER SHIPS. It is sitting in ctx.facts, and every rendered surface — hero, photo
// alt, subject line, CTA url, prose — is a place it could leak out of.
//
// 07/13/2026 — the recipe now wears the CAMPAIGN CHROME (lib/email/lifecycle-chrome.ts),
// so the layout assertions below moved with it: the hero is now TWO blocks (the accent
// RIBBON, then the centred subject hero whose LABEL rides above the price), and the
// scarcity counts are a hairline STRIP rather than a second chunky stat grid. The
// suppression did not move an inch — and the chrome added one new surface to defend,
// the photo DROPZONE, whose alt text the chrome derives from the hero label. That is
// exactly why the hero label is the CITY.
//
// These tests make ZERO network calls on purpose. buildComingSoon short-circuits its
// three impure lanes when the subject has no price/beds/sqft (loadScarcity guards on
// them, chartSpecToEmailImage is only reached with a scarcity, and
// authorListingNarrative is only reached with pasted remarks) — so the STRUCTURAL
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
  teaserSpecs,
  teaserWhere,
  usdShort,
  type Scarcity,
} from "./coming-soon";
import { defaultDoc } from "@/lib/email/doc/default-docs";
import { RECIPES } from "@/lib/deliverable/recipes";
import type { RecipeBuildContext } from "./index";
import type { EmailBlock, EmailDoc } from "@/lib/email/doc/types";
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

/** The doc's blocks in RENDER order (the chrome positions on the grid, not the array). */
function ordered(doc: EmailDoc): EmailBlock[] {
  return [...doc.blocks].sort((a, b) => (a.layout?.y ?? 0) - (b.layout?.y ?? 0));
}

/** The accent RIBBON — the campaign's spine, and the one block that says WHICH email. */
function ribbonOf(doc: EmailDoc) {
  return doc.blocks.find((b) => b.type === "hero" && b.props.ribbon);
}

/** The SUBJECT hero — the centred block whose LABEL rides above the PRICE. On every other
 *  lifecycle email that label is the street address. On this one it is the city. */
function subjectHeroOf(doc: EmailDoc) {
  return doc.blocks.find((b) => b.type === "hero" && !b.props.ribbon);
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

  test("the RIBBON says which email this is, and the centred hero is the CITY over the price — never the street", async () => {
    const doc = await buildComingSoon(TEASER_CTX);

    const ribbon = ribbonOf(doc!);
    expect(ribbon, "the accent ribbon is the campaign's spine").toBeDefined();
    expect((ribbon!.props as { kicker?: string }).kicker).toBe("Coming Soon");

    // THE ONE SUBSTITUTION THAT IS THIS DELIVERABLE. The chrome prints heroLabel above
    // the price; New Listing hands it the street address. This one hands it a city.
    const hero = subjectHeroOf(doc!);
    const p = hero!.props as { label?: string; order?: string; align?: string };
    expect(p.label).toBe("Fort Myers, FL");
    expect(p.label).not.toContain("Shore");
    expect(p.order, "label over value — the campaign's centred hero").toBe("label-first");
    expect(p.align).toBe("center");
  });

  test("teaserWhere is the city, and falls back to the region — never to the street", () => {
    expect(teaserWhere({ city: "Naples", state: "FL" } as ListingFacts)).toBe("Naples, FL");
    expect(teaserWhere({ city: "Cape Coral" } as ListingFacts)).toBe("Cape Coral, FL");
    expect(teaserWhere({ address: SUBJECT } as ListingFacts)).toBe("Southwest Florida");
  });

  test("the subject line is a teaser with no street in it", async () => {
    const doc = await buildComingSoon(TEASER_CTX);
    expect(doc!.subjectVariants?.[0]).toBe("Coming soon in Fort Myers — before it hits the market");
  });

  test("the CTA asks for the NEXT ACTION, and its url carries no address", async () => {
    const doc = await buildComingSoon(TEASER_CTX);
    const btn = doc!.blocks.find((b) => b.type === "button");
    const p = btn!.props as { label?: string; url?: string };
    expect(p.label).toBe("Join the Private Preview List");
    expect(p.url ?? "").not.toContain("326");
    expect((p.url ?? "").toLowerCase()).not.toContain("shore");
  });
});

describe("it wears the campaign chrome — same look as every other lifecycle email", () => {
  test("the spine is header · ribbon · photo · hero · strip · … · agent card · CTA · footer", async () => {
    const doc = await buildComingSoon(TEASER_CTX);
    const spine = ordered(doc!).map((b) => {
      if (b.type === "hero") return b.props.ribbon ? "hero:ribbon" : "hero:subject";
      if (b.type === "stats") return b.props.variant === "strip" ? "stats:strip" : "stats:grid";
      if (b.type === "image") return `image:${String(b.props.kind ?? "?")}`;
      return b.type;
    });

    expect(spine.slice(0, 5)).toEqual([
      "header",
      "hero:ribbon",
      "image:photo",
      "hero:subject",
      "stats:strip",
    ]);
    expect(spine.slice(-3)).toEqual(["agent-card", "button", "footer"]);
    // The scarcity counts are a hairline STRIP. A stacked stat GRID is the wall the
    // chrome exists to kill — under-contract shipped four of them.
    expect(spine.filter((x) => x === "stats:grid")).toHaveLength(0);
    expect(spine.filter((x) => x === "stats:strip")).toHaveLength(2);
    expect(spine.filter((x) => x === "button")).toHaveLength(1);
  });

  test("the spec strip is the shared lifecycle line, MINUS the lot (a lot + a city locates a parcel)", () => {
    const cells = teaserSpecs({
      price: "$595,000",
      beds: "3",
      baths: "3.5",
      sqft: "2847",
      lotSize: "0.26 ac",
      propertyType: "Residential - Single Family",
    } as ListingFacts);

    expect(cells.map((c) => c.label)).toEqual(["Beds", "Baths", "Sq Ft", "$/Sq Ft", "Type"]);
    expect(cells.map((c) => c.label)).not.toContain("Lot");
    expect(cells.map((c) => c.value)).toEqual(["3", "3.5", "2,847", "$209", "Single Family"]);
    // The cell that wins the argument is the emphasised one; type is context.
    expect(cells[3].emphasis).toBe("primary");
    expect(cells[4].emphasis).toBe("muted");
  });

  test("the brand is sticky — the agent's colours ride through untouched", async () => {
    const branded = defaultDoc();
    branded.globalStyle = { ...branded.globalStyle, accentColor: "#123456" };
    const doc = await buildComingSoon({ ...TEASER_CTX, currentDoc: branded });
    expect(doc!.globalStyle.accentColor).toBe("#123456");
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
      bandLo: 536000,
      bandHi: 655000,
      sqftFloor: 2250,
    });
  });

  test("usdShort keeps a cell label readable", () => {
    expect(usdShort(536000)).toBe("$536K");
    expect(usdShort(655000)).toBe("$655K");
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
    bandLo: 536000,
    bandHi: 655000,
    bedFloor: 3,
    sqftFloor: 2250,
    asOfIso: "2026-07-13",
  };

  test("the cells restate the real counts, state what is being counted, and emphasise the punchline", () => {
    expect(scarcityStats(S)).toEqual([
      { value: "13,122", label: "Active homes · Lee County", emphasis: "muted" },
      { value: "1,062", label: "Priced $536K–$655K" },
      { value: "328", label: "…that also match beds + size", emphasis: "primary" },
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
    expect(stats).toHaveLength(2); // the spec strip, then the scarcity strip
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

  test("an unresolved chart is never pushed — an empty chart box is worse than no chart", async () => {
    const doc = await buildComingSoon(TEASER_CTX);
    const charts = doc!.blocks.filter((b) => b.type === "image" && b.props.kind === "chart");
    expect(charts).toHaveLength(0);
    // …and no sources block either: with no counts there is no methodology to disclose.
    expect(doc!.blocks.filter((b) => b.type === "sources")).toHaveLength(0);
  });

  test("no subject → fall through to the generic author (never a faked house)", async () => {
    const doc = await buildComingSoon({ ...TEASER_CTX, facts: null });
    expect(doc).toBeNull();
  });

  test("an empty photo becomes the chrome's dropzone — and it still names no street", async () => {
    const doc = await buildComingSoon(
      ctxFor({ address: SUBJECT, city: "Fort Myers", state: "FL" }),
    );
    const img = doc!.blocks.find((b) => b.type === "image" && b.props.kind === "photo");
    const p = img!.props as { url?: string; alt?: string };
    expect(p.url).toBe("");
    // The chrome derives the dropzone's alt from the hero LABEL. On this recipe that
    // label is the CITY — which is precisely why the open slot cannot leak the house.
    expect(p.alt).toBe("Fort Myers, FL");
    expect(p.alt).not.toContain("Shore");
    expect(p.alt).not.toMatch(/\b326\b/);
  });
});
