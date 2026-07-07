// This repo has no DOM test environment by design — tests are bun:test + pure.
// We test tokenizeAnswerText (the pure tokenizer AnswerText renders from) directly.
import { describe, test, expect } from "bun:test";
import { tokenizeAnswerText, stripAnswerMarkdown } from "./AnswerText";

function highlighted(text: string): string[] {
  return tokenizeAnswerText(text)
    .filter((t) => t.highlight)
    .map((t) => t.text);
}

describe("tokenizeAnswerText", () => {
  test("highlights a comma-grouped integer", () => {
    expect(highlighted("Of 30,551 active listings")).toEqual(["30,551"]);
  });

  test("highlights currency with a k/M suffix", () => {
    expect(highlighted("priced under $300k, and $600k–$1M")).toEqual(["$300k", "$600k", "$1M"]);
  });

  test("highlights a percentage including the sign", () => {
    expect(highlighted("FHFA HPI: -8.86% YoY, FL state -2.62%")).toEqual(["-8.86%", "-2.62%"]);
  });

  test("highlights a negative decimal (z-score)", () => {
    expect(highlighted("current year sits at z = -0.9 — neutral")).toEqual(["-0.9"]);
  });

  test("does NOT highlight an MM/DD/YYYY as-of date, still highlights the rest", () => {
    expect(highlighted("active listings (as of 07/01/2026), 43.2% are")).toEqual(["43.2%"]);
  });

  test("does NOT highlight a number fused to a unit letter (3yr, Q4, FY2025)", () => {
    expect(highlighted("Trailing 3yr baseline in Q4 FY2025 averaged 65.3 per 1,000")).toEqual([
      "65.3",
      "1,000",
    ]);
  });

  test("highlights a word + short number as one unit, not split colors (High 5, Phase 2)", () => {
    expect(highlighted("High 5 Entertainment leased space")).toEqual(["High 5"]);
    expect(highlighted("Corkscrew Road Phase 2 widening")).toEqual(["Phase 2"]);
  });

  test("highlights a spelled-out narrative date as one unit, not split colors", () => {
    expect(highlighted("finishing end of August 2025")).toEqual(["August 2025"]);
    expect(highlighted("awarded April 2026 for the pier")).toEqual(["April 2026"]);
    expect(highlighted("contract signed December 5, 2026 today")).toEqual(["December 5, 2026"]);
  });

  test("word + short number does NOT swallow a comma-grouped or fused number", () => {
    expect(highlighted("Lee 22,484 active listings and Collier 8,067 units")).toEqual([
      "22,484",
      "8,067",
    ]);
  });

  test("sentence-initial capitalized word before a bare year is NOT treated as an entity", () => {
    expect(highlighted("Since 2020 permits rose")).toEqual(["2020"]);
  });

  test("highlights a number + trailing magnitude/unit word as one unit, not split colors", () => {
    expect(highlighted("roughly $27 million, finishing end of 2026")).toEqual([
      "$27 million",
      "2026",
    ]);
    expect(highlighted("a 40,000 square feet building")).toEqual(["40,000 square feet"]);
    expect(highlighted("a 75,910-square-foot building")).toEqual(["75,910-square-foot"]);
    expect(highlighted("$1.1 million permit value")).toEqual(["$1.1 million"]);
  });

  test("does NOT swallow a following word that isn't a recognized unit", () => {
    expect(highlighted("40,000 square feet at 9000 Williams Road")).toEqual([
      "40,000 square feet",
      "9000",
    ]);
  });

  test("round-trips: joining every token's text reconstructs the original string", () => {
    const text =
      "Lee 22,484, Collier 8,067 (as of 07/01/2026), z = -0.9, $1M+, 3yr baseline Q4 FY2025.";
    expect(
      tokenizeAnswerText(text)
        .map((t) => t.text)
        .join(""),
    ).toBe(text);
  });

  test("empty string yields no tokens", () => {
    expect(tokenizeAnswerText("")).toEqual([]);
  });

  test("plain prose with no numbers highlights nothing", () => {
    expect(highlighted("Lee County parcels in snapshot, actively homesteaded.")).toEqual([]);
  });
});

describe("stripAnswerMarkdown (answers are plain text — asterisks never ship raw)", () => {
  test("strips **bold** and __bold__ markers, keeping the text", () => {
    expect(stripAnswerMarkdown("**Housing Market** — the median")).toBe(
      "Housing Market — the median",
    );
    expect(stripAnswerMarkdown("__emphasis__ stays plain")).toBe("emphasis stays plain");
  });

  test("strips heading markers at line start", () => {
    expect(stripAnswerMarkdown("## Housing Market\nprose")).toBe("Housing Market\nprose");
    expect(stripAnswerMarkdown("### Deep header")).toBe("Deep header");
  });

  test("strips inline code backticks and leading blockquote markers", () => {
    expect(stripAnswerMarkdown("run `the thing` now")).toBe("run the thing now");
    expect(stripAnswerMarkdown("> quoted line\nnormal")).toBe("quoted line\nnormal");
  });

  test("leaves plain prose, newlines, and math untouched", () => {
    const text = "Median $400,000 as of 03/31/2026.\nActive listings: 29,264.";
    expect(stripAnswerMarkdown(text)).toBe(text);
    expect(stripAnswerMarkdown("z = -0.9 and 4 * 5")).toBe("z = -0.9 and 4 * 5");
  });

  test("empty string round-trips", () => {
    expect(stripAnswerMarkdown("")).toBe("");
  });
});
