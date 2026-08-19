// lib/email/sale-price-confirm.test.ts — each test names the failure it blocks.
// Decree 08/19/2026: confirm the sale price at send; an answer recomputes $/Sq Ft
// automatically; no answer sends the build exactly as prefilled.
import { describe, expect, it } from "bun:test";
import {
  applySalePrice,
  needsSalePriceConfirm,
  normalizePriceInput,
  salePriceFor,
} from "./sale-price-confirm";
import type { EmailDoc } from "./doc/types";

const DOC = {
  globalStyle: {},
  blocks: [
    { id: "b1", type: "hero", props: { kicker: "Just Sold", ribbon: true } },
    { id: "b2", type: "hero", props: { value: "$595,000", label: "326 Shore Dr" } },
    {
      id: "b3",
      type: "stats",
      props: {
        stats: [
          { value: "3", label: "Beds" },
          { value: "3,053", label: "Sq Ft" },
          { value: "$195", label: "$/Sq Ft" },
        ],
        variant: "strip",
      },
    },
  ],
} as unknown as EmailDoc;

describe("the confirm fires only where the decree aims it", () => {
  it("just-sold → confirm (even on an OPEN hero — that's when asking matters most); other recipes → no popup", () => {
    expect(needsSalePriceConfirm("just-sold", DOC)).toBe(true);
    expect(needsSalePriceConfirm("new-listing", DOC)).toBe(false);
    // The acceptance house live 08/19/2026: no recorded close AND no last-list price —
    // the hero ships as an open slot. The confirm still asks; the agent's answer fills
    // the hero and computes $/Sq Ft where there was nothing.
    const open = {
      ...DOC,
      blocks: DOC.blocks.map((b) =>
        b.id === "b2"
          ? ({ ...b, props: { ...b.props, value: "" } } as (typeof DOC.blocks)[number])
          : b,
      ),
    } as EmailDoc;
    expect(needsSalePriceConfirm("just-sold", open)).toBe(true);
    expect(salePriceFor(open)).toBeNull();
    // ...and answering on the open hero fills it + the rate, same simple math.
    const out = applySalePrice(open, "610000");
    expect((out.blocks[1].props as { value?: string }).value).toBe("$610,000");
    const stats = (
      out.blocks.find((b) => b.id === "b3")!.props as {
        stats: { label: string; value: string }[];
      }
    ).stats;
    expect(stats.find((s) => s.label === "$/Sq Ft")?.value).toBe("$200"); // 610000 / 3053
    // No hero block at all → nothing to confirm, nothing to apply.
    const heroless = { ...DOC, blocks: DOC.blocks.filter((b) => b.id !== "b2") } as EmailDoc;
    expect(needsSalePriceConfirm("just-sold", heroless)).toBe(false);
    expect(applySalePrice(heroless, "610000")).toEqual(heroless);
  });

  it("salePriceFor reads the PRICE hero, never the ribbon band", () => {
    expect(salePriceFor(DOC)).toBe("$595,000");
  });
});

describe("the answer is SIMPLE MATH — price in, hero + $/Sq Ft out", () => {
  it("updates the hero and recomputes $/Sq Ft from the Sq Ft cell on the page", () => {
    const out = applySalePrice(DOC, "630000");
    const hero = out.blocks.find((b) => b.id === "b2")!.props as { value?: string };
    expect(hero.value).toBe("$630,000");
    const stats = (
      out.blocks.find((b) => b.id === "b3")!.props as {
        stats: { label: string; value: string }[];
      }
    ).stats;
    // 630000 / 3053 = 206.4 → the flyer's own rounding: $206
    expect(stats.find((s) => s.label === "$/Sq Ft")?.value).toBe("$206");
    // untouched neighbours stay byte-identical
    expect(stats.find((s) => s.label === "Sq Ft")?.value).toBe("3,053");
  });

  it("accepts messy input — '$1,250,000 ' and '1250000' land identically", () => {
    const a = applySalePrice(DOC, " $1,250,000 ");
    const b = applySalePrice(DOC, "1250000");
    expect((a.blocks[1].props as { value?: string }).value).toBe("$1,250,000");
    expect(a).toEqual(b);
  });

  it("garbage input changes NOTHING — the send proceeds on the prefill (never blocks)", () => {
    expect(applySalePrice(DOC, "call me")).toEqual(DOC);
    expect(applySalePrice(DOC, "")).toEqual(DOC);
    expect(normalizePriceInput("0")).toBeNull();
  });

  it("a doc with no $/Sq Ft cell gets only the hero update — nothing invented", () => {
    const noPpsf = {
      ...DOC,
      blocks: DOC.blocks.map((b) =>
        b.id === "b3"
          ? ({
              ...b,
              props: { stats: [{ value: "3", label: "Beds" }] },
            } as (typeof DOC.blocks)[number])
          : b,
      ),
    } as EmailDoc;
    const out = applySalePrice(noPpsf, "700000");
    expect((out.blocks[1].props as { value?: string }).value).toBe("$700,000");
    expect((out.blocks[2].props as { stats: unknown[] }).stats).toEqual([
      { value: "3", label: "Beds" },
    ]);
  });
});
