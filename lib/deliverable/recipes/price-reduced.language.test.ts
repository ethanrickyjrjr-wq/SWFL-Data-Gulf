// lib/deliverable/recipes/price-reduced.language.test.ts
import { describe, expect, test } from "bun:test";
import { auditBankTemplates, fillSentences } from "../language";
import { PRICE_REDUCED_BANK } from "./price-reduced.language";
import { bankFor } from "../language-banks";

describe("PRICE_REDUCED_BANK", () => {
  test("FM1: every template digit-free outside slots", () => {
    expect(auditBankTemplates(PRICE_REDUCED_BANK)).toEqual([]);
  });
  test("FM5: cites its research by path", () => {
    expect(PRICE_REDUCED_BANK.research.length).toBeGreaterThan(0);
    for (const p of PRICE_REDUCED_BANK.research) expect(p.startsWith("_RESEARCH/")).toBe(true);
  });
  test("the cut sentence obeys the walked framing: plain words, no figures, once", () => {
    const r = fillSentences(PRICE_REDUCED_BANK, { street: "326 Shore Dr" });
    const cut = r.filled.filter((s) => /came down/i.test(s));
    expect(cut.length).toBe(1);
    expect(/\d/.test(cut[0].replace("326 Shore Dr", ""))).toBe(false);
  });
  test("community sentence drops whole on a miss — never a blank", () => {
    const r = fillSentences(PRICE_REDUCED_BANK, { street: "326 Shore Dr" });
    expect(r.filled).toHaveLength(1);
    expect(r.filled.some((s) => /inside\s*\./i.test(s))).toBe(false);
  });
});

describe("bankFor registry (spec FM6: un-banked recipes are untouched)", () => {
  test("price-reduced resolves; an un-banked recipe is null", () => {
    expect(bankFor("price-reduced")).toBe(PRICE_REDUCED_BANK);
    expect(bankFor("just-sold")).toBeNull();
    expect(bankFor("")).toBeNull();
  });
});
