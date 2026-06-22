import { test, expect } from "bun:test";
import { parseSteerLines, buildSteerQuestion } from "./use-steer-suggestions";

test("parseSteerLines: splits on newlines, strips bullet prefixes, caps at 3", () => {
  const text =
    "- Lead with the rent trend\n- Add flood risk callout\n- Mention YoY sales drop\n- Extra line ignored";
  const result = parseSteerLines(text);
  expect(result).toHaveLength(3);
  expect(result[0]).toBe("Lead with the rent trend");
  expect(result[1]).toBe("Add flood risk callout");
});

test("parseSteerLines: strips numbered list prefixes", () => {
  const text = "1. Lead with the rent trend\n2. Add flood risk callout\n3) Use a paren marker too";
  const result = parseSteerLines(text);
  expect(result[0]).toBe("Lead with the rent trend");
  expect(result[1]).toBe("Add flood risk callout");
  expect(result[2]).toBe("Use a paren marker too");
});

test("parseSteerLines: strips asterisk bullets", () => {
  const text = "* Lead with the rent trend\n* Add flood risk callout";
  const result = parseSteerLines(text);
  expect(result[0]).toBe("Lead with the rent trend");
});

test("parseSteerLines: keeps a leading number that is CONTENT, not a list marker", () => {
  // Regression for the greedy `^[-•*\d.]+` strip, which ate the year. A real steer
  // can begin with a figure; only an actual list marker (1. / 2) / - / *) is removed.
  expect(parseSteerLines("2024 was the peak year — lead with it")).toEqual([
    "2024 was the peak year — lead with it",
  ]);
  expect(parseSteerLines(".NET-style naming is fine")).toEqual([".NET-style naming is fine"]);
});

test("parseSteerLines: drops blank lines", () => {
  const text = "Lead with the rent trend\n\nAdd flood risk callout";
  expect(parseSteerLines(text)).toHaveLength(2);
});

test("parseSteerLines: returns empty array for empty input", () => {
  expect(parseSteerLines("")).toEqual([]);
  expect(parseSteerLines("   ")).toEqual([]);
});

test("buildSteerQuestion: includes the span verbatim", () => {
  const q = buildSteerQuestion("vacancy rate is 8.2%");
  expect(q).toContain("vacancy rate is 8.2%");
});

test("buildSteerQuestion: asks for one-line instructions", () => {
  const q = buildSteerQuestion("vacancy rate is 8.2%");
  expect(q).toContain("one-line");
});
