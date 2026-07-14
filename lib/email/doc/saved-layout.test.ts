// lib/email/doc/saved-layout.test.ts
//
// The contract: SHAPE IS YOURS, CONTENT IS ALWAYS FRESH OR EMPTY.
//
// The load-bearing test here is the LEAK TEST. The operator's requirement was
// stated in caps — *"NOT WITH THE SAME INFORMATION!"* — so it is enforced, not
// promised: a saved layout is poisoned with EVERY content field of the old house
// (123 Old St, $499,000, its photo, its paragraph, its comps, its citations), the
// fresh build for 12345 New Ave is reshaped through it, and the result is scanned
// for any surviving trace of the old listing. One `CONTENT_KEYS` omission and this
// goes red.
import { describe, expect, it } from "bun:test";
import { applySavedLayout, blocksByRole, stripToLayout, CONTENT_KEYS } from "./saved-layout";
import type { EmailBlock, EmailDoc, EmailGlobalStyle } from "./types";

const OLD_STYLE: EmailGlobalStyle = {
  primaryColor: "#111111",
  accentColor: "#ff0000",
  fontFamily: "playfair",
  textColor: "#222222",
  backdropColor: "#eeeeee",
};
const FRESH_STYLE: EmailGlobalStyle = {
  primaryColor: "#0f1d24",
  accentColor: "#3DC9C0",
  fontFamily: "inter",
  textColor: "#242424",
  backdropColor: "#F8F8F8",
};

const blk = (
  id: string,
  type: string,
  props: Record<string, unknown>,
  layout?: { x: number; y: number; w: number; h: number },
): EmailBlock => ({ id, type, props, ...(layout ? { layout } : {}) }) as unknown as EmailBlock;

const doc = (blocks: EmailBlock[], globalStyle = FRESH_STYLE): EmailDoc => ({
  globalStyle,
  blocks,
});

/** The user's saved grid — and every content field poisoned with 123 Old St. */
const POISONED_LAYOUT = doc(
  [
    blk("s1", "header", { companyName: "Gulf Coast Realty", logoUrl: "brand.png" }),
    // They moved the PHOTO above the price hero and made it full-bleed 16:9.
    blk(
      "s2",
      "image",
      { kind: "photo", ratio: "16:9", url: "https://cdn/123-old-st.jpg", alt: "123 Old St" },
      { x: 0, y: 0, w: 12, h: 8 },
    ),
    blk(
      "s3",
      "hero",
      { value: "$499,000", kicker: "New Listing", sub: "123 Old St, Naples FL" },
      { x: 0, y: 8, w: 12, h: 4 },
    ),
    // They shrank the stats to an 8-span strip.
    blk(
      "s4",
      "stats",
      {
        variant: "strip",
        sectionBg: "accent",
        stats: [
          { value: "4", label: "Beds" },
          { value: "3,100", label: "Sq Ft" },
        ],
      },
      { x: 0, y: 12, w: 8, h: 3 },
    ),
    blk(
      "s5",
      "text",
      { body: "123 Old St is a stunning waterfront estate." },
      {
        x: 0,
        y: 15,
        w: 12,
        h: 6,
      },
    ),
    // A block they ADDED — the builder emits no second text block.
    blk(
      "s6",
      "text",
      { body: "A second paragraph I wrote about 123 Old St." },
      {
        x: 0,
        y: 21,
        w: 12,
        h: 4,
      },
    ),
    blk("s7", "button", { label: "Book a Tour", url: "https://old.example/123-old-st" }),
    blk("s8", "sources", { citations: [{ text: "123 Old St · $499,000" }] }),
    blk("s9", "footer", { address: "1 Brand Way, Naples FL" }),
  ],
  OLD_STYLE,
);

/** What the coded builder produces for the NEW subject — its own standard grid. */
const FRESH_BUILD = doc([
  blk("f1", "header", { companyName: "Gulf Coast Realty", logoUrl: "brand.png" }),
  blk("f2", "hero", { value: "$595,000", kicker: "New Listing", sub: "12345 New Ave, Fort Myers" }),
  blk("f3", "image", {
    kind: "photo",
    ratio: "3:2",
    url: "https://cdn/12345-new-ave.jpg",
    alt: "12345 New Ave",
  }),
  blk("f4", "stats", {
    variant: "grid",
    stats: [
      { value: "3", label: "Beds" },
      { value: "2,847", label: "Sq Ft" },
      { value: "$209", label: "$/Sq Ft" },
    ],
  }),
  blk("f5", "text", { body: "12345 New Ave sits on a quarter acre in Fort Myers." }),
  blk("f6", "button", { label: "View the Full Listing", url: "https://new.example/12345" }),
  blk("f7", "sources", { citations: [{ text: "12345 New Ave · $595,000" }] }),
  blk("f8", "footer", { address: "1 Brand Way, Naples FL" }),
]);

