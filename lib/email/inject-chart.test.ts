// lib/email/inject-chart.test.ts
//
// TDD for the pure chart-block helpers (no I/O) that let the builder drop a
// rendered chart image into an EmailDoc. Validates against the REAL runtime
// schema (EmailDocSchema) — a chart block must survive safeParse, must land in
// the right place (after the hero), and a re-upsert must REPLACE not duplicate.

import { describe, expect, test } from "bun:test";
import { EmailDocSchema } from "./doc/schema";
import { DEFAULT_GLOBAL_STYLE } from "./doc/default-docs";
import type { EmailDoc } from "./doc/types";
import { chartImageBlock, upsertChartBlock } from "./inject-chart";

function docWith(types: EmailDoc["blocks"][number]["type"][]): EmailDoc {
  return {
    globalStyle: DEFAULT_GLOBAL_STYLE,
    blocks: types.map((type, i) => ({ id: `seed_${i}`, type, props: {} as never })),
  };
}

describe("chartImageBlock", () => {
  test("(a) a doc containing chartImageBlock(...) passes EmailDocSchema.safeParse", () => {
    const block = chartImageBlock({
      url: "https://cdn.example.com/chart.png",
      alt: "Median sale price by ZIP",
      caption: "Lee County · 06/2026",
    });
    expect(block.type).toBe("image");
    expect(typeof block.id).toBe("string");
    expect(block.id.length).toBeGreaterThan(0);
    expect(block.props.url).toBe("https://cdn.example.com/chart.png");
    expect(block.props.alt).toBe("Median sale price by ZIP");
    expect(block.props.caption).toBe("Lee County · 06/2026");

    const doc: EmailDoc = { globalStyle: DEFAULT_GLOBAL_STYLE, blocks: [block] };
    const parsed = EmailDocSchema.safeParse(doc);
    expect(parsed.success).toBe(true);
  });

  test("caption is optional", () => {
    const block = chartImageBlock({ url: "u", alt: "a" });
    const doc: EmailDoc = { globalStyle: DEFAULT_GLOBAL_STYLE, blocks: [block] };
    expect(EmailDocSchema.safeParse(doc).success).toBe(true);
  });
});

describe("upsertChartBlock", () => {
  test("(b) inserts the image immediately after the hero", () => {
    const doc = docWith(["header", "hero", "footer"]);
    const block = chartImageBlock({ url: "u1", alt: "a" });
    const next = upsertChartBlock(doc, block);

    expect(next.blocks.map((b) => b.type)).toEqual(["header", "hero", "image", "footer"]);
    // no mutation of the input doc
    expect(doc.blocks.map((b) => b.type)).toEqual(["header", "hero", "footer"]);
    expect(next).not.toBe(doc);
    expect(EmailDocSchema.safeParse(next).success).toBe(true);
  });

  test("inserts after header when there is no hero", () => {
    const doc = docWith(["header", "text", "footer"]);
    const next = upsertChartBlock(doc, chartImageBlock({ url: "u", alt: "a" }));
    expect(next.blocks.map((b) => b.type)).toEqual(["header", "image", "text", "footer"]);
  });

  test("appends when there is neither hero nor header", () => {
    const doc = docWith(["text", "footer"]);
    const next = upsertChartBlock(doc, chartImageBlock({ url: "u", alt: "a" }));
    expect(next.blocks.map((b) => b.type)).toEqual(["text", "footer", "image"]);
  });

  test("(c) a SECOND upsert REPLACES the image (count unchanged, url updated)", () => {
    const doc = docWith(["header", "hero", "footer"]);
    const first = upsertChartBlock(doc, chartImageBlock({ url: "first", alt: "a" }));
    expect(first.blocks.filter((b) => b.type === "image").length).toBe(1);

    const second = upsertChartBlock(first, chartImageBlock({ url: "second", alt: "b" }));
    const images = second.blocks.filter((b) => b.type === "image");
    expect(images.length).toBe(1); // not duplicated
    expect(second.blocks.length).toBe(first.blocks.length); // count unchanged
    const img = images[0];
    expect(img.type).toBe("image");
    if (img.type === "image") {
      expect(img.props.url).toBe("second");
      expect(img.props.alt).toBe("b");
    }
    expect(second.blocks.map((b) => b.type)).toEqual(["header", "hero", "image", "footer"]);
  });
});
