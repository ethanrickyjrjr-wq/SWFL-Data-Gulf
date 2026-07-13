// lib/email/place-from-prompt.wrong-city.test.ts
//
// THE WRONG-CITY BUG. Found by an adversarial verifier on 07/13/2026, reproduced live
// through the ordinary Lab door.
//
// "I farm North Fort Myers" resolved to **Fort Myers**, and the recipe then built a
// confident, beautifully-cited, entirely WRONG email — a real chart of the wrong city's
// ZIPs, a real median of the wrong city, a hero naming the wrong city — which the agent
// would have sent to their own sphere under their own name.
//
// This is worse than a missing figure. A gap is honest. A confidently wrong city is a lie
// that looks exactly like the truth, and nothing downstream can catch it: every number in
// it is real, correctly sourced, and about the wrong place.
//
// THE RULE THIS PINS: an unknown place must cost an OPEN SLOT, never a neighbouring city.
// The gazetteer must be able to say "I do not know this place."

import { describe, expect, it } from "bun:test";
import { zipFromPromptPlace } from "./place-from-prompt";

describe("a place we do not hold resolves to NOTHING — never to its neighbour", () => {
  it("North Fort Myers is NOT Fort Myers (a real, distinct Lee County community)", () => {
    expect(zipFromPromptPlace("I farm North Fort Myers.")).toBeUndefined();
  });

  it("East / North Naples are NOT Naples", () => {
    expect(zipFromPromptPlace("I farm East Naples.")).toBeUndefined();
    expect(zipFromPromptPlace("my farm area North Naples")).toBeUndefined();
  });

  it("Bonita Beach is NOT Bonita Springs", () => {
    expect(zipFromPromptPlace("I farm Bonita Beach.")).toBeUndefined();
  });

  it("a qualifier on ANY known place refuses rather than guessing", () => {
    for (const q of ["South", "West", "Old", "Downtown", "Greater"]) {
      expect(zipFromPromptPlace(`I farm ${q} Cape Coral.`), `${q} Cape Coral`).toBeUndefined();
    }
  });
});

describe("the places we DO hold still resolve — the guard must not eat the product", () => {
  it("a bare known city resolves", () => {
    const capeCoral = zipFromPromptPlace("Build a market pulse for Cape Coral.");
    expect(capeCoral?.place).toBe("Cape Coral");
    // Cape Coral is SIX ZIPs, not one — collapsing to the primary silently drops the city.
    expect(capeCoral!.zips.length).toBeGreaterThan(1);

    expect(zipFromPromptPlace("a weekly update for Fort Myers")?.place).toBe("Fort Myers");
    expect(zipFromPromptPlace("my farm area Naples")?.place).toBe("Naples");
  });

  it("a MULTI-WORD known place still beats its own prefix", () => {
    // The needles are sorted longest-first precisely so this wins. If "Fort Myers Beach"
    // is a place we hold, it must not be refused as "Fort Myers" + a suffix.
    const fmb = zipFromPromptPlace("I farm Fort Myers Beach.");
    if (fmb) {
      expect(fmb.place.toLowerCase()).toContain("beach");
    } else {
      // If the crosswalk genuinely doesn't hold it, refusing is the CORRECT behavior —
      // an open slot, never "Fort Myers".
      expect(fmb).toBeUndefined();
    }
  });

  it("a place named mid-sentence is still found", () => {
    expect(zipFromPromptPlace("one honest read of the gap in Cape Coral this week")?.place).toBe(
      "Cape Coral",
    );
  });

  it("no place named at all → undefined, and the caller asks", () => {
    expect(zipFromPromptPlace("build me a nice email")).toBeUndefined();
    expect(zipFromPromptPlace("")).toBeUndefined();
  });

  it("never matches a place inside a longer word ('landscape' is not 'Cape')", () => {
    expect(zipFromPromptPlace("a landscape photo")).toBeUndefined();
  });
});