/** Every string anywhere in the doc — the dragnet the leak test scans. */
function allStrings(value: unknown, acc: string[] = []): string[] {
  if (typeof value === "string") acc.push(value);
  else if (Array.isArray(value)) for (const v of value) allStrings(v, acc);
  else if (value && typeof value === "object")
    for (const v of Object.values(value)) allStrings(v, acc);
  return acc;
}

describe("applySavedLayout — the leak test (NOT WITH THE SAME INFORMATION)", () => {
  it("carries NO trace of the old listing into the new build", () => {
    const out = applySavedLayout(FRESH_BUILD, POISONED_LAYOUT);
    const haystack = allStrings(out.blocks).join("\n");

    for (const ghost of [
      "123 Old St",
      "$499,000",
      "123-old-st",
      "old.example",
      "waterfront estate",
      "3,100",
      "A second paragraph",
    ]) {
      expect(haystack).not.toContain(ghost);
    }
  });

  it("does carry the NEW subject's data", () => {
    const out = applySavedLayout(FRESH_BUILD, POISONED_LAYOUT);
    const haystack = allStrings(out.blocks).join("\n");
    expect(haystack).toContain("$595,000");
    expect(haystack).toContain("12345 New Ave");
    expect(haystack).toContain("12345-new-ave.jpg");
    expect(haystack).toContain("2,847");
  });
});

describe("applySavedLayout — the shape IS the user's", () => {
  const out = applySavedLayout(FRESH_BUILD, POISONED_LAYOUT);

  it("keeps their block ORDER — photo above the price hero, as they moved it", () => {
    expect(out.blocks.map((b) => b.type)).toEqual([
      "header",
      "image",
      "hero",
      "stats",
      "text",
      "text",
      "button",
      "sources",
      "footer",
    ]);
  });

  it("keeps their grid spans and their style props", () => {
    const image = out.blocks[1];
    expect(image.layout).toEqual({ x: 0, y: 0, w: 12, h: 8 });
    expect((image.props as Record<string, unknown>).ratio).toBe("16:9"); // theirs, not the build's 3:2
    const stats = out.blocks[3];
    expect(stats.layout?.w).toBe(8);
    expect((stats.props as Record<string, unknown>).variant).toBe("strip");
    expect((stats.props as Record<string, unknown>).sectionBg).toBe("accent");
  });

  it("keeps their globalStyle", () => {
    expect(out.globalStyle).toEqual(OLD_STYLE);
  });

  it("fills their moved photo block with the NEW house's photo", () => {
    const props = out.blocks[1].props as Record<string, unknown>;
    expect(props.url).toBe("https://cdn/12345-new-ave.jpg");
    expect(props.alt).toBe("12345 New Ave");
  });

  it("a block they ADDED comes back as an OPEN SLOT, not the old paragraph", () => {
    const added = out.blocks[5].props as Record<string, unknown>;
    expect(added.body).toBeUndefined();
  });

  it("a block they DELETED stays deleted", () => {
    const layoutNoStats = {
      ...POISONED_LAYOUT,
      blocks: POISONED_LAYOUT.blocks.filter((b) => b.type !== "stats"),
    };
    const out2 = applySavedLayout(FRESH_BUILD, layoutNoStats);
    expect(out2.blocks.some((b) => b.type === "stats")).toBe(false);
  });
});

