import { test, expect, describe, it } from "bun:test";
import {
  EmailDocSchema,
  ContentPatchSchema,
  BlockContentPatchSchema,
  mintBlockId,
  AuthorDocSchema,
} from "./schema";
import { SEED_DOCS, createBlock, DEFAULT_GLOBAL_STYLE } from "./default-docs";
import type { EmailDoc } from "./types";

// A doc with EVERY optional prop on EVERY block populated. If the schema drops a
// field that types.ts declares (drift), the round-trip below fails — that is the
// real conformance guarantee (optional props are bidirectionally assignable, so
// a type-level check can't catch a dropped optional; a round-trip can).
const fullDoc: EmailDoc = {
  globalStyle: {
    primaryColor: "#0f1d24",
    accentColor: "#3DC9C0",
    fontFamily: "BOOK_SERIF",
    textColor: "#242424",
    backdropColor: "#F8F8F8",
  },
  blocks: [
    {
      id: "block_aaaa1111",
      type: "header",
      props: { logoUrl: "https://x/l.png", companyName: "Co", tagline: "tag", bgColor: "#000" },
    },
    {
      id: "block_bbbb2222",
      type: "hero",
      props: { kicker: "k", value: "$1", label: "l", prose: "p" },
    },
    {
      id: "block_cccc3333",
      type: "stats",
      props: {
        stats: [
          { value: "1", label: "a" },
          { value: "2", label: "b" },
        ],
      },
    },
    {
      id: "block_dddd4444",
      type: "signal",
      props: { kicker: "k", title: "t", body: "b", bgColor: "#fff" },
    },
    { id: "block_eeee5555", type: "text", props: { body: "body", align: "center" } },
    {
      id: "block_ffff6666",
      type: "image",
      props: { url: "https://x/i.jpg", alt: "a", caption: "c" },
    },
    {
      id: "block_listing1",
      type: "listing",
      props: {
        photoUrl: "https://x/p.jpg",
        price: "$489,000",
        beds: "3",
        baths: "2",
        sqft: "1,840",
        address: "4521 Surfside Blvd, Cape Coral",
        badge: "Virtual Tour",
        linkUrl: "https://x/listing",
        paddingY: "sm",
        sectionBg: "#fff",
      },
    },
    {
      id: "block_multicol1",
      type: "multi-column",
      props: {
        columns: [
          {
            imageUrl: "https://x/a.jpg",
            heading: "A",
            body: "b",
            linkUrl: "https://x/a",
            linkLabel: "Go",
          },
          {
            imageUrl: "https://x/b.jpg",
            heading: "B",
            body: "c",
            linkUrl: "https://x/b",
            linkLabel: "Go",
          },
        ],
        paddingY: "lg",
        sectionBg: "#eee",
      },
    },
    {
      id: "block_list0001",
      type: "list",
      props: {
        title: "Upcoming events",
        items: [
          {
            lead: "JUL 12 ·",
            text: "Farmers market returns to the Cape",
            linkUrl: "https://www.realtor.com/realestateandhomes-detail/x_M1-2",
          },
          { text: "New flood-zone maps take effect" },
        ],
        paddingY: "sm",
        sectionBg: "#fff",
      },
    },
    {
      id: "block_aaaa7777",
      type: "agent-card",
      props: {
        photoUrl: "https://x/p.jpg",
        name: "N",
        title: "T",
        bio: "bio",
        phone: "239",
        ctaUrl: "https://x",
        ctaLabel: "CTA",
      },
    },
    {
      id: "block_eeee7777",
      type: "agent-hero",
      props: {
        photoUrl: "https://x/h.jpg",
        alt: "a",
        name: "N",
        designation: "D",
        tagline: "tg",
        ctaLabel: "C",
        ctaUrl: "https://x",
      },
    },
    {
      id: "block_ffff7777",
      type: "social-icons",
      props: {
        platforms: [
          { type: "instagram", url: "https://instagram.com/me" },
          {
            type: "custom",
            url: "https://substack.com/me",
            label: "Substack",
            logoUrl: "https://x/s.png",
          },
        ],
        displayMode: "icon+text",
        layout: "row",
        iconSize: "md",
        iconColor: "custom",
        customIconColor: "#123456",
      },
    },
    {
      id: "block_bbbb8888",
      type: "button",
      props: { label: "Go", url: "https://x", bgColor: "#111" },
    },
    { id: "block_cccc9999", type: "divider", props: { color: "#ccc" } },
    {
      id: "block_sources1",
      type: "sources",
      props: {
        sources: [
          { url: "https://files.zillowstatic.com/x", label: "Zillow Research" },
          { url: "https://x/y" },
        ],
        note: "Figures refresh from live data.",
        paddingY: "sm",
        sectionBg: "#fff",
      },
    },
    {
      id: "block_dddd0000",
      type: "footer",
      props: {
        companyName: "Co",
        address: "addr",
        websiteUrl: "https://x",
        phone: "239",
        email: "a@b.com",
        instagramUrl: "https://instagram.com/co",
        facebookUrl: "https://facebook.com/co",
        linkedinUrl: "https://linkedin.com/co",
        socialOrder: ["facebook", "instagram", "linkedin"],
        unsubscribeUrl: "https://x/u",
      },
    },
  ],
};

