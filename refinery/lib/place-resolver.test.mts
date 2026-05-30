import { describe, it, expect } from "vitest";
import { resolvePlace } from "./place-resolver.mts";

describe("resolvePlace", () => {
  it("the Bonita Bay case — a real place we cover never rejects", () => {
    const r = resolvePlace("Bonita Bay");
    expect(r.matched).toBe(true);
    expect(r.corridor_id).toBe("bonita-beach-rd-bonita-beach");
    expect(r.pocket).toBe("Bonita Springs");
  });

  it("Mercato resolves to Vanderbilt (plaza inside the corridor)", () => {
    const r = resolvePlace("Mercato");
    expect(r.corridor_id).toBe("vanderbilt-beach-rd-mercato");
    expect(r.display_name).toBe("Vanderbilt");
    expect(r.pocket).toBe("North Naples");
    expect(r.confidence).toBe("alias");
  });

  it("a pocket name resolves to the pocket", () => {
    const r = resolvePlace("North Naples");
    expect(r.matched).toBe(true);
    expect(r.pocket).toBe("North Naples");
    expect(r.confidence).toBe("pocket");
  });

  it("an exact corridor label resolves exactly", () => {
    const r = resolvePlace("Vanderbilt Beach Rd / Mercato");
    expect(r.corridor_id).toBe("vanderbilt-beach-rd-mercato");
    expect(r.confidence).toBe("exact");
  });

  it("tolerates a typo via fuzzy match", () => {
    const r = resolvePlace("Vanderbilt");
    expect(r.matched).toBe(true);
    expect(r.corridor_id).toBe("vanderbilt-beach-rd-mercato");
  });

  it("an out-of-SWFL place does not match (the one honest rejection)", () => {
    const r = resolvePlace("Tampa");
    expect(r.matched).toBe(false);
    expect(r.confidence).toBe("none");
  });

  it("empty input does not match", () => {
    expect(resolvePlace("").matched).toBe(false);
    expect(resolvePlace("   ").matched).toBe(false);
  });
});
