// lib/email/blocks/ListBlock.test.tsx
//
// ═══════════════════════════════════════════════════════════════════════════════
// *** ONE GRID FOR EVERY ROW. ***
//
// Operator, 08/04/2026, on the SENT comps email: *"Why the fuck is it not nicely
// formatted? ... We are coding the fucking emails! It's not hard to make them the
// same!!!!!!"*
//
// He was looking at a six-row comparable-homes table in which TWO rows had photos. The
// image `<td>` was emitted only on rows that had an image, and the text cell carried a
// `colSpan` that flipped with it — so the same list rendered as two different tables
// interleaved: photographed rows got a 56px thumb and a squeezed gutter that wrapped the
// address over four lines; unphotographed rows got the full width and did not. Nothing
// lined up down the column.
//
// Partial photo coverage is the NORMAL case here (the photo window opened 06/30/2026
// while a comp set reaches 6-12 months back), so this is not an edge case — it is what
// the email looks like most of the time.
//
// The rule: columns are a property of the LIST, not of the row. A missing photo is an
// empty cell, never a missing column, and never a placeholder image.
// ═══════════════════════════════════════════════════════════════════════════════

import { describe, expect, test } from "bun:test";
import { render } from "@react-email/render";
import { ListBlock } from "./ListBlock";
import type { EmailGlobalStyle, ListProps } from "../doc/types";

const style = {
  fontFamily: "MODERN_SANS",
  primaryColor: "#0E0E0E",
  textColor: "#333333",
  accentColor: "#B98F45",
} as unknown as EmailGlobalStyle;

const html = (props: ListProps) =>
  render(<ListBlock props={props} globalStyle={style} />, { plainText: false });

/** Cells per DATA row, in document order. The whole defect is that these used to differ.
 *
 *  Only rows carrying real row text count — react-email wraps the block in its own
 *  layout tables, and counting those would measure the wrapper instead of the grid. */
async function cellsPerRow(props: ListProps, marker = /sq ft|>One|>Two/): Promise<number[]> {
  const out = await html(props);
  // Split at every <tr — a segment runs to the NEXT <tr, so a wrapper row's segment
  // stops before the data rows and never absorbs their cells.
  return out
    .split(/<tr[\s>]/)
    .slice(1)
    .filter((seg) => marker.test(seg))
    .map((seg) => (seg.match(/<td[\s>]/g) ?? []).length);
}

const MIXED: ListProps = {
  title: "The comparable homes",
  items: [
    {
      lead: "$435,000 · $220/sq ft",
      text: "14503 DOLCE VISTA RD · 3 bd · 1,976 sq ft · Sold 05/01/2026",
      imageUrl: "https://ap.rdcpix.com/a.jpg",
      imageAlt: "Listing photo of 14503 DOLCE VISTA RD",
      linkUrl: "https://www.realtor.com/a",
    },
    { lead: "$425,000 · $214/sq ft", text: "16686 WATERS EDGE CT · 3 bd · 1,989 sq ft" },
    { lead: "$330,000 · $168/sq ft", text: "16460 TIMBERLAKES DR · 3 bd · 1,964 sq ft" },
    {
      lead: "$520,000 · $266/sq ft",
      text: "12601 MASTIQUE BEACH BLVD · 3 bd · 1,956 sq ft",
      imageUrl: "https://ap.rdcpix.com/b.jpg",
      linkUrl: "https://www.realtor.com/b",
    },
  ] as ListProps["items"],
};

describe("the comp table renders ONE grid, whatever the photo coverage", () => {
  test("every row has the SAME cell count when only some rows have photos", async () => {
    const counts = await cellsPerRow(MIXED);
    expect(counts).toHaveLength(4);
    expect(new Set(counts).size).toBe(1); // <- the bug: this used to be {2,3}
  });

  test("a photo-less row still holds its image column — an empty cell, not a lost column", async () => {
    const out = await html(MIXED);
    // Two real photos in, two <img> out. The other two rows keep the cell, not an image.
    const imgs = (out.match(/<img[^>]*>/g) ?? []).filter((t) => /ap\.rdcpix\.com/.test(t));
    expect(imgs).toHaveLength(2);
    const counts = await cellsPerRow(MIXED);
    expect(counts[1]).toBe(counts[0]); // photo-less row == photographed row
  });

  test("NO row carries a placeholder or stand-in image — the open-slot contract holds", async () => {
    const out = await html(MIXED);
    expect(out).not.toMatch(/placeholder|aerial|satellite|staticmap|streetview|via\.placeholder/i);
  });

  test("a list where NO row has a photo spends no column on images at all", async () => {
    const none: ListProps = {
      items: MIXED.items!.map(({ lead, text }) => ({ lead, text })),
    } as ListProps;
    const counts = await cellsPerRow(none);
    expect(new Set(counts).size).toBe(1);
    expect(counts[0]).toBe(2); // lead + text. No dead 56px gutter down a photo-less table.
  });

  test("a list where EVERY row has a photo is also uniform", async () => {
    const all: ListProps = {
      items: MIXED.items!.map((i) => ({ ...i, imageUrl: "https://ap.rdcpix.com/x.jpg" })),
    } as ListProps;
    const counts = await cellsPerRow(all);
    expect(new Set(counts).size).toBe(1);
    expect(counts[0]).toBe(3);
  });

  test("rows with no lead are uniform too — the lead column follows the same rule", async () => {
    const noLead: ListProps = {
      items: [{ text: "One", imageUrl: "https://ap.rdcpix.com/a.jpg" }, { text: "Two" }],
    } as ListProps;
    const counts = await cellsPerRow(noLead);
    expect(new Set(counts).size).toBe(1);
  });

  test("the image keeps HTML width/height attributes — Outlook ignores CSS-only sizing", async () => {
    const out = await html(MIXED);
    expect(out).toMatch(/<img[^>]+width="56"/);
    expect(out).toMatch(/<img[^>]+height="56"/);
  });

  test("every rendered photo carries ALT text — Outlook has images off by default", async () => {
    const out = await html(MIXED);
    for (const tag of out.match(/<img[^>]*>/g) ?? []) expect(tag).toMatch(/alt="/);
  });
});