test("round-trips a fully-populated doc with no field stripped", () => {
  const parsed = EmailDocSchema.parse(fullDoc);
  expect(parsed).toEqual(fullDoc);
});

test("globalStyle round-trips displayFontFamily + surface colors (strip-mode landmine)", () => {
  const doc = {
    globalStyle: {
      primaryColor: "#0f1d24",
      accentColor: "#3DC9C0",
      fontFamily: "LATO_SANS",
      displayFontFamily: "PLAYFAIR_SERIF",
      textColor: "#242424",
      backdropColor: "#F8F8F8",
      surfaceColor: "#f0ede6",
      surfaceDarkColor: "#0f1d24",
    },
    blocks: [{ id: "block_t3aaaaaa", type: "text", props: { body: "x" } }],
  };
  const parsed = EmailDocSchema.parse(doc);
  expect(parsed.globalStyle.displayFontFamily).toBe("PLAYFAIR_SERIF");
  expect(parsed.globalStyle.surfaceColor).toBe("#f0ede6");
  expect(parsed.globalStyle.surfaceDarkColor).toBe("#0f1d24");
});

test("globalStyle without the new fields parses unchanged (back-compat)", () => {
  const parsed = EmailDocSchema.parse({
    globalStyle: DEFAULT_GLOBAL_STYLE,
    blocks: [{ id: "block_t3bbbbbb", type: "text", props: { body: "x" } }],
  });
  expect(parsed.globalStyle.displayFontFamily).toBeUndefined();
  expect(parsed.globalStyle.surfaceColor).toBeUndefined();
  expect(parsed.globalStyle.surfaceDarkColor).toBeUndefined();
});

test("preserves a saved block id, mints one when absent", () => {
  const doc = {
    globalStyle: DEFAULT_GLOBAL_STYLE,
    blocks: [
      { id: "block_keepme1", type: "text", props: { body: "kept" } },
      { type: "divider", props: {} }, // no id → minted
    ],
  };
  const parsed = EmailDocSchema.parse(doc);
  expect(parsed.blocks[0].id).toBe("block_keepme1");
  expect(parsed.blocks[1].id).toMatch(/^block_[0-9a-f]{8}$/);
});

test("rejects a malformed block (unknown type) — not coerced", () => {
  const bad = { globalStyle: DEFAULT_GLOBAL_STYLE, blocks: [{ type: "carousel", props: {} }] };
  expect(EmailDocSchema.safeParse(bad).success).toBe(false);
});

// The cap moved from 3 to 6 on 07/13/2026, for the SPEC STRIP — a listing flyer runs one
// hairline line of six cells (beds · baths · sq ft · lot · $/sq ft · type). Six cells in a
// STRIP read as a spec line; six in a GRID read as a wall. The AI is still capped at 3
// (AuthoredStatSchema): the model writes CONTENT, the code builds LAYOUT.
test("a stats block accepts a six-cell spec strip", () => {
  const strip = {
    globalStyle: DEFAULT_GLOBAL_STYLE,
    blocks: [
      {
        type: "stats",
        props: {
          variant: "strip",
          stats: [
            { value: "3", label: "Beds" },
            { value: "3.5", label: "Baths" },
            { value: "2,847", label: "Sq Ft" },
            { value: "0.26 ac", label: "Lot" },
            { value: "$209", label: "$/Sq Ft", emphasis: "primary" },
            { value: "Residential", label: "Type", emphasis: "muted" },
          ],
        },
      },
    ],
  };
  expect(EmailDocSchema.safeParse(strip).success).toBe(true);
});

