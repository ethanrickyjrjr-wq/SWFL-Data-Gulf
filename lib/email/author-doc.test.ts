/**
 * Build 03 proof gate — the AUTHOR engine's structural moat + layout guarantees,
 * demonstrated in code (the LIVE forced-tool author is the post-deploy verify; the
 * `next build` only proves compilation, never runs authorDoc). Mirrors the pattern
 * of lib/assistant/compose-chart.test.ts: the assembler is exported BECAUSE this is
 * where the moat lives, so it is tested directly. PURE — no LLM, no I/O.
 */
import { test, expect, describe } from "bun:test";
import {
  buildFigureMenu,
  figureMenuById,
  assembleAuthoredDoc,
  collectAnchorNumbers,
  lintAuthoredProse,
  filterAnchoredVariants,
  AUTHOR_TOOL,
  authorSystem,
  buildAssetMenu,
  assetMenuById,
  renderAssetMenu,
  promptAnchors,
  type AssembleArgs,
} from "./author-doc";
import { DEFAULT_GLOBAL_STYLE } from "./doc/default-docs";
import { AuthorDocSchema, type AuthoredDoc } from "./doc/schema";
import type { EmailDoc } from "./doc/types";
import type { MarketFigure } from "./market-context";

const FIGURES: MarketFigure[] = [
  {
    key: "home_value",
    label: "Median home value — Naples (34102)",
    value: "$1,250,000",
    source: "Zillow ZHVI",
    as_of: "06/01/2026",
  },
  {
    key: "dom",
    label: "Average days on market",
    value: "47",
    source: "MLS active-listings",
    as_of: "06/01/2026",
  },
];
// menu ids: f0 = $1,250,000 · f1 = 47

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

function propsOf(block: EmailDoc["blocks"][number]): Record<string, unknown> {
  return block.props as Record<string, unknown>;
}

describe("id-selection (numeric fields are never typed by the model)", () => {
  test("value_figure → the figure's verbatim value fills the headline", () => {
    const doc = assembleAuthoredDoc(
      args({ blocks: [{ type: "hero", value_figure: "f0", kicker: "Spotlight" }] }),
    );
    const hero = doc.blocks.find((b) => b.type === "hero");
    expect(hero).toBeDefined();
    expect(propsOf(hero!).value).toBe("$1,250,000");
  });

  test("an unresolved value_figure blanks the field — never the placeholder default", () => {
    const doc = assembleAuthoredDoc(args({ blocks: [{ type: "hero", value_figure: "f99" }] }));
    const hero = doc.blocks.find((b) => b.type === "hero");
    expect(propsOf(hero!).value).toBe(""); // NOT the default "$485K"
    expect(JSON.stringify(doc)).not.toContain("485K");
  });
});

describe("stat-value moat (the prose lint never sees stats — assembly must guard)", () => {
  test("a literal stat number not in the menu is blanked; figure + qualitative cells survive", () => {
    const doc = assembleAuthoredDoc(
      args({
        blocks: [
          {
            type: "stats",
            stats: [
              { value: "$999,999", label: "Invented" }, // unanchored literal → blanked
              // id-selected → verbatim "47"; its label becomes the MENU label
              { value_figure: "f1", label: "DOM" },
              { value: "Buyer's market", label: "Climate" }, // qualitative → kept
            ],
          },
        ],
      }),
    );
    const stats = doc.blocks.find((b) => b.type === "stats");
    const cells = propsOf(stats!).stats as Array<{ value: string; label: string }>;
    expect(cells.find((c) => c.label === "Invented")?.value).toBe("");
    expect(cells.find((c) => c.label === "Average days on market")?.value).toBe("47");
    expect(cells.find((c) => c.label === "Climate")?.value).toBe("Buyer's market");
    // The invented number never appears ANYWHERE in the doc.
    expect(JSON.stringify(doc)).not.toContain("999,999");
  });

  test("a stats block with no resolvable cells is dropped (never ships placeholders)", () => {
    const doc = assembleAuthoredDoc(
      args({ blocks: [{ type: "stats", stats: [{ value: "", label: "" }] }] }),
    );
    expect(doc.blocks.some((b) => b.type === "stats")).toBe(false);
  });
});

