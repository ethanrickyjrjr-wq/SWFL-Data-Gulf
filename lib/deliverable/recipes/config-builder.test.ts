// lib/deliverable/recipes/config-builder.test.ts
//
// Pins the config builder's PURE seams: the deterministic subject ladder, the
// banned-phrase narrative drop, and the CTA destination rules. The full build path
// is covered by registry-seam.test.ts (every builder, twice, two contexts) and each
// migrated recipe's acceptance render script — this file owns only what is new.
import { describe, expect, test } from "bun:test";
import { cleanNarrative, resolveCtaUrl, subjectFor } from "./config-builder";
import type { RecipeConfig } from "./config";
import type { EmailDoc } from "@/lib/email/doc/types";
import type { ListingFacts } from "@/lib/email/listing-scrape";

const CFG: RecipeConfig = {
  key: "under-contract",
  ribbon: "Under Contract",
  subject: {
    withStreet: "Under contract: {street}",
    withCity: "Under contract in {city}",
    bare: "Under contract",
  },
  photoAlt: "Under contract — {address}",
  specs: ["beds", "baths", "sqft", "price-per-sqft", "lot", "type"],
  includeDescription: true,
  middle: [],
  tail: [],
  ctaLabel: "See What Else Is Available",
  ctaDestination: "brand-site",
  bannedNarrativePhrases: ["sold for", "closed at"],
};

const EMPTY_DOC = { blocks: [], globalStyle: {} } as unknown as EmailDoc;

describe("subjectFor — the deterministic ladder", () => {
  test("street wins, then city, then bare", () => {
    expect(
      subjectFor(
        CFG,
        { address: "326 Shore Dr, Fort Myers Beach, FL", city: "Fort Myers Beach" },
        {},
      ),
    ).toBe("Under contract: 326 Shore Dr");
    expect(subjectFor(CFG, { city: "Fort Myers Beach" }, {})).toBe(
      "Under contract in Fort Myers Beach",
    );
    expect(subjectFor(CFG, {}, {})).toBe("Under contract");
  });

  test("suppressAddress skips the street rung (coming-soon's whole point)", () => {
    const cfg: RecipeConfig = { ...CFG, suppressAddress: true };
    expect(
      subjectFor(
        cfg,
        { address: "326 Shore Dr, Fort Myers Beach, FL", city: "Fort Myers Beach" },
        {},
      ),
    ).toBe("Under contract in Fort Myers Beach");
  });

  test("bareWithDays fires only when a derivation resolved {days}", () => {
    const cfg: RecipeConfig = {
      ...CFG,
      subject: { ...CFG.subject, bareWithDays: "Under contract in {days} days" },
    };
    expect(subjectFor(cfg, {}, { days: "9" })).toBe("Under contract in 9 days");
    // No days resolved → the plain bare form; a dissolved placeholder never ships.
    expect(subjectFor(cfg, {}, {})).toBe("Under contract");
  });

  test("an empty bare template degrades to the ribbon — a subject always resolves", () => {
    const cfg: RecipeConfig = { ...CFG, subject: { ...CFG.subject, bare: "" } };
    expect(subjectFor(cfg, {}, {})).toBe("Under Contract");
  });
});

describe("cleanNarrative — banned phrases drop the paragraph, never rewrite it", () => {
  test("clean passes, banned drops to null, case-insensitive", () => {
    expect(cleanNarrative("A lovely community near the beach.", CFG)).toBe(
      "A lovely community near the beach.",
    );
    expect(cleanNarrative("It SOLD FOR a record price.", CFG)).toBeNull();
    expect(cleanNarrative(null, CFG)).toBeNull();
  });
});

describe("resolveCtaUrl", () => {
  test("brand-site falls back to the SWFL site", () => {
    expect(resolveCtaUrl("brand-site", EMPTY_DOC, null)).toBe("https://www.swfldatagulf.com");
  });

  test("listing yields undefined when unresolved — NEVER a homepage", () => {
    expect(resolveCtaUrl("listing", EMPTY_DOC, null)).toBeUndefined();
    expect(
      resolveCtaUrl("listing", EMPTY_DOC, { photos: [] } as unknown as ListingFacts),
    ).toBeUndefined();
  });

  test("listing uses the real captured url when the facts hold one", () => {
    const facts = {
      photos: [],
      listingUrl: "https://www.realtor.com/realestateandhomes-detail/326-Shore-Dr",
    } as unknown as ListingFacts;
    expect(resolveCtaUrl("listing", EMPTY_DOC, facts)).toBe(
      "https://www.realtor.com/realestateandhomes-detail/326-Shore-Dr",
    );
  });
});
