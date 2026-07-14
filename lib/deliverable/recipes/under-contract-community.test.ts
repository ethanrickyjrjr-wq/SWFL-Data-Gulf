import { describe, expect, it } from "bun:test";
import { communitySourceLine, narratorSources, inventedAttributes } from "./under-contract";
import { emptyDetailFacts, parseListingDetail } from "@/lib/listings/listing-detail";
import type { SettledClaim } from "@/lib/deliverable/claims";

const URL_ = "https://www.johnrwood.com/listing/225082845/8665-bay-colony-drive-naples-fl-34108/";

/** The real shape, as parsed from the live Bay Colony page (07/14/2026). */
const GOLF_COMMUNITY = parseListingDetail(
  `<span class="field-name">Subdivision: </span><span class="field-value">Bay Colony</span>` +
    `<span class="field-name">Community Features: </span><span class="field-value">Golf, Gated, Tennis Court(s), Street Lights</span>` +
    `<span class="field-name">Amenities: </span><span class="field-value">Clubhouse, Fitness Center, Pool, Restaurant</span>`,
  URL_,
);

const SETTLED: SettledClaim[] = [
  { sentence: "The home is listed at $9,500,000.", kind: "price" } as unknown as SettledClaim,
];

describe("the word-ban unlocks via the FACT, not by deleting the word", () => {
  // This is the whole design. `inventedAttributes` compares the paragraph against the SOURCES.
  // "golf"/"pool" were never banned outright — they were unsourceable, so any use was invention.
  it("golf and pool are INVENTION when we hold no community facts", () => {
    const sources = narratorSources({ settled: SETTLED }).join(" ");
    const prose = "The community offers golf and a pool.";
    expect(inventedAttributes(prose, sources)).toContain("pool");
  });

  it("the SAME sentence is legitimate once the detail page states it", () => {
    const sources = narratorSources({ settled: SETTLED, community: GOLF_COMMUNITY }).join(" ");
    const prose = "The community offers golf and a pool.";
    expect(inventedAttributes(prose, sources)).toEqual([]);
  });

  it("a FAILED fetch re-locks it — absence must degrade to silence, not licence", () => {
    // The Big Cypress page came back empty on a live fetch. That failure must not open the gate.
    const sources = narratorSources({
      settled: SETTLED,
      community: emptyDetailFacts(URL_),
    }).join(" ");
    expect(inventedAttributes("The community offers golf and a pool.", sources)).toContain("pool");
  });
});

describe("communitySourceLine", () => {
  it("carries the features and amenities verbatim", () => {
    const line = communitySourceLine(GOLF_COMMUNITY)!;
    expect(line).toContain("Golf, Gated, Tennis Court(s), Street Lights");
    expect(line).toContain("Clubhouse, Fitness Center, Pool, Restaurant");
    expect(line).toContain("Bay Colony");
  });

  it("states that the amenities are the COMMUNITY's, not the house's", () => {
    // The word-guard matches words and cannot tell "the community has a pool" from "the home
    // has a pool". The distinction can only be carried in the source text and the prompt.
    const line = communitySourceLine(GOLF_COMMUNITY)!;
    expect(line).toMatch(/NOT THIS HOUSE/i);
  });

  it("is null when the page yielded nothing — no empty scaffolding in the prompt", () => {
    expect(communitySourceLine(emptyDetailFacts(URL_))).toBeNull();
    expect(communitySourceLine(undefined)).toBeNull();
  });

  it("is null when the page parsed but stated no community facts", () => {
    const yearOnly = parseListingDetail(
      `<span class="field-name">Year Built: </span><span class="field-value">1998</span>`,
      URL_,
    );
    expect(yearOnly.ok).toBe(true); // we did learn something…
    expect(communitySourceLine(yearOnly)).toBeNull(); // …but nothing about the community
  });
});

describe("narratorSources", () => {
  it("omits the community line entirely when we hold no community facts", () => {
    const s = narratorSources({ settled: SETTLED });
    expect(s.some((l) => /THE COMMUNITY/i.test(l))).toBe(false);
  });

  it("includes it when we do", () => {
    const s = narratorSources({ settled: SETTLED, community: GOLF_COMMUNITY });
    expect(s.some((l) => /THE COMMUNITY/i.test(l))).toBe(true);
  });
});
