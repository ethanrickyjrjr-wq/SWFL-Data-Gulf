// lib/email/doc/fences.test.ts
//
// M2 — fences as the BOUNDS of a variety space, enforced HARD on the AI path.
// These prove the pure clamps (span-snap, accent-budget) and the zone sort as
// applied through the AI-only assembler. The canvas soft-warn/picker path never
// calls these — the user is guided, not blocked (fences hard for AI, soft for user).
import { describe, expect, test } from "bun:test";
import {
  snapRowSpans,
  clampAccentBudget,
  assembleAuthoredDoc,
  buildFigureMenu,
  figureMenuById,
  collectAnchorNumbers,
  type AssembleArgs,
} from "../author-doc";
import { DEFAULT_GLOBAL_STYLE } from "./default-docs";
import { ACCENT_BUDGET } from "./block-contract";
import type { AuthoredBlock, AuthoredDoc } from "./schema";
import type { EmailDoc } from "./types";
import type { MarketFigure } from "../market-context";

const FIGURES: MarketFigure[] = [
  { key: "v", label: "Median value", value: "$1,250,000", source: "Zillow", as_of: "06/01/2026" },
];

function args(authored: AuthoredDoc, extra: Partial<AssembleArgs> = {}): AssembleArgs {
  const menu = buildFigureMenu(FIGURES);
  return {
    authored,
    figuresById: figureMenuById(menu),
    globalStyle: DEFAULT_GLOBAL_STYLE,
    anchorNumbers: collectAnchorNumbers(FIGURES),
    ...extra,
  };
}
const propsOf = (b: EmailDoc["blocks"][number]) => b.props as Record<string, unknown>;

// ── Fence 1 — blessed row-span snap (pure) ────────────────────────────────────
describe("Fence 1 — snapRowSpans (blessed multisets, orientation preserved)", () => {
  test("a single block is full-bleed", () => {
    expect(snapRowSpans([4])).toEqual([12]);
    expect(snapRowSpans([12])).toEqual([12]);
  });

  test("today's blessed rows are unchanged", () => {
    expect(snapRowSpans([6, 6])).toEqual([6, 6]); // {6,6} blessed
    expect(snapRowSpans([4, 4, 4])).toEqual([4, 4, 4]); // {4,4,4} blessed
  });

  test("the seeded [4,8] photo+text split stays legal (unordered {8,4})", () => {
    expect(snapRowSpans([4, 8])).toEqual([4, 8]);
    expect(snapRowSpans([8, 4])).toEqual([8, 4]);
  });

  test("[5,7] snaps to the blessed {7,5}, orientation kept", () => {
    expect(snapRowSpans([5, 7])).toEqual([5, 7]);
    expect(snapRowSpans([7, 5])).toEqual([7, 5]);
  });

  test("a non-blessed pair snaps to the NEAREST set, keeping which side is bigger", () => {
    expect(snapRowSpans([3, 9])).toEqual([4, 8]); // nearest {8,4}, big stays right
    expect(snapRowSpans([10, 2])).toEqual([8, 4]); // nearest {8,4}, big stays left
  });

  test("a non-blessed triple snaps to {4,4,4}", () => {
    expect(snapRowSpans([2, 2, 2])).toEqual([4, 4, 4]);
    expect(snapRowSpans([6, 3, 3])).toEqual([4, 4, 4]);
  });

  test("every snapped row sums to exactly 12", () => {
    for (const row of [
      [1, 11],
      [9, 3],
      [5, 5],
      [2, 7, 3],
      [1, 1, 1],
    ]) {
      expect(snapRowSpans(row).reduce((a, b) => a + b, 0)).toBe(12);
    }
  });
});

// ── Fence 5 — accent budget (pure) ────────────────────────────────────────────
describe("Fence 5 — clampAccentBudget (emphasis budgeted, not banned)", () => {
  const accent = (): AuthoredBlock => ({ type: "text", band: "accent" }) as AuthoredBlock;

  test(`keeps the first ${ACCENT_BUDGET} accent bands, downgrades the rest to light`, () => {
    const out = clampAccentBudget([accent(), accent(), accent(), accent()]);
    expect(out.map((b) => b.band)).toEqual(["accent", "accent", "light", "light"]);
  });

  test("leaves non-accent bands and band-less blocks untouched", () => {
    const input: AuthoredBlock[] = [
      { type: "text", band: "dark" } as AuthoredBlock,
      { type: "text" } as AuthoredBlock,
      { type: "text", band: "accent" } as AuthoredBlock,
    ];
    const out = clampAccentBudget(input);
    expect(out.map((b) => b.band)).toEqual(["dark", undefined, "accent"]);
  });
});

// ── Fence 2 & 5 — applied HARD through the AI-only assembler ───────────────────
describe("Fence 2 — zones (open leads / close trails), hard on the AI path", () => {
  test("a header emitted mid-doc floats to the top; footer stays last", () => {
    const doc = assembleAuthoredDoc(
      args({
        blocks: [
          { type: "text", body: "intro" },
          { type: "header" },
          { type: "footer" },
          { type: "text", body: "more" },
        ],
      }),
    );
    const types = doc.blocks.map((b) => b.type);
    expect(types[0]).toBe("header"); // open leads
    expect(types[types.length - 1]).toBe("footer"); // close trails
  });

  test("sources sits in the close zone, above the footer", () => {
    const doc = assembleAuthoredDoc(
      args({
        blocks: [
          { type: "footer" },
          { type: "text", body: "body" },
          { type: "sources" } as AuthoredBlock,
        ],
      }),
    );
    const types = doc.blocks.map((b) => b.type);
    // body first, then sources (close), footer absolute-last
    expect(types.indexOf("text")).toBeLessThan(types.indexOf("sources"));
    expect(types.indexOf("sources")).toBeLessThan(types.indexOf("footer"));
    expect(types[types.length - 1]).toBe("footer");
  });
});

describe("Fence 5 — accent budget enforced through the assembler", () => {
  test("only the budgeted number of accent bands resolve to the accent color", () => {
    const doc = assembleAuthoredDoc(
      args({
        blocks: [
          { type: "text", body: "a", band: "accent" },
          { type: "text", body: "b", band: "accent" },
          { type: "text", body: "c", band: "accent" },
        ],
      }),
    );
    const accentHits = doc.blocks.filter(
      (b) => propsOf(b).sectionBg === DEFAULT_GLOBAL_STYLE.accentColor,
    );
    expect(accentHits.length).toBe(ACCENT_BUDGET);
  });
});