describe("roles, not ids", () => {
  it("matches the 2nd hero to the 2nd hero even though ids never repeat", () => {
    const layout = doc([
      blk("x1", "hero", { kicker: "Ribbon", ribbon: true }),
      blk("x2", "hero", { value: "$1", sub: "old" }),
    ]);
    const fresh = doc([
      blk("y1", "hero", { kicker: "New Listing", ribbon: true }),
      blk("y2", "hero", { value: "$595,000", sub: "12345 New Ave" }),
    ]);
    const out = applySavedLayout(fresh, layout);
    expect((out.blocks[1].props as Record<string, unknown>).value).toBe("$595,000");
    expect((out.blocks[1].props as Record<string, unknown>).sub).toBe("12345 New Ave");
    // Shape prop survives on the ribbon hero.
    expect((out.blocks[0].props as Record<string, unknown>).ribbon).toBe(true);
  });

  // THE COLLISION. Positional ordinals alone are not enough: the lifecycle grid has TWO
  // hero blocks — hero#0 is the ribbon ("New Listing"), hero#1 is the price/address —
  // and both are body-zone, so dragging the price above the ribbon is a legal edit. With
  // naive ordinals the saved price hero matches the fresh RIBBON and the price vanishes
  // into a kicker. Not a leak (the leak test stays green), which is exactly why it needed
  // its own test: it silently scrambles the thing "every grid the same way" promises.
  it("reordering two same-type blocks does NOT swap their content", () => {
    const layout = doc([
      blk("s1", "hero", { value: "$1", sub: "123 Old St" }), // price hero, moved FIRST
      blk("s2", "hero", { kicker: "New Listing", ribbon: true }), // ribbon, now SECOND
    ]);
    const fresh = doc([
      blk("f1", "hero", { kicker: "New Listing", ribbon: true }),
      blk("f2", "hero", { value: "$595,000", sub: "12345 New Ave" }),
    ]);
    const out = applySavedLayout(fresh, layout);
    const first = out.blocks[0].props as Record<string, unknown>;
    const second = out.blocks[1].props as Record<string, unknown>;
    expect(first.value).toBe("$595,000"); // the price hero is still the price hero
    expect(first.sub).toBe("12345 New Ave");
    expect(second.ribbon).toBe(true); // the ribbon is still the ribbon
    expect(second.kicker).toBe("New Listing");
  });

  it("a photo and a chart image are never confused for each other", () => {
    const layout = doc([
      blk("s1", "image", { kind: "chart" }), // they put the chart ABOVE the photo
      blk("s2", "image", { kind: "photo", ratio: "16:9" }),
    ]);
    const fresh = doc([
      blk("f1", "image", { kind: "photo", url: "house.jpg" }),
      blk("f2", "image", { kind: "chart", url: "chart.svg" }),
    ]);
    const out = applySavedLayout(fresh, layout);
    expect((out.blocks[0].props as Record<string, unknown>).url).toBe("chart.svg");
    expect((out.blocks[1].props as Record<string, unknown>).url).toBe("house.jpg");
  });

  it("blocksByRole indexes by type + ordinal", () => {
    expect([...blocksByRole(FRESH_BUILD).keys()]).toContain("hero#0");
    expect([...blocksByRole(POISONED_LAYOUT).keys()]).toContain("text#1");
  });
});

describe("stripToLayout — nothing about the old house is even STORED", () => {
  it("removes every content field at save time", () => {
    const stripped = stripToLayout(POISONED_LAYOUT);
    const haystack = allStrings(stripped.blocks).join("\n");
    expect(haystack).not.toContain("123 Old St");
    expect(haystack).not.toContain("$499,000");
    expect(haystack).not.toContain("Book a Tour"); // a `label` is content — re-authored per subject
  });

  it("keeps the shape: order, spans, style, brand chrome", () => {
    const stripped = stripToLayout(POISONED_LAYOUT);
    expect(stripped.blocks.map((b) => b.type)).toEqual(POISONED_LAYOUT.blocks.map((b) => b.type));
    expect(stripped.blocks[1].layout).toEqual({ x: 0, y: 0, w: 12, h: 8 });
    expect((stripped.blocks[1].props as Record<string, unknown>).ratio).toBe("16:9");
    expect(stripped.globalStyle).toEqual(OLD_STYLE);
    // The header's brand is chrome, not subject content — it stays.
    expect((stripped.blocks[0].props as Record<string, unknown>).companyName).toBe(
      "Gulf Coast Realty",
    );
  });

  it("a stripped layout applied to a fresh build is identical to applying the raw one", () => {
    const a = applySavedLayout(FRESH_BUILD, stripToLayout(POISONED_LAYOUT));
    const b = applySavedLayout(FRESH_BUILD, POISONED_LAYOUT);
    expect(a).toEqual(b);
  });
});

