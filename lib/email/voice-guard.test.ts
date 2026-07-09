/**
 * voiceGuard proof gate (spec 2026-07-08-email-voice-guard-design) — the
 * banned-phrase lint on authored email prose. PURE (no LLM, no I/O), so the
 * detector + phrase-surgical strip are tested directly, mirroring the pattern of
 * author-doc.test.ts. Docs are built through the real assembler so coverage runs
 * on genuine EmailDoc shapes, not hand-rolled fixtures.
 */
import { test, expect, describe } from "bun:test";
import {
  assembleAuthoredDoc,
  buildFigureMenu,
  figureMenuById,
  collectAnchorNumbers,
} from "./author-doc";
import { DEFAULT_GLOBAL_STYLE } from "./doc/default-docs";
import type { AuthoredDoc } from "./doc/schema";
import type { EmailDoc } from "./doc/types";
import type { MarketFigure } from "./market-context";
import {
  VOICE_TELLS,
  detectVoiceTells,
  stripVoiceTells,
  voiceGuard,
  cleanTellText,
} from "./voice-guard";

const FIGURES: MarketFigure[] = [
  {
    key: "v",
    label: "Median price — Cape Coral (33914)",
    value: "$485,000",
    source: "SWFL Data Gulf",
    as_of: "06/01/2026",
  },
];

/** Build a real EmailDoc from authored blocks (same path production uses). */
function build(blocks: AuthoredDoc["blocks"]): EmailDoc {
  const menu = buildFigureMenu(FIGURES);
  return assembleAuthoredDoc({
    authored: { blocks },
    figuresById: figureMenuById(menu),
    globalStyle: DEFAULT_GLOBAL_STYLE,
    anchorNumbers: collectAnchorNumbers(FIGURES),
  });
}

/** All prose across the doc as one string, for coarse contains/absent asserts. */
function allProse(doc: EmailDoc): string {
  return JSON.stringify(doc.blocks.map((b) => b.props));
}

describe("VOICE_TELLS list integrity", () => {
  test("every entry is a case-insensitive RegExp with a label", () => {
    expect(VOICE_TELLS.length).toBeGreaterThan(8);
    for (const t of VOICE_TELLS) {
      expect(t.pattern).toBeInstanceOf(RegExp);
      expect(t.pattern.flags).toContain("i");
      expect(typeof t.label).toBe("string");
      expect(t.label.length).toBeGreaterThan(0);
    }
  });
});

describe("detectVoiceTells — the corporate-AI tells are caught", () => {
  const cases: Array<[string, RegExp]> = [
    ["I hope this email finds you well. Prices are up.", /finds you well/i],
    ["I hope you're doing well today.", /you.re (doing )?well/i],
    ["Let's circle back on that next week.", /circle back/i],
    ["In today's fast-paced market, timing matters.", /today.s fast-paced market/i],
    ["Please don't hesitate to ask me anything.", /don.t hesitate/i],
    ["We built a seamless experience for buyers.", /seamless/i],
    ["Let's delve into the numbers.", /delve/i],
    ["At the end of the day, it's about value.", /at the end of the day/i],
    ["It's worth noting that inventory is tight.", /worth noting/i],
    ["This will unlock your home's potential.", /unlock your/i],
    ["We're thrilled to share this listing.", /thrilled to/i],
    ["Looking for a home? Look no further.", /look no further/i],
    ["Rest assured, I'll handle the paperwork.", /rest assured/i],
  ];
  for (const [body, re] of cases) {
    test(`caught: "${body.slice(0, 32)}…"`, () => {
      const doc = build([{ type: "text", body }]);
      const tells = detectVoiceTells(doc);
      expect(tells.some((t) => re.test(t))).toBe(true);
    });
  }
});

