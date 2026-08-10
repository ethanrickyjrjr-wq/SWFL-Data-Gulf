// lib/deliverable/language.test.ts — sentence-bank engine tests.
// Test names name the failure mode they target (spec FM numbers:
// docs/superpowers/specs/2026-08-10-sentence-banks-design.md).
import { describe, expect, test } from "bun:test";
import {
  auditBankTemplates,
  renderTemplate,
  type SentenceBank,
  type SentenceTemplate,
} from "./language";

const CUT: SentenceTemplate = {
  text: "The price on {{street}} just came down.",
  slots: [{ name: "street", type: "address", label: "Street address" }],
};

describe("renderTemplate", () => {
  test("fills every slot", () => {
    expect(renderTemplate(CUT, { street: "326 Shore Dr" })).toBe(
      "The price on 326 Shore Dr just came down.",
    );
  });
  test("FM: partial fill never ships — any missing slot → null, whole sentence", () => {
    expect(renderTemplate(CUT, {})).toBeNull();
    expect(renderTemplate(CUT, { street: "" })).toBeNull(); // empty string is not a value
    expect(renderTemplate(CUT, { street: "   " })).toBeNull(); // whitespace is not a value
  });
  test("FM: an unknown {{token}} in the text is a violation, not silent passthrough", () => {
    const bad: SentenceTemplate = { text: "See {{thing}}.", slots: [] };
    expect(renderTemplate(bad, { thing: "this" })).toBeNull();
  });
});

describe("auditBankTemplates (spec FM1: no digit outside a slot)", () => {
  const bank = (s: SentenceTemplate[]): SentenceBank => ({
    recipe: "price-reduced",
    research: ["_RESEARCH/email-and-social/2026-08-09-merge-tag-fallback-vendor-docs.md"],
    sentences: s,
  });
  test("digit-free template with slots is clean", () => {
    expect(auditBankTemplates(bank([CUT]))).toEqual([]);
  });
  test("FM: a digit smuggled into fixed words is caught", () => {
    expect(
      auditBankTemplates(bank([{ text: "Over 1,000 buyers waiting.", slots: [] }])),
    ).not.toEqual([]);
  });
  test("FM: a declared slot missing from the text is caught", () => {
    expect(auditBankTemplates(bank([{ text: "No token here.", slots: CUT.slots }]))).not.toEqual(
      [],
    );
  });
  test("FM: an undeclared {{token}} in the text is caught", () => {
    expect(auditBankTemplates(bank([{ text: "See {{thing}}.", slots: [] }]))).not.toEqual([]);
  });
});