describe("stat CELLS are shape; stat VALUES are the listing's", () => {
  // The one array where the two are interleaved. The saved layout keeps 2 cells (Beds,
  // Sq Ft) as a strip; the fresh build emits 3 (Beds, Sq Ft, $/Sq Ft). They deleted the
  // third — it must not come back, and the two they kept must show the NEW figures.
  it("keeps their cell set and order, filled with the new listing's figures", () => {
    const out = applySavedLayout(FRESH_BUILD, POISONED_LAYOUT);
    const stats = (out.blocks[3].props as Record<string, unknown>).stats as {
      value: string;
      label: string;
    }[];
    expect(stats.map((s) => s.label)).toEqual(["Beds", "Sq Ft"]); // no $/Sq Ft — they cut it
    expect(stats.map((s) => s.value)).toEqual(["3", "2,847"]); // the NEW house
  });

  it("survives the save round-trip (strip → apply), which is the path production takes", () => {
    const out = applySavedLayout(FRESH_BUILD, stripToLayout(POISONED_LAYOUT));
    const stats = (out.blocks[3].props as Record<string, unknown>).stats as {
      value: string;
      label: string;
    }[];
    expect(stats.map((s) => s.label)).toEqual(["Beds", "Sq Ft"]);
    expect(stats.map((s) => s.value)).toEqual(["3", "2,847"]);
  });

  it("a cell the new build has no figure for is an OPEN SLOT, never the old figure", () => {
    const layout = doc([
      blk("s", "stats", {
        stats: [
          { value: "4", label: "Beds" },
          { value: "1974", label: "Year Built" }, // the fresh build emits no Year Built
        ],
      }),
    ]);
    const fresh = doc([blk("f", "stats", { stats: [{ value: "3", label: "Beds" }] })]);
    const stats = (applySavedLayout(fresh, layout).blocks[0].props as Record<string, unknown>)
      .stats as { value: string; label: string }[];
    expect(stats[0].value).toBe("3");
    expect(stats[1]).toEqual({ value: "", label: "Year Built" }); // open slot, not "1974"
  });
});

describe("brand chrome is not 'content' (the CAN-SPAM landmine)", () => {
  // `address` is the LISTING's street address on a hero and the BUSINESS POSTAL
  // ADDRESS on a footer — one key, two meanings. Treating footer.address as content
  // deletes a legally required field from every commercial email. Caught 07/13/2026
  // while writing these tests; this is the regression guard.
  it("keeps the footer's postal address when the fresh build has one", () => {
    const out = applySavedLayout(FRESH_BUILD, POISONED_LAYOUT);
    const footer = out.blocks.at(-1)!.props as Record<string, unknown>;
    expect(footer.address).toBe("1 Brand Way, Naples FL");
  });

  it("keeps the footer's postal address even with NO fresh counterpart", () => {
    const freshNoFooter = doc(FRESH_BUILD.blocks.filter((b) => b.type !== "footer"));
    const out = applySavedLayout(freshNoFooter, POISONED_LAYOUT);
    const footer = out.blocks.at(-1)!.props as Record<string, unknown>;
    expect(footer.address).toBe("1 Brand Way, Naples FL");
  });

  it("stripToLayout STORES brand chrome (it is the agent's, not the listing's)", () => {
    const stripped = stripToLayout(POISONED_LAYOUT);
    const footer = stripped.blocks.at(-1)!.props as Record<string, unknown>;
    expect(footer.address).toBe("1 Brand Way, Naples FL");
  });
});

describe("CONTENT_KEYS covers what build-doc governs", () => {
  it("includes every TEXT_KEY and HELD_FIGURE_KEY (drift guard)", () => {
    // Mirrors build-doc.ts:348 (TEXT_KEYS) + :367 (HELD_FIGURE_KEYS). If either
    // list grows a field and this one doesn't, that field becomes a leak path.
    for (const k of [
      "kicker",
      "value",
      "label",
      "prose",
      "title",
      "body",
      "caption",
      "alt",
      "metricValue",
      "metricLabel",
      "sub",
      "rankText",
      "movementText",
      "price",
      "beds",
      "baths",
      "sqft",
      "address",
      "badge",
    ]) {
      expect(CONTENT_KEYS as readonly string[]).toContain(k);
    }
  });
});