describe("no-invention prose lint (gateNarrative philosophy)", () => {
  test("strips a sentence with an unanchored number, keeps anchored, exempts a bare year", () => {
    const doc: EmailDoc = {
      globalStyle: DEFAULT_GLOBAL_STYLE,
      blocks: [
        {
          id: "b1",
          type: "hero",
          props: {
            prose:
              "The median is $1,250,000 today. Prices jumped 73% overnight. Outlook for 2026 holds.",
          },
          layout: { x: 0, y: 0, w: 12, h: 1 },
        },
      ],
    };
    const r = lintAuthoredProse(doc, collectAnchorNumbers(FIGURES));
    const prose = propsOf(r.stripped.blocks[0]).prose as string;
    expect(prose).toContain("$1,250,000"); // anchored → survives
    expect(prose).not.toContain("73%"); // unanchored → stripped
    expect(prose).toContain("2026"); // bare year → exempt
    expect(r.ok).toBe(false);
  });

  test("a clean doc (only anchored numbers) passes untouched", () => {
    const doc: EmailDoc = {
      globalStyle: DEFAULT_GLOBAL_STYLE,
      blocks: [
        {
          id: "b1",
          type: "hero",
          props: { prose: "Homes sit 47 days on market." },
          layout: { x: 0, y: 0, w: 12, h: 1 },
        },
      ],
    };
    const r = lintAuthoredProse(doc, collectAnchorNumbers(FIGURES));
    expect(r.ok).toBe(true);
    expect(propsOf(r.stripped.blocks[0]).prose).toBe("Homes sit 47 days on market.");
  });
});

describe("structural guarantees", () => {
  test("a footer is always present and static, even when the model omits one", () => {
    const doc = assembleAuthoredDoc(args({ blocks: [{ type: "text", body: "Hi" }] }));
    const footer = doc.blocks.find((b) => b.type === "footer");
    expect(footer).toBeDefined();
    expect(footer!.layout?.static).toBe(true);
  });

  test("an unknown block type is dropped (vocabulary is the ONE root)", () => {
    const doc = assembleAuthoredDoc(
      args({ blocks: [{ type: "text", body: "ok" }, { type: "totally-made-up" }] }),
    );
    expect(doc.blocks.some((b) => b.type === "totally-made-up")).toBe(false);
    expect(doc.blocks.some((b) => b.type === "text")).toBe(true);
  });

  test("a metric-card is dropped from an authored doc (DATA-SEEDED, never author-written)", () => {
    // The author writes value_figure, not metricValue — an authored metric-card would
    // ship its placeholder number. It's kept out of the vocabulary AND dropped here.
    const doc = assembleAuthoredDoc(
      args({
        blocks: [
          { type: "text", body: "ok" },
          { type: "metric-card", value_figure: "f1" },
        ],
      }),
    );
    expect(doc.blocks.some((b) => b.type === "metric-card")).toBe(false);
    expect(doc.blocks.some((b) => b.type === "text")).toBe(true);
  });

  test("an offered-but-unplaced chart & photo are reserved in real rows — never bottom-dumped", () => {
    const doc = assembleAuthoredDoc(
      args(
        { blocks: [{ type: "hero", kicker: "Hi" }] },
        {
          chart: { url: "https://x/chart.png", alt: "chart" },
          photo: { url: "https://x/photo.jpg", alt: "photo" },
        },
      ),
    );
    const images = doc.blocks.filter((b) => b.type === "image");
    expect(images.length).toBe(2); // both reserved
    // every block has a real, small y — none parked at the huge fallbackY.
    for (const b of doc.blocks) {
      expect(b.layout).toBeDefined();
      expect(b.layout!.y).toBeLessThan(1000);
    }
    const photo = images.find((b) => propsOf(b).kind === "photo");
    const footer = doc.blocks.find((b) => b.type === "footer");
    expect(photo!.layout!.y).toBeLessThan(footer!.layout!.y); // photo leads, footer trails
  });
});

