// lib/deliverable/recipes/just-sold.language.test.ts — the Just Sold bank's invariants.
//
// The bank's fixed words are PINNED here (spec FM1/FM8): a reword is a deliberate
// edit to the bank file and this test together, never a drive-by. The truth gates
// that decide WHEN the bragging sentences fill live in soldStoryValues and are
// tested in just-sold.test.ts — this file owns the words and the drop-whole render.
import { describe, expect, it } from "bun:test";
import { auditBankTemplates, fillSentences } from "../language";
import { JUST_SOLD_BANK } from "./just-sold.language";

describe("JUST_SOLD_BANK — a clean bank, keyed to its recipe", () => {
  it("passes the bank audit: digit-free fixed words, every slot declared and used", () => {
    expect(auditBankTemplates(JUST_SOLD_BANK)).toEqual([]);
  });

  it("is keyed 'just-sold' and cites its research", () => {
    expect(JUST_SOLD_BANK.recipe).toBe("just-sold");
    expect(JUST_SOLD_BANK.research.length).toBeGreaterThan(0);
  });

  it("pins the agent-pride words — quicker, stronger, officially sold, not luck", () => {
    const texts = JUST_SOLD_BANK.sentences.map((s) => s.text).join(" ");
    expect(texts).toContain("is officially sold");
    expect(texts).toContain("quicker than the");
    expect(texts).toContain("a stronger number than the");
    expect(texts).toContain("Results like this are not luck");
  });
});

describe("drop-whole render — a brag without its figure slot never half-ships", () => {
  it("full values → all four sentences, in bank order", () => {
    const r = fillSentences(JUST_SOLD_BANK, {
      street: "330 Shore Dr",
      dom: "21",
      typical_dom: "50",
      ppsf: "$173",
    });
    expect(r.filled).toHaveLength(4);
    expect(r.filled[0]).toBe("330 Shore Dr is officially sold.");
    expect(r.filled[1]).toContain("closed in 21 days — quicker than the 50-day pace");
    expect(r.filled[2]).toContain("$173 per square foot");
  });

  it("no comparison values → only the announcement and the pride line ship", () => {
    const r = fillSentences(JUST_SOLD_BANK, { street: "330 Shore Dr" });
    expect(r.filled).toEqual([
      "330 Shore Dr is officially sold.",
      "Results like this are not luck — the right price and the right marketing did their job.",
    ]);
  });

  it("the pride line has no slots — the voice survives even a bare run", () => {
    const r = fillSentences(JUST_SOLD_BANK, {});
    expect(r.filled).toEqual([
      "Results like this are not luck — the right price and the right marketing did their job.",
    ]);
  });
});
