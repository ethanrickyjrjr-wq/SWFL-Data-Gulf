import { describe, expect, it } from "bun:test";
import {
  communitySourceLine,
  deIdentifyCommunity,
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
  it("names the community and its facts", () => {
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
    expect(communitySourceLine(emptyDetailFacts(URL_))).toBeNull();
    expect(communitySourceLine(undefined)).toBeNull();
  });
});

describe("coming-soon: the spread operator must not leak the listing's identity", () => {
  // `teaserFacts = { ...facts }` carries `community` wholesale. Every other identifying field
  // is explicitly stripped; the community NAME has to be too, or the teaser — an email whose
  // entire purpose is withholding the location — hands over "Bay Colony" in the model's context.
  it("deIdentifyCommunity drops the NAME", () => {
    expect(BAY_COLONY.subdivision).toBe("Bay Colony");
    expect(deIdentifyCommunity(BAY_COLONY)!.subdivision).toBeNull();
  });

  it("…and keeps the amenities, which are the whole value of a teaser", () => {
    const d = deIdentifyCommunity(BAY_COLONY)!;
    expect(d.hasGolf).toBe(true);
    expect(d.hasPool).toBe(true);
    expect(d.amenities).toContain("Pool");
  });

  it("the de-identified source line never contains the community name", () => {
    const line = communitySourceLine(deIdentifyCommunity(BAY_COLONY), { deIdentify: true })!;
    expect(line).not.toContain("Bay Colony");
    expect(line).toContain("Golf, Gated, Tennis Court(s)"); // the facts survive
    expect(line).toMatch(/DO NOT NAME THE COMMUNITY/i);
  });

  it("even if a caller forgets to strip the facts, the de-identified RENDER still withholds it", () => {
    // Belt and braces: deIdentify is honoured at render time too, so a caller that passes raw
    // facts with { deIdentify: true } still cannot leak the name.
    const line = communitySourceLine(BAY_COLONY, { deIdentify: true })!;
    expect(line).not.toContain("Bay Colony");
  });

  it("deIdentifyCommunity passes undefined through", () => {
    expect(deIdentifyCommunity(undefined)).toBeUndefined();
  });
});