describe("semantic layout → bounds-correct coordinates", () => {
  test("new_row:false places blocks side-by-side; the row fills 12 columns", () => {
    const doc = assembleAuthoredDoc(
      args({
        blocks: [
          { type: "stats", new_row: true, span: 6, stats: [{ value_figure: "f1", label: "DOM" }] },
          {
            type: "stats",
            new_row: false,
            span: 6,
            stats: [{ value_figure: "f0", label: "Value" }],
          },
        ],
      }),
    );
    const stats = doc.blocks.filter((b) => b.type === "stats");
    expect(stats.length).toBe(2);
    expect(stats[0].layout!.y).toBe(stats[1].layout!.y); // same row
    expect(stats[0].layout!.x).toBe(0);
    expect(stats[1].layout!.x).toBe(6);
    expect(stats[0].layout!.w + stats[1].layout!.w).toBe(12); // fills the row edge-to-edge
  });

  test("a single block is full-bleed (span forced to 12)", () => {
    const doc = assembleAuthoredDoc(args({ blocks: [{ type: "text", span: 4, body: "Solo" }] }));
    const text = doc.blocks.find((b) => b.type === "text");
    expect(text!.layout!.w).toBe(12);
    expect(text!.layout!.x).toBe(0);
  });
});

describe("schedule_suggestion", () => {
  test("AuthorDocSchema accepts an optional schedule_suggestion", () => {
    const parsed = AuthorDocSchema.safeParse({
      blocks: [{ type: "footer" }],
      schedule_suggestion: { cadence: "weekly", reason: "Reads like a recurring market update." },
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.schedule_suggestion?.cadence).toBe("weekly");
  });

  test("AuthorDocSchema is still valid with schedule_suggestion omitted", () => {
    const parsed = AuthorDocSchema.safeParse({ blocks: [{ type: "footer" }] });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.schedule_suggestion).toBeUndefined();
  });

  test("AUTHOR_TOOL.input_schema declares schedule_suggestion as optional (not in required)", () => {
    expect(AUTHOR_TOOL.input_schema.required).toEqual(["blocks"]);
    expect(AUTHOR_TOOL.input_schema.properties).toHaveProperty("schedule_suggestion");
  });
});

// ── author recorded-claim gate (invention-surface-guards §B) ──────────────────
import { collectRecordedAnchors } from "./author-doc";
import type { MarketFigure } from "./market-context";

describe("author recorded-claim gate", () => {
  const docWith = (body: string) =>
    ({
      globalStyle: DEFAULT_GLOBAL_STYLE,
      blocks: [{ id: "b1", type: "text", props: { body } }],
    }) as unknown as EmailDoc;

  test("collectRecordedAnchors keeps only recorded-labeled figures", () => {
    const figures: MarketFigure[] = [
      {
        key: "median_list",
        label: "Median list price",
        value: "$650,000",
        source: "SWFL Data Gulf",
      },
      {
        key: "county_sale",
        label: "Lee County median sale price",
        value: "$389,000",
        source: "Redfin",
      },
    ];
    const out = collectRecordedAnchors(figures);
    expect(out).toContain("$389,000");
    expect(out).not.toContain("$650,000");
  });

  test("'sold for' a list-price figure is stripped", () => {
    const r = lintAuthoredProse(docWith("This home sold for $650,000."), ["$650,000"], []);
    expect(r.ok).toBe(false);
    expect(r.offending).toContain("This home sold for $650,000.");
  });

  test("'median sale price' quoting the recorded-labeled figure passes", () => {
    const r = lintAuthoredProse(
      docWith("The median sale price is $389,000."),
      ["$389,000"],
      ["Lee County median sale price: $389,000"],
    );
    expect(r.ok).toBe(true);
  });

  test("two-arg calls keep working (backward compat)", () => {
    const r = lintAuthoredProse(docWith("Rents hit $2,150."), ["$2,150"]);
    expect(r.ok).toBe(true);
  });
});

// ── semantic layout power-up (author-layout-recipes build) ────────────────────