test("rejects a block whose props violate a constraint (stats > 6 cells)", () => {
  const bad = {
    globalStyle: DEFAULT_GLOBAL_STYLE,
    blocks: [
      {
        type: "stats",
        props: {
          stats: Array.from({ length: 7 }, (_, i) => ({ value: String(i), label: `c${i}` })),
        },
      },
    ],
  };
  expect(EmailDocSchema.safeParse(bad).success).toBe(false);
});

test("rejects an empty block list and an over-long one", () => {
  expect(EmailDocSchema.safeParse({ globalStyle: DEFAULT_GLOBAL_STYLE, blocks: [] }).success).toBe(
    false,
  );
  const many = Array.from({ length: 21 }, () => ({ type: "divider", props: {} }));
  expect(
    EmailDocSchema.safeParse({ globalStyle: DEFAULT_GLOBAL_STYLE, blocks: many }).success,
  ).toBe(false);
});

test("every seed builds a valid, parseable doc", () => {
  for (const seed of SEED_DOCS) {
    const doc = seed.build();
    expect(EmailDocSchema.safeParse(doc).success).toBe(true);
    expect(doc.blocks.length).toBeGreaterThan(0);
  }
});

test("two builds of the same seed have distinct (non-aliased) block ids", () => {
  const a = SEED_DOCS[0].build();
  const b = SEED_DOCS[0].build();
  expect(a.blocks[0].id).not.toBe(b.blocks[0].id);
});

test("editorial seeds exist, carry a serif editorial voice, and end with a footer", () => {
  for (const id of ["editorial-letter", "magazine-issue"]) {
    const seed = SEED_DOCS.find((s) => s.id === id);
    expect(seed).toBeDefined();
    const doc = seed!.build();
    expect(doc.blocks.at(-1)!.type).toBe("footer");
  }
  // Distinct pairings, not a shared font — BLESSED_PAIRINGS (Fence 4) forbids
  // serif+serif, so "editorial" can't mean identical settings on both seeds.
  const magazine = SEED_DOCS.find((s) => s.id === "magazine-issue")!.build();
  expect(magazine.globalStyle.displayFontFamily).toBe("PLAYFAIR_SERIF");
  const letter = SEED_DOCS.find((s) => s.id === "editorial-letter")!.build();
  expect(letter.globalStyle.fontFamily).toBe("BOOK_SERIF");
  expect(letter.globalStyle.displayFontFamily).toBeUndefined();
});

test("createBlock mints a fresh block with default props", () => {
  const blk = createBlock("hero");
  expect(blk.type).toBe("hero");
  expect(blk.id).toMatch(/^block_[0-9a-f]{8}$/);
  expect(blk.props.value).toBeDefined();
});

test("mintBlockId is unique and prefixed", () => {
  const a = mintBlockId();
  const b = mintBlockId();
  expect(a).toMatch(/^block_[0-9a-f]{8}$/);
  expect(a).not.toBe(b);
});

// ── ContentPatchSchema (the AI no-restyle guard) ────────────────────────────

test("accepts a text-only content patch keyed by block id", () => {
  const patch = {
    block_bbbb2222: { value: "$499K", label: "Median · Naples", prose: "Up from last month." },
    block_cccc3333: { stats: [{ value: "41", label: "DOM" }] },
  };
  const r = ContentPatchSchema.safeParse(patch);
  expect(r.success).toBe(true);
});

test("strips an unknown (non-content) key instead of rejecting the whole patch", () => {
  // Haiku sometimes returns extra keys (chart_data, items, designation). z.strictObject
  // rejected the WHOLE patch → the route returned "try rephrasing". Strip-mode keeps the
  // valid content and drops the unknown key. The no-restyle guard still holds because
  // style/link/identity keys are also stripped here (they are not declared keys), before
  // applyPatch can ever merge them — proven by the two tests below.
  const r = BlockContentPatchSchema.safeParse({
    prose: "Up from last month.",
    chart_data: [1, 2, 3],
  });
  expect(r.success).toBe(true);
  if (r.success) expect("chart_data" in r.data).toBe(false);
});

test("STRIPS a color/style key from a patch (no-restyle held by stripping, not rejecting)", () => {
  const a = BlockContentPatchSchema.safeParse({ value: "$1", bgColor: "#000" });
  expect(a.success).toBe(true);
  if (a.success) expect("bgColor" in a.data).toBe(false);
  const b = BlockContentPatchSchema.safeParse({ prose: "ok", color: "#fff" });
  expect(b.success).toBe(true);
  if (b.success) expect("color" in b.data).toBe(false);
});

