import { describe, expect, it } from "bun:test";
import {
  communitySourceLine,
  parseListingDetail,
  emptyDetailFacts,
} from "@/lib/listings/listing-detail";

const URL_ = "https://www.johnrwood.com/listing/225082845/8665-bay-colony-drive-naples-fl-34108/";

const BAY_COLONY = parseListingDetail(
  `<span class="field-name">Subdivision: </span><span class="field-value">Bay Colony</span>` +
    `<span class="field-name">Community Features: </span><span class="field-value">Golf, Gated, Tennis Court(s)</span>` +
    `<span class="field-name">Amenities: </span><span class="field-value">Clubhouse, Fitness Center, Pool</span>`,
  URL_,
);

describe("ONE authority — the community line, shared by every narrator", () => {
  it("NAMES THE COMMUNITY. Every recipe, no exceptions.", () => {
    // The name is the point. An email that knows a home is in Bay Colony and won't say so is
    // withholding the single most useful fact it holds. There is no recipe that strips it —
    // including the coming-soon teaser (see below).
    const line = communitySourceLine(BAY_COLONY)!;
    expect(line).toContain("Bay Colony");
    expect(line).toContain("Golf, Gated, Tennis Court(s)");
    expect(line).toContain("Clubhouse, Fitness Center, Pool");
  });

  it("always warns that the amenities are the COMMUNITY's, not the HOUSE's", () => {
    // The word-guards match words and cannot tell "the community has a pool" from "the home
    // has a pool". Carrying that warning in ONE place is the only reason it can't drift.
    expect(communitySourceLine(BAY_COLONY)!).toMatch(/NOT THIS HOUSE/i);
  });

  it("says nothing at all when we could not read the page", () => {
    // Absence must degrade to SILENCE, never to "this community has no golf".
    expect(communitySourceLine(emptyDetailFacts(URL_))).toBeNull();
    expect(communitySourceLine(undefined)).toBeNull();
  });

  it("says nothing when the page parsed but stated no community facts", () => {
    const yearOnly = parseListingDetail(
      `<span class="field-name">Year Built: </span><span class="field-value">1998</span>`,
      URL_,
    );
    expect(yearOnly.ok).toBe(true); // we did learn something…
    expect(communitySourceLine(yearOnly)).toBeNull(); // …but nothing about the community
  });
});

describe("coming-soon withholds the DOORSTEP, not the MAP", () => {
  // This briefly went the wrong way. When community facts first landed on ListingFacts, the
  // teaser's `{ ...facts }` spread began carrying `subdivision` into a fact sheet whose every
  // other identifying field was stripped — and the reflex was to strip it too. That over-read
  // the rule. The recipe suppresses the HOUSE (street, number, ZIP), not the neighbourhood it
  // sits in. "Coming soon in Bay Colony" IS the email. Nobody drives to a subdivision and
  // knocks on it.
  it("there is no de-identify path left in the source — the name always ships", () => {
    const line = communitySourceLine(BAY_COLONY)!;
    expect(line).toContain("Bay Colony");
    // The single-arg signature is the guarantee: no caller can ask for the name to be dropped.
    expect(communitySourceLine.length).toBe(1);
  });
});