describe("semantic layout power-up (band / pad / overlay / columns / list)", () => {
  test("authored multi-column columns replace the placeholder defaults", () => {
    const doc = assembleAuthoredDoc(
      args({
        blocks: [
          {
            type: "multi-column",
            columns: [
              { heading: "Open houses", body: "Around the Cape this weekend." },
              { heading: "Buyer tips", body: "How to read days-on-market." },
            ],
          },
        ],
      }),
    );
    const mc = doc.blocks.find((b) => b.type === "multi-column");
    expect(mc).toBeDefined();
    const cols = propsOf(mc!).columns as Array<{ heading?: string }>;
    expect(cols.map((c) => c.heading)).toEqual(["Open houses", "Buyer tips"]);
    expect(JSON.stringify(doc)).not.toContain("Column one"); // placeholder junk is dead
  });

  test("a multi-column with fewer than two usable columns is dropped", () => {
    const doc = assembleAuthoredDoc(
      args({
        blocks: [
          { type: "text", body: "ok" },
          { type: "multi-column", columns: [{ heading: "Solo" }] },
        ],
      }),
    );
    expect(doc.blocks.some((b) => b.type === "multi-column")).toBe(false);
  });

  test("column link_label gets the default link URL; without one the link is dropped", () => {
    const authored: AuthoredDoc = {
      blocks: [
        {
          type: "multi-column",
          columns: [
            { heading: "A", body: "a", link_label: "See more" },
            { heading: "B", body: "b" },
          ],
        },
      ],
    };
    const withUrl = assembleAuthoredDoc(args(authored, { defaultLinkUrl: "https://example.com" }));
    const cols1 = propsOf(withUrl.blocks.find((b) => b.type === "multi-column")!).columns as Array<
      Record<string, unknown>
    >;
    expect(cols1[0].linkUrl).toBe("https://example.com");
    expect(cols1[0].linkLabel).toBe("See more");

    const noUrl = assembleAuthoredDoc(args(authored));
    const cols2 = propsOf(noUrl.blocks.find((b) => b.type === "multi-column")!).columns as Array<
      Record<string, unknown>
    >;
    expect(cols2[0].linkUrl).toBeUndefined();
    expect(cols2[0].linkLabel).toBeUndefined();
  });

  test("authored list items fill the block; empty rows drop; an itemless list drops", () => {
    const doc = assembleAuthoredDoc(
      args({
        blocks: [
          {
            type: "list",
            title: "This month",
            items: [
              { lead: "SAT ·", text: "Farmers market on the Cape" },
              { text: "" },
              { text: "Flood-map open house" },
            ],
          },
          { type: "list" },
        ],
      }),
    );
    const lists = doc.blocks.filter((b) => b.type === "list");
    expect(lists.length).toBe(1); // itemless one dropped
    const items = propsOf(lists[0]).items as Array<{ lead?: string; text: string }>;
    expect(items.length).toBe(2);
    expect(items[0].lead).toBe("SAT ·");
    expect(propsOf(lists[0]).title).toBe("This month");
    expect(JSON.stringify(doc)).not.toContain("Worth knowing"); // placeholder never leaks
  });

  test("band resolves from the branded global style; pad maps onto paddingY", () => {
    const gs = { ...DEFAULT_GLOBAL_STYLE, surfaceDarkColor: "#101418" };
    const doc = assembleAuthoredDoc(
      args(
        {
          blocks: [
            { type: "text", body: "dark", band: "dark", pad: "airy" },
            { type: "signal", title: "accent", band: "accent", pad: "tight" },
            { type: "text", body: "light", band: "light" },
          ],
        },
        { globalStyle: gs },
      ),
    );
    const [t1, sig, t2] = doc.blocks;
    expect(propsOf(t1).sectionBg).toBe("#101418"); // dark → surfaceDarkColor
    expect(propsOf(t1).paddingY).toBe("lg"); // airy
    expect(propsOf(sig).sectionBg).toBe(gs.accentColor); // accent
    expect(propsOf(sig).paddingY).toBe("sm"); // tight
    expect(propsOf(t2).sectionBg).toBe("#ffffff"); // light with no surfaceColor set
  });

  test("dark band falls back to primaryColor when surfaceDarkColor is absent", () => {
    const doc = assembleAuthoredDoc(args({ blocks: [{ type: "text", body: "x", band: "dark" }] }));
    expect(propsOf(doc.blocks[0]).sectionBg).toBe(DEFAULT_GLOBAL_STYLE.primaryColor);
  });

  test("image overlay text writes through to overlayTitle/overlayBody", () => {
    const doc = assembleAuthoredDoc(
      args(
        {
          blocks: [
            {
              type: "image",
              image_role: "photo",
              overlay_title: "Live on the water",
              overlay_body: "A look inside this month's featured listing.",
              alt: "Canal home",
            },
          ],
        },
        { photo: { url: "https://x/p.jpg", alt: "photo" } },
      ),
    );
    const img = doc.blocks.find((b) => b.type === "image");
    expect(propsOf(img!).overlayTitle).toBe("Live on the water");
    expect(propsOf(img!).overlayBody).toBe("A look inside this month's featured listing.");
  });

  test("AuthorDocSchema truncates overlay_title to 80 and clamps items to 8 / columns to 3", () => {
    const parsed = AuthorDocSchema.safeParse({
      blocks: [
        { type: "image", image_role: "photo", overlay_title: "x".repeat(100) },
        { type: "list", items: Array.from({ length: 12 }, (_, i) => ({ text: `row ${i}` })) },
        {
          type: "multi-column",
          columns: Array.from({ length: 5 }, (_, i) => ({ heading: `c${i}` })),
        },
      ],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect((parsed.data.blocks[0].overlay_title ?? "").length).toBe(80);
      expect(parsed.data.blocks[1].items?.length).toBe(8);
      expect(parsed.data.blocks[2].columns?.length).toBe(3);
    }
  });

  test("ASSET MENU: id-selected library images resolve; unknown ids drop the block", () => {
    const menu2 = buildAssetMenu([
      {
        url: "https://x/dani.jpg",
        label: "Dani headshot",
        kind: "upload",
        width: 600,
        height: 600,
      },
      {
        url: "https://cdn.pexels.com/p.jpg",
        label: "Waterfront",
        kind: "pexels",
        caption: "Photo by Dana Q on Pexels",
      },
    ]);
    expect(menu2.map((m) => m.id)).toEqual(["a0", "a1"]);
    const rendered = renderAssetMenu(menu2);
    expect(rendered).toContain('[a0] "Dani headshot" · upload · 600×600');
    expect(rendered).toContain('[a1] "Waterfront" · pexels'); // no invented dimensions
    expect(rendered).not.toContain("undefined");

    const doc = assembleAuthoredDoc(
      args(
        {
          blocks: [
            { type: "image", asset: "a1", alt: "Canal home" },
            { type: "image", asset: "a99" }, // unknown id — dropped
          ],
        },
        { assetsById: assetMenuById(menu2) },
      ),
    );
    const images = doc.blocks.filter((b) => b.type === "image");
    expect(images.length).toBe(1);
    expect(propsOf(images[0]).url).toBe("https://cdn.pexels.com/p.jpg");
    expect(propsOf(images[0]).caption).toBe("Photo by Dana Q on Pexels"); // attribution rides
    expect(propsOf(images[0]).alt).toBe("Canal home");
  });

  test("asset takes precedence over image_role; multi-column columns resolve assets too", () => {
    const menu2 = buildAssetMenu([
      { url: "https://x/one.jpg", label: "One", kind: "upload" },
      { url: "https://x/two.jpg", label: "Two", kind: "upload" },
    ]);
    const doc = assembleAuthoredDoc(
      args(
        {
          blocks: [
            // no photo slot offered — but the asset still resolves (no drop)
            { type: "image", asset: "a0", image_role: "photo" },
            {
              type: "multi-column",
              columns: [
                { heading: "A", body: "x", asset: "a1" },
                { heading: "B", body: "y", asset: "a77" }, // unknown → column has no image
              ],
            },
          ],
        },
        { assetsById: assetMenuById(menu2) },
      ),
    );
    const img = doc.blocks.find((b) => b.type === "image");
    expect(propsOf(img!).url).toBe("https://x/one.jpg");
    const cols = propsOf(doc.blocks.find((b) => b.type === "multi-column")!).columns as Array<
      Record<string, unknown>
    >;
    expect(cols[0].imageUrl).toBe("https://x/two.jpg");
    expect(cols[1].imageUrl).toBeUndefined(); // unknown id never invents a URL
  });

  test("authorSystem carries the ASSET MENU section only when assets exist", () => {
    const base = {
      menu: buildFigureMenu(FIGURES),
      dossier: "",
      vocabulary: ["image", "footer"],
      hasChart: false,
      hasPhoto: false,
    };
    const without = authorSystem(base);
    expect(without).not.toContain("ASSET MENU");
    const withAssets = authorSystem({
      ...base,
      assetMenu: buildAssetMenu([{ url: "https://x/a.jpg", label: "A", kind: "upload" }]),
    });
    expect(withAssets).toContain("ASSET MENU");
    expect(withAssets).toContain('[a0] "A" · upload');
  });

  test("the prose lint walks multi-column columns and list items", () => {
    const doc = {
      globalStyle: DEFAULT_GLOBAL_STYLE,
      blocks: [
        {
          id: "b1",
          type: "multi-column",
          props: {
            columns: [
              {
                heading: "Values",
                body: "The median is $1,250,000 now. It doubled to $9,999,999 overnight.",
              },
              { heading: "Pace", body: "Homes sit 47 days." },
            ],
          },
        },
        {
          id: "b2",
          type: "list",
          props: {
            items: [{ text: "Rents hit $8,888 this week." }, { text: "Homes sit 47 days." }],
          },
        },
      ],
    } as unknown as EmailDoc;
    const r = lintAuthoredProse(doc, collectAnchorNumbers(FIGURES));
    expect(r.ok).toBe(false);
    const cols = propsOf(r.stripped.blocks[0]).columns as Array<{ body?: string }>;
    expect(cols[0].body).toContain("$1,250,000"); // anchored survives
    expect(cols[0].body).not.toContain("9,999,999"); // unanchored stripped
    const items = propsOf(r.stripped.blocks[1]).items as Array<{ text: string }>;
    expect(items[0].text).not.toContain("8,888");
    expect(items[1].text).toContain("47");
  });
});

describe("reply CTA (agent-launch L2 — URLs stay engine-owned)", () => {
  test("buttonMailto puts an engine-owned mailto on authored buttons", () => {
    const doc = assembleAuthoredDoc(
      args(
        { blocks: [{ type: "button", button_label: "Reply with your address" }] },
        { buttonMailto: "mailto:agent@example.com" },
      ),
    );
    const btn = doc.blocks.find((b) => b.type === "button");
    expect(btn).toBeDefined();
    expect((btn!.props as { url?: string }).url).toBe("mailto:agent@example.com");
    expect((btn!.props as { label?: string }).label).toBe("Reply with your address");
  });

  test("no buttonMailto → button url stays the default (never model-written)", () => {
    const doc = assembleAuthoredDoc(args({ blocks: [{ type: "button", button_label: "Reply" }] }));
    const btn = doc.blocks.find((b) => b.type === "button");
    expect((btn!.props as { url?: string }).url ?? "").not.toContain("mailto:");
  });
});

// ── lane-4 prompt anchors (figures the USER typed are quotable prose) ──────────

describe("promptAnchors — lane 4 (figures the user gave)", () => {
  const docWithTextBody = (body: string) =>
    ({
      globalStyle: DEFAULT_GLOBAL_STYLE,
      blocks: [{ id: "b1", type: "text", props: { body } }],
    }) as unknown as EmailDoc;

  test("extracts the street number and user-typed figures", () => {
    expect(
      promptAnchors("email for my listing at 16447 Rainbow Meadows Ct, offered near $1,200,000"),
    ).toEqual(["16447", "$1,200,000"]);
  });

  test("prose naming the prompt's address survives the lint", () => {
    const doc = docWithTextBody("Welcome to 16447 Rainbow Meadows Ct.");
    const anchors = collectAnchorNumbers(
      [],
      promptAnchors("my listing at 16447 Rainbow Meadows Ct"),
    );
    const r = lintAuthoredProse(doc, anchors, []);
    expect(r.ok).toBe(true);
  });

  test("a prompt figure still cannot be dressed as a recorded sale", () => {
    const doc = docWithTextBody("It sold for $1,200,000 last month.");
    const anchors = collectAnchorNumbers([], promptAnchors("asking $1,200,000"));
    const r = lintAuthoredProse(doc, anchors, []); // recorded anchors EMPTY
    expect(r.ok).toBe(false);
  });
});

// ── menu-label fidelity (an id-selected figure carries its OWN label) ──────────
// A real value under a re-attributed label ("List Price" on a ZIP median) was the
// Rainbow Meadows failure: the VALUE was anchored, the LABEL was free text. For
// any value_figure cell the engine now writes the menu figure's own label.

describe("menu-label fidelity — an id-selected figure carries its own label", () => {
  test("a lying authored stats label is replaced by the menu figure's label", () => {
    const doc = assembleAuthoredDoc(
      args({
        blocks: [{ type: "stats", stats: [{ value_figure: "f0", label: "List Price" }] }],
      }),
    );
    const cells = propsOf(doc.blocks.find((b) => b.type === "stats")!).stats as Array<{
      value: string;
      label: string;
    }>;
    expect(cells[0].label).toBe("Median home value — Naples (34102)");
    expect(cells[0].value).toBe("$1,250,000");
  });

  test("a literal qualitative cell keeps its authored label", () => {
    const doc = assembleAuthoredDoc(
      args({
        blocks: [{ type: "stats", stats: [{ value: "Buyer's market", label: "Custom" }] }],
      }),
    );
    const cells = propsOf(doc.blocks.find((b) => b.type === "stats")!).stats as Array<{
      value: string;
      label: string;
    }>;
    expect(cells[0].label).toBe("Custom");
  });

  test("hero label follows the selected figure too", () => {
    const doc = assembleAuthoredDoc(
      args({ blocks: [{ type: "hero", value_figure: "f1", label: "This Home's DOM" }] }),
    );
    expect(propsOf(doc.blocks.find((b) => b.type === "hero")!).label).toBe(
      "Average days on market",
    );
  });

  test("hero without a figure keeps the authored label", () => {
    const doc = assembleAuthoredDoc(
      args({ blocks: [{ type: "hero", label: "A qualitative headline" }] }),
    );
    expect(propsOf(doc.blocks.find((b) => b.type === "hero")!).label).toBe(
      "A qualitative headline",
    );
  });
});

describe("filterAnchoredVariants", () => {
  const anchors = new Set(["485000", "42"]);

  test("keeps a variant with no numbers", () => {
    expect(filterAnchoredVariants(["A clean headline"], anchors)).toEqual(["A clean headline"]);
  });

  test("keeps a variant whose number anchors exactly", () => {
    expect(filterAnchoredVariants(["$485,000 median — see it"], anchors)).toEqual([
      "$485,000 median — see it",
    ]);
  });

  test("drops a variant with an unanchored number", () => {
    expect(filterAnchoredVariants(["$999,000 median — see it"], anchors)).toEqual([]);
  });

  test("drops empty/whitespace-only entries and returns [] for undefined", () => {
    expect(filterAnchoredVariants(["  ", ""], anchors)).toEqual([]);
    expect(filterAnchoredVariants(undefined, anchors)).toEqual([]);
  });
});

describe("assembleAuthoredDoc — subject/CTA variants", () => {
  // NOTE: the brief's original fixture used "$485,000 median in 34103" — but "34103"
  // is itself extracted as a number (extractNumbers has no ZIP exemption, only
  // isBareYear for 4-digit calendar years) and was NOT in anchorNumbers, so that
  // string would correctly get DROPPED by the real anchor-every-number logic.
  // Fixed here to a string that only carries the one anchored figure.
  test("populates subjectVariants from authored.subject_variants, anchor-filtered", () => {
    const doc = assembleAuthoredDoc({
      authored: {
        blocks: [{ type: "footer" }],
        subject_variants: ["$485,000 median", "$999,000 invented", "A clean headline"],
      } as AuthoredDoc,
      figuresById: new Map(),
      globalStyle: DEFAULT_GLOBAL_STYLE,
      anchorNumbers: ["$485,000"],
    });
    expect(doc.subjectVariants).toEqual(["$485,000 median", "A clean headline"]);
  });

  test("populates ctaVariants from the first button block carrying cta_variants", () => {
    const doc = assembleAuthoredDoc({
      authored: {
        blocks: [
          {
            type: "button",
            button_label: "View Report",
            cta_variants: ["View Report", "See the Numbers"],
          },
        ],
      } as AuthoredDoc,
      figuresById: new Map(),
      globalStyle: DEFAULT_GLOBAL_STYLE,
      anchorNumbers: [],
    });
    expect(doc.ctaVariants).toEqual(["View Report", "See the Numbers"]);
  });

  test("omits both fields when the model wrote no variants — no regression", () => {
    const doc = assembleAuthoredDoc({
      authored: { blocks: [{ type: "footer" }] } as AuthoredDoc,
      figuresById: new Map(),
      globalStyle: DEFAULT_GLOBAL_STYLE,
      anchorNumbers: [],
    });
    expect(doc.subjectVariants).toBeUndefined();
    expect(doc.ctaVariants).toBeUndefined();
  });
});
