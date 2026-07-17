// lib/back-on-market/no-invention.test.ts
// Structural guard: no user-facing string in this surface may use the legal term
// "stigmatiz*", and Lane 1 copy must never assert a per-home reason or seller state
// ("this home fell through", "the seller is/was motivated"). Comments are stripped
// first — the rule is about rendered strings, not the code that explains the rule.
// Cheap, catches a regression at edit time.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const files = [
  "components/back-on-market/BackOnMarketRead.tsx",
  "lib/back-on-market/national-frame.ts",
  "lib/back-on-market/load-zip.ts",
];

/** File text with block + full-line comments removed, lowercased. */
function code(f: string): string {
  return readFileSync(f, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ") // block comments
    .replace(/^\s*\/\/.*$/gm, "") // full-line comments
    .toLowerCase();
}

test("no surface string uses the legal term 'stigmatized'", () => {
  for (const f of files) {
    expect(code(f)).not.toContain("stigmatiz");
  }
});

test("Lane 1 copy never claims a specific home's reason or seller state", () => {
  const src = code("components/back-on-market/BackOnMarketRead.tsx");
  for (const banned of [
    "this home fell through",
    "the seller was",
    "the seller is motivated",
    "this contract fell through because",
  ]) {
    expect(src).not.toContain(banned);
  }
});