test("STRIPS a link/asset/identity key from a patch (user-owned — not AI-writable)", () => {
  // url / logoUrl / photoUrl / ctaUrl / companyName / name are user-owned — stripped, never applied
  for (const key of ["url", "logoUrl", "photoUrl", "ctaUrl", "companyName", "name"]) {
    const r = BlockContentPatchSchema.safeParse({ body: "x", [key]: "y" });
    expect(r.success).toBe(true);
    if (r.success) expect(key in r.data).toBe(false);
  }
});

test("STRIPS a metric-card's held data fields (a number is DATA-SEEDED, never AI-written)", () => {
  // metricValue/metricLabel/sub/rankText/movementText/barPct are named OUTSIDE the
  // content allowlist on purpose — an AI patch that tries to rewrite a held value or
  // its bar is dropped, exactly like ListingProps' price/beds. Same guarantee.
  for (const key of ["metricValue", "metricLabel", "sub", "rankText", "movementText"]) {
    const r = BlockContentPatchSchema.safeParse({ body: "x", [key]: "spoofed" });
    expect(r.success).toBe(true);
    if (r.success) expect(key in r.data).toBe(false);
  }
  const bar = BlockContentPatchSchema.safeParse({ body: "x", barPct: 99 });
  expect(bar.success).toBe(true);
  if (bar.success) expect("barPct" in bar.data).toBe(false);
});

test("a metric-card block round-trips through EmailDocSchema with its held value intact", () => {
  const doc = {
    globalStyle: {
      primaryColor: "#1F2937",
      accentColor: "#64748B",
      fontFamily: "MODERN_SANS",
      textColor: "#1F2937",
      backdropColor: "#F8FAFC",
    },
    blocks: [
      {
        id: "mc1",
        type: "metric-card",
        props: {
          metricValue: "$421K",
          metricLabel: "Median Home Value",
          sub: "90-day median sale price",
          rankText: "#12 of 57 SWFL ZIPs",
          movementText: "↓ 2.1% YoY",
          barPct: 62,
        },
        layout: { x: 0, y: 0, w: 6, h: 4 },
      },
      { id: "f1", type: "footer", props: {} },
    ],
  };
  const r = EmailDocSchema.safeParse(doc);
  expect(r.success).toBe(true);
  if (r.success) {
    const mc = r.data.blocks[0];
    expect(mc.type).toBe("metric-card");
    if (mc.type === "metric-card") {
      expect(mc.props.metricValue).toBe("$421K");
      expect(mc.props.barPct).toBe(62);
    }
  }
});

describe("EmailDocSchema — subjectVariants/ctaVariants", () => {
  const baseDoc = {
    globalStyle: {
      primaryColor: "#000",
      accentColor: "#111",
      fontFamily: "MODERN_SANS",
      textColor: "#222",
      backdropColor: "#fff",
    },
    blocks: [{ type: "footer", props: {} }],
  };

  it("accepts and preserves subjectVariants/ctaVariants", () => {
    const parsed = EmailDocSchema.parse({
      ...baseDoc,
      subjectVariants: ["Subject A", "Subject B"],
      ctaVariants: ["View Report", "See the Numbers"],
    });
    expect(parsed.subjectVariants).toEqual(["Subject A", "Subject B"]);
    expect(parsed.ctaVariants).toEqual(["View Report", "See the Numbers"]);
  });

  it("omits both when absent — no regression", () => {
    const parsed = EmailDocSchema.parse(baseDoc);
    expect(parsed.subjectVariants).toBeUndefined();
    expect(parsed.ctaVariants).toBeUndefined();
  });
});

describe("AuthorDocSchema — subject_variants / cta_variants", () => {
  it("accepts subject_variants at the doc level and cta_variants on a block", () => {
    const parsed = AuthorDocSchema.parse({
      blocks: [
        {
          type: "button",
          button_label: "View Report",
          cta_variants: ["View Report", "See the Numbers"],
        },
      ],
      subject_variants: ["Subject A", "Subject B", "Subject C"],
    });
    expect(parsed.subject_variants).toEqual(["Subject A", "Subject B", "Subject C"]);
    expect(parsed.blocks[0].cta_variants).toEqual(["View Report", "See the Numbers"]);
  });
});
