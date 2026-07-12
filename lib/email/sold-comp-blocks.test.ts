import { describe, expect, it } from "bun:test";
import {
  SOLD_COMPS_LIST_TITLE,
  soldCompsListBlock,
  buildSoldCompsSpec,
  upsertSoldCompsBlock,
} from "./sold-comp-blocks";
import type { RenderComp } from "@/lib/assistant/comp-helper";
import type { EmailDoc } from "./doc/types";

const comp = (over: Partial<RenderComp>): RenderComp => ({
  addressLine: "125 Main St",
  city: "Cape Coral",
  beds: 3,
  baths: 2,
  sqft: 1500,
  status: "sold",
  price: 450000,
  priceKind: "sold",
  priceDate: "2026-05-20",
  sourceUrl: "https://www.realtor.com/realestateandhomes-detail/x_M1-2",
  ...over,
});

describe("soldCompsListBlock", () => {
  it("builds titled rows: sold lead with MM/DD/YYYY, address text, link", () => {
    const b = soldCompsListBlock([comp({})]);
    expect(b?.type).toBe("list");
    expect(b?.props.title).toBe(SOLD_COMPS_LIST_TITLE);
    expect(b?.props.items[0]).toEqual({
      lead: "$450,000 · 05/20/2026",
      text: "125 Main St, Cape Coral",
      linkUrl: "https://www.realtor.com/realestateandhomes-detail/x_M1-2",
    });
  });

  it("labels estimates and last-lists honestly, omits linkUrl when not captured", () => {
    const b = soldCompsListBlock([
      comp({ priceKind: "estimate", priceDate: null, sourceUrl: null }),
      comp({ priceKind: "last_list", priceDate: null }),
    ]);
    expect(b?.props.items[0].lead).toBe("$450,000 est.");
    expect(b?.props.items[0].linkUrl).toBeUndefined();
    expect(b?.props.items[1].lead).toBe("$450,000 list");
  });

  it("drops price-less comps; null when nothing priced", () => {
    expect(soldCompsListBlock([comp({ price: null })])).toBeNull();
    expect(soldCompsListBlock([])).toBeNull();
  });
});

describe("buildSoldCompsSpec", () => {
  it("subject asking bar + comps desc, needs >=2 priced comps and a subject price", () => {
    const spec = buildSoldCompsSpec(
      [comp({}), comp({ addressLine: "1409 SE 4th Pl", price: 610000 })],
      { street: "1403 NE 19th Ter", listPrice: 575000 },
      "2026-07-12",
    );
    expect(spec).not.toBeNull();
    expect(spec!.rows[0]).toEqual(["1403 NE 19th Ter (Subject — asking)", 575000]);
    expect(spec!.rows[1]).toEqual(["1409 SE 4th Pl", 610000]);
    expect(spec!.rows.length).toBe(3);
    expect(spec!.source).toEqual({
      citation: "SWFL Data Gulf · realtor.com",
      url: "https://www.realtor.com",
    });
    expect(spec!.asOf).toBe("2026-07-12");
  });

  it("labels non-sale prices in the bar name; null under the floors", () => {
    const spec = buildSoldCompsSpec(
      [comp({}), comp({ addressLine: "77 Oak Ln", priceKind: "estimate", price: 500000 })],
      { street: "x", listPrice: 575000 },
      "2026-07-12",
    );
    expect(spec!.rows.some((r) => r[0] === "77 Oak Ln (est.)")).toBe(true);
    expect(
      buildSoldCompsSpec([comp({})], { street: "x", listPrice: 575000 }, "2026-07-12"),
    ).toBeNull();
    expect(
      buildSoldCompsSpec([comp({}), comp({})], { street: "x", listPrice: null }, "2026-07-12"),
    ).toBeNull();
  });
});

describe("upsertSoldCompsBlock", () => {
  const doc: EmailDoc = {
    globalStyle: {
      primaryColor: "#0f1d24",
      accentColor: "#3DC9C0",
      fontFamily: "MODERN_SANS",
      textColor: "#242424",
      backdropColor: "#F8F8F8",
    },
    blocks: [
      { id: "h1", type: "header", props: {} },
      { id: "b1", type: "button", props: { label: "CTA" } },
    ],
  };

  it("inserts before the first button/agent-card/footer", () => {
    const b = soldCompsListBlock([comp({})])!;
    const next = upsertSoldCompsBlock(doc, b);
    expect(next.blocks.map((x) => x.type)).toEqual(["header", "list", "button"]);
  });

  it("replaces in place on re-run (idempotent for scheduled rebuilds)", () => {
    const b = soldCompsListBlock([comp({})])!;
    const once = upsertSoldCompsBlock(doc, b);
    const twice = upsertSoldCompsBlock(once, soldCompsListBlock([comp({ price: 460000 })])!);
    expect(twice.blocks.filter((x) => x.type === "list").length).toBe(1);
    const list = twice.blocks.find((x) => x.type === "list")! as {
      props: { items: { lead?: string }[] };
    };
    expect(list.props.items[0].lead).toContain("$460,000");
  });

  it("appends when the doc has no anchor block", () => {
    const bare: EmailDoc = { ...doc, blocks: [{ id: "t1", type: "text", props: { body: "x" } }] };
    const next = upsertSoldCompsBlock(bare, soldCompsListBlock([comp({})])!);
    expect(next.blocks.map((x) => x.type)).toEqual(["text", "list"]);
  });
});
