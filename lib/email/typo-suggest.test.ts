// lib/email/typo-suggest.test.ts — Lane E typo-guard (bun:test).
import { describe, expect, test } from "bun:test";
import { suggestEmailFix } from "./typo-suggest";

describe("suggestEmailFix", () => {
  test("TLD typo: gmail.cm → gmail.com", () => {
    expect(suggestEmailFix("you@gmail.cm")).toEqual({
      full: "you@gmail.com",
      domain: "gmail.com",
    });
  });

  test("SLD transposition: gmial.com → gmail.com", () => {
    expect(suggestEmailFix("you@gmial.com")).toEqual({
      full: "you@gmail.com",
      domain: "gmail.com",
    });
  });

  test("TLD transposition: hotmail.cmo → hotmail.com", () => {
    expect(suggestEmailFix("you@hotmail.cmo")).toEqual({
      full: "you@hotmail.com",
      domain: "hotmail.com",
    });
  });

  test("both parts off (split pass): gmaill.cmo → gmail.com", () => {
    expect(suggestEmailFix("you@gmaill.cmo")).toEqual({
      full: "you@gmail.com",
      domain: "gmail.com",
    });
  });

  test("exact known domain → null (never nag a correct address)", () => {
    expect(suggestEmailFix("you@gmail.com")).toBeNull();
    expect(suggestEmailFix("you@icloud.com")).toBeNull();
  });

  test("mail.com is a real provider in the exact list → null, not 'gmail.com'", () => {
    expect(suggestEmailFix("you@mail.com")).toBeNull();
  });

  test("country-code style domain is not 'corrected'", () => {
    expect(suggestEmailFix("you@gmail.co.uk")).toBeNull();
  });

  test("unrelated custom domain → null", () => {
    expect(suggestEmailFix("ricky@swfldatagulf.com")).toBeNull();
  });

  test("garbage input → null", () => {
    expect(suggestEmailFix("")).toBeNull();
    expect(suggestEmailFix("nonsense")).toBeNull();
    expect(suggestEmailFix("a@b@c.com")).toBeNull();
    expect(suggestEmailFix("you@gmail")).toBeNull(); // no dot — never guess a TLD
    expect(suggestEmailFix("@gmail.com")).toBeNull();
    expect(suggestEmailFix("you@")).toBeNull();
  });

  test("case: local part preserved verbatim, domain compared lowercased", () => {
    expect(suggestEmailFix("You.C@GMAIL.CM")).toEqual({
      full: "You.C@gmail.com",
      domain: "gmail.com",
    });
  });
});