describe("stripVoiceTells — phrase-surgical, number-safe", () => {
  test("removes the tell but keeps a cited number in the same sentence", () => {
    const doc = build([
      { type: "text", body: "I hope this email finds you well. The median in 33914 is $485,000." },
    ]);
    const cleaned = stripVoiceTells(doc);
    const prose = allProse(cleaned);
    expect(prose).not.toMatch(/finds you well/i);
    expect(prose).toContain("$485,000"); // the real figure survives the strip
    expect(prose).toContain("median");
  });

  test("mid-sentence strip tidies whitespace (no double space, no space-before-punct)", () => {
    const doc = build([{ type: "text", body: "We built a seamless and simple flow." }]);
    const body = String(
      (stripVoiceTells(doc).blocks.find((b) => b.type === "text")!.props as Record<string, unknown>)
        .body,
    );
    expect(body).not.toMatch(/seamless/i);
    expect(body).not.toMatch(/ {2,}/); // no doubled spaces
    expect(body).not.toMatch(/\s[.,!?]/); // no space before punctuation
  });

  test("orphaned leading punctuation is cleaned and the sentence re-capitalizes", () => {
    const doc = build([
      { type: "text", body: "I hope this email finds you well. the market moved." },
    ]);
    const body = String(
      (stripVoiceTells(doc).blocks.find((b) => b.type === "text")!.props as Record<string, unknown>)
        .body,
    );
    expect(body).not.toMatch(/finds you well/i);
    expect(body.trimStart().startsWith("The market")).toBe(true);
  });
});

describe("nested prose surfaces (columns + list items)", () => {
  test("a tell inside a multi-column column body is caught and stripped", () => {
    const doc = build([
      {
        type: "multi-column",
        columns: [
          { heading: "Buyers", body: "Don't hesitate to reach the offer window." },
          { heading: "Sellers", body: "List now for strong demand." },
        ],
      },
    ]);
    expect(detectVoiceTells(doc).some((t) => /don.t hesitate/i.test(t))).toBe(true);
    expect(allProse(stripVoiceTells(doc))).not.toMatch(/don.t hesitate/i);
  });

  test("a tell inside a list item text is caught and stripped", () => {
    const doc = build([
      {
        type: "list",
        items: [
          { lead: "Tip", text: "Rest assured the closing timeline holds." },
          { text: "Inventory is tight." },
        ],
      },
    ]);
    expect(detectVoiceTells(doc).some((t) => /rest assured/i.test(t))).toBe(true);
    expect(allProse(stripVoiceTells(doc))).not.toMatch(/rest assured/i);
  });
});

describe("apostrophe variants both match", () => {
  test("curly and straight apostrophes are equivalent", () => {
    const straight = build([{ type: "text", body: "Please don't hesitate to call." }]);
    const curly = build([{ type: "text", body: "Please don’t hesitate to call." }]);
    expect(detectVoiceTells(straight).length).toBeGreaterThan(0);
    expect(detectVoiceTells(curly).length).toBeGreaterThan(0);
  });
});

describe("false-positive guard (v1 = corporate-AI tells only)", () => {
  const allowed = [
    "Reach out to me anytime with questions.",
    "We can leverage the low inventory here.",
    "This is a stunning waterfront home.",
    "The home boasts three bedrooms.",
    "Don't miss this rare opportunity.",
  ];
  for (const body of allowed) {
    test(`NOT flagged: "${body.slice(0, 28)}…"`, () => {
      const doc = build([{ type: "text", body }]);
      expect(detectVoiceTells(doc)).toEqual([]);
    });
  }
});

describe("clean doc is untouched", () => {
  test("no tells → ok:true and content unchanged", () => {
    const doc = build([
      { type: "text", body: "The median in 33914 is $485,000. Demand is strong this quarter." },
    ]);
    const res = voiceGuard(doc);
    expect(res.ok).toBe(true);
    expect(res.tells).toEqual([]);
    expect(allProse(res.stripped)).toBe(allProse(doc));
  });
});

describe("cleanTellText", () => {
  test("strips a tell phrase from a standalone string (not just doc prose fields)", () => {
    expect(cleanTellText("Don't hesitate to reach out today")).toBe("Reach out today");
  });

  test("returns the input unchanged when clean", () => {
    expect(cleanTellText("A clean, direct subject line")).toBe("A clean, direct subject line");
  });
});
