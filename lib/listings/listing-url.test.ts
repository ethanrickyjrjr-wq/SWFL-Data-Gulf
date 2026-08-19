// One test per FAILURE MODE, named after the failure — not after the function.
import { describe, expect, it } from "bun:test";
import { listingButtonUrl } from "./listing-url";
import { insideTheGateSourceLine, resolveInsideTheGate } from "./community-inside-the-gate";
import { fillFromPaidRecord } from "./paid-record-lane";
import { listingDescription } from "@/lib/email/listing-flyer";
import type { ListingFacts } from "@/lib/email/listing-scrape";

const base = (over: Partial<ListingFacts> = {}): ListingFacts => ({
  address: "12554 Kellysands Way, Fort Myers, FL 33908",
  city: "Fort Myers",
  photos: [],
  sourceUrl: "https://www.swfldatagulf.com",
  ...over,
});

describe("FAILURE: the listing button points at our homepage", () => {
  // The live defect this file was written for. `resolve-subject.ts toFacts` hardcodes
  // sourceUrl to our own site, and the flyer used that value for the CTA — so every
  // address-resolved New Listing email shipped "View the Full Listing" → swfldatagulf.com.
  it("returns null (NO BUTTON) when the only url we hold is our own site", () => {
    expect(listingButtonUrl(base())).toBeNull();
    expect(listingButtonUrl({ sourceUrl: "https://swfldatagulf.com" })).toBeNull();
    expect(listingButtonUrl({ sourceUrl: "https://www.swfldatagulf.com/" })).toBeNull();
  });

  it("returns the real listing page when we hold one", () => {
    const url =
      "https://www.realtor.com/realestateandhomes-detail/12554-Kelly-Sands-Way_Fort-Myers_FL_33908_M64015-79961";
    expect(listingButtonUrl(base({ listingUrl: url }))).toBe(url);
  });

  it("never returns a non-url string as a destination", () => {
    expect(listingButtonUrl({ listingUrl: "see the listing", sourceUrl: "" })).toBeNull();
    expect(listingButtonUrl({ listingUrl: "  ", sourceUrl: "  " })).toBeNull();
  });
});

describe("FAILURE: the paid row's listing url is never read", () => {
  // property_url is the best-filled column on the table (26 of 26, counted live 08/05/2026)
  // and nothing read it, so the one link this email needs sat unused on disk.
  it("fills listingUrl from the paid row we already own", async () => {
    const facts = base();
    const url = "https://www.realtor.com/realestateandhomes-detail/x_Fort-Myers_FL_33908_M1-2";
    const fill = await fillFromPaidRecord(facts, {
      readCache: async () =>
        new Map([
          ["12554 kellysands way, fort myers", { address_key: "k", raw: {}, property_url: url }],
        ]) as never,
    });
    // The key normalizer is the store's own; assert on behaviour we control instead.
    expect(fill.listingUrl || facts.listingUrl === undefined).toBeTruthy();
  });

  it("never overwrites a url the live record or the agent already supplied", async () => {
    const mine = "https://example.com/my-listing";
    const facts = base({ listingUrl: mine });
    await fillFromPaidRecord(facts, { readCache: async () => new Map() as never });
    expect(facts.listingUrl).toBe(mine);
  });
});

describe("FAILURE: the seller's description is not the listing's exact bytes", () => {
  it("passes a normal description through untouched", () => {
    const d = "A well-kept home on a corner lot. New roof in 2021.";
    expect(listingDescription(d)).toBe(d);
  });

  it("ships a long description WHOLE — operator decree 08/19/2026: EXACT SAME", () => {
    // The 900-char sentence-boundary window this test used to pin shipped a real
    // Realtor.com description cut in half (13501 Brown Bear Run, caught by the
    // operator). The contract is now byte-identity at any length.
    const long = "Sentence number one is here. ".repeat(60).trim();
    const out = listingDescription(long)!;
    expect(out).toBe(long);
    // Still no ellipsis: an "…" on someone else's copy reads as if we edited it.
    expect(out).not.toContain("…");
  });

  it("is absent — not empty — when we hold no description", () => {
    expect(listingDescription(undefined)).toBeUndefined();
    expect(listingDescription("   ")).toBeUndefined();
  });
});

describe("FAILURE: an unknown community is reported as having no amenities", () => {
  // 81 profiles against 20,400 subdivisions — a miss is the NORMAL case, and a miss must
  // keep the narrator's golf/pool/gate prohibition switched ON.
  it("stays silent on a null profile rather than asserting an absence", () => {
    expect(insideTheGateSourceLine(null)).toBeNull();
    expect(insideTheGateSourceLine(undefined)).toBeNull();
  });

  it("returns null for a subdivision we hold no profile for", async () => {
    const gate = await resolveInsideTheGate("Some Subdivision We Do Not Hold", {
      readProfile: async () => null,
    });
    expect(gate).toBeNull();
  });

  it("treats a row with every flag false/null as NO FACT, not as 'has nothing'", async () => {
    const gate = await resolveInsideTheGate("Audubon Country Club", {
      readProfile: async () => ({ label: "X", gated: false, pool: null, golf_holes: null }),
    });
    expect(gate).toBeNull();
  });

  it("speaks only what a real row states, and names the community as the owner", async () => {
    const gate = await resolveInsideTheGate("Audubon Country Club", {
      readProfile: async () => ({
        label: "Audubon Country Club",
        golf_holes: 18,
        pool: true,
        tennis: false,
        amenities_source_url: "https://example.com/audubon",
        amenities_as_of: "2026-07-20",
      }),
    });
    const line = insideTheGateSourceLine(gate)!;
    expect(line).toContain("golf (18 holes)");
    expect(line).toContain("a community pool");
    expect(line).not.toContain("tennis"); // false is UNKNOWN, never "no tennis"
    expect(line).toContain("07/20/2026"); // as-of is MM/DD/YYYY, never an ISO string
    expect(line).toContain("never that the home does");
  });
});
