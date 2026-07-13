// lib/email/blocks/open-slot.test.tsx
//
// THE OPEN-SLOT CONTRACT (operator ruling, 07/13/2026): "for info we don't have, we
// leave open with instructions for the user to paste or add."
//
// Three states, pinned here:
//   sourced     → the value renders (canvas AND email).
//   not sourced → an OPEN SLOT on the canvas (an invitation with an instruction) that
//                 DOES NOT EXIST in the sent email. Never a zero, never a naked label.
//   invented    → forbidden (nothing here can mint a value — the slot stays empty).
//
// Both sendable branches are exercised, because the canvas has lied about the email
// before: `renderEmailDocHtml` → `EmailDocEmail` for a plain doc, → `compileGrid` for
// a positioned (grid) doc. A slot that vanishes on one and ships on the other is a bug.
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { BlockRenderer } from "./BlockRenderer";
import { renderEmailDocHtml } from "../render-email-doc";
import { applyTextAtPath } from "../doc/edit-path";
import { buildListingFlyer } from "../listing-flyer";
import { SEED_DOCS } from "../doc/default-docs";
import type { EmailBlock, EmailDoc, EmailGlobalStyle } from "../doc/types";
import type { ListingFacts } from "../listing-scrape";

const GS: EmailGlobalStyle = {
  primaryColor: "#0f1d24",
  accentColor: "#3DC9C0",
  fontFamily: "MODERN_SANS",
  textColor: "#242424",
  backdropColor: "#F8F8F8",
};
const EDIT = { commit: () => {}, upload: async () => null };

/** Plain doc (no layout) → the EmailDocEmail branch of renderEmailDocHtml. */
const plainDoc = (blocks: EmailBlock[]): EmailDoc => ({ globalStyle: GS, blocks });
/** Positioned doc (every block carries a layout) → the compileGrid branch. */
const gridDoc = (blocks: EmailBlock[]): EmailDoc => ({
  globalStyle: GS,
  blocks: blocks.map((b, i) => ({ ...b, layout: { x: 0, y: i * 3, w: 12, h: 3 } })),
});

/** Canvas markup for one block (GridCanvas passes an edit scope; no emailRender). */
const canvas = (block: EmailBlock): string =>
  renderToStaticMarkup(<BlockRenderer block={block} globalStyle={GS} edit={EDIT} />);

const MIXED_STATS: EmailBlock = {
  id: "s1",
  type: "stats",
  props: {
    stats: [
      { value: "3", label: "Beds" },
      { value: "", label: "Baths" }, // unsourced — the operator's own example
      { value: "2,847", label: "Sq Ft" },
    ],
  },
};
const EMPTY_STATS: EmailBlock = {
  id: "s2",
  type: "stats",
  props: {
    stats: [
      { value: "", label: "Lot" },
      { value: "", label: "Type" },
      { value: "", label: "Built" },
    ],
  },
};
const EMPTY_PHOTO: EmailBlock = {
  id: "i1",
  type: "image",
  props: { url: "", kind: "photo", alt: "326 Shore Dr" },
};
const EMPTY_CHART: EmailBlock = {
  id: "i2",
  type: "image",
  props: { url: "", kind: "chart", alt: "ZIP home-value trend" },
};
const EMPTY_TEXT: EmailBlock = { id: "t1", type: "text", props: { body: "" } };
const ANCHOR: EmailBlock = {
  id: "b1",
  type: "button",
  props: { label: "View the Full Listing", url: "https://x.test" },
};

describe("stats — an unsourced cell is an open slot on the canvas, absent from the email", () => {
  it("canvas: the empty cell keeps its label (the instruction) and is editable", () => {
    const html = canvas(MIXED_STATS);
    expect(html).toContain("Baths");
    expect(html).toContain('data-edit-path="stats.1.value"');
    // The add affordance — and NOT a "0", which reads as a real figure.
    expect(html).toContain('data-placeholder="+ Add"');
    expect(html).not.toContain('data-placeholder="0"');
  });

  it("canvas: edit paths keep their ORIGINAL indices (filtering never renumbers)", () => {
    const paths = [...canvas(MIXED_STATS).matchAll(/data-edit-path="([^"]+)"/g)].map((m) => m[1]);
    expect(paths).toEqual([
      "stats.0.value",
      "stats.0.label",
      "stats.1.value",
      "stats.1.label",
      "stats.2.value",
      "stats.2.label",
    ]);
  });

  for (const [name, make] of [
    ["plain doc (EmailDocEmail)", plainDoc],
    ["grid doc (compileGrid)", gridDoc],
  ] as const) {
    it(`email — ${name}: the unsourced cell is gone; the sourced ones stay`, async () => {
      const html = await renderEmailDocHtml(make([MIXED_STATS]));
      expect(html).toContain("Beds");
      expect(html).toContain("2,847");
      expect(html).not.toContain("Baths"); // no naked label
      expect(html).not.toMatch(/>0</); // and never a fabricated zero
    });

    it(`email — ${name}: a row with NO surviving cell does not exist at all`, async () => {
      const html = await renderEmailDocHtml(make([EMPTY_STATS, ANCHOR]));
      expect(html).not.toContain("Lot");
      expect(html).not.toContain(">Type<"); // ("Type" alone matches the Content-Type meta)
      expect(html).not.toContain("Built");
      expect(html).toContain("View the Full Listing"); // the doc still renders
    });
  }
});

describe("image — an empty slot invites the user; the recipient never sees it", () => {
  it("canvas: a photo slot offers a file picker AND a paste-a-link input", () => {
    const html = canvas(EMPTY_PHOTO);
    expect(html).toContain("Add the photo — 326 Shore Dr"); // alt IS the instruction
    expect(html).toContain('type="file"');
    expect(html).toContain("Choose a file");
    expect(html).toContain("paste an image link");
  });

  it("canvas: a CHART slot is data-filled — no photo picker offered there", () => {
    const html = canvas(EMPTY_CHART);
    expect(html).not.toContain('type="file"');
    expect(html).toContain("A chart lands here");
  });

  it("canvas: with no uploader wired, the slot still offers paste-a-link", () => {
    const html = renderToStaticMarkup(
      <BlockRenderer block={EMPTY_PHOTO} globalStyle={GS} edit={{ commit: () => {} }} />,
    );
    expect(html).not.toContain("Choose a file");
    expect(html).toContain("paste an image link");
  });

  for (const [name, make] of [
    ["plain doc (EmailDocEmail)", plainDoc],
    ["grid doc (compileGrid)", gridDoc],
  ] as const) {
    it(`email — ${name}: the empty photo + chart slots are absent (no gray box)`, async () => {
      const html = await renderEmailDocHtml(make([EMPTY_PHOTO, EMPTY_CHART, ANCHOR]));
      expect(html).not.toContain("Add the photo");
      expect(html).not.toContain("Choose a file");
      expect(html).not.toContain("A chart lands here");
      expect(html).not.toContain(">Image<"); // the old placeholder box
      expect(html).toContain("View the Full Listing");
    });
  }

  it("email: an overlay panel with no photo is CONTENT and still ships", async () => {
    const overlay: EmailBlock = {
      id: "i3",
      type: "image",
      props: { url: "", overlayTitle: "Open House Saturday" },
    };
    const html = await renderEmailDocHtml(plainDoc([overlay]));
    expect(html).toContain("Open House Saturday");
  });
});

describe("filling a slot writes to the block the user is looking at", () => {
  // Both the file-picker (upload → url) and the paste-a-link form commit through the
  // ONE canvas write path: commit(blockId, "url", url) → applyTextAtPath. The image
  // block has no `url` key to overwrite when the slot is empty, so pin that the key is
  // CREATED (a missing-key no-op would swallow every upload).
  it("commit(blockId, 'url', …) fills an empty image slot", () => {
    const filled = applyTextAtPath(EMPTY_PHOTO, "url", "https://cdn.test/house.jpg");
    expect(filled.type === "image" && filled.props.url).toBe("https://cdn.test/house.jpg");
    expect(filled.type === "image" && filled.props.kind).toBe("photo"); // rest untouched
    expect(EMPTY_PHOTO.type === "image" && EMPTY_PHOTO.props.url).toBe(""); // pure
  });

  it("commit(blockId, 'stats.1.value', …) fills the empty cell in place", () => {
    const filled = applyTextAtPath(MIXED_STATS, "stats.1.value", "3.5");
    expect(filled.type === "stats" && filled.props.stats[1]).toEqual({
      value: "3.5",
      label: "Baths",
    });
  });
});

describe("text — an unwritten paragraph is an instruction, not an empty band", () => {
  it("canvas: the placeholder tells the user what to do", () => {
    const html = canvas(EMPTY_TEXT);
    expect(html).toContain('data-edit-path="body"');
    expect(html).toContain("Paste your text here");
  });

  for (const [name, make] of [
    ["plain doc (EmailDocEmail)", plainDoc],
    ["grid doc (compileGrid)", gridDoc],
  ] as const) {
    it(`email — ${name}: the empty text block does not exist`, async () => {
      const html = await renderEmailDocHtml(make([EMPTY_TEXT, ANCHOR]));
      expect(html).not.toContain("Paste your text here");
      expect(html).not.toContain("<p"); // no empty paragraph band
      expect(html).toContain("View the Full Listing");
    });
  }
});

// ── The reconciliation: New Listing (lib/email/listing-flyer.ts) ─────────────────
// Before 07/13 an unsourced spec was DROPPED at build time. That kept the naked label
// out of the email but also deleted the invitation — the operator asked for the slot
// (Baths was the example). It is now a cell with an empty value: on the canvas the
// user fills it; on the sendable paths StatsBlock drops it.
describe("listing flyer — an unsourced spec is an OPEN SLOT, not a deletion", () => {
  const sparse: ListingFacts = {
    address: "326 Shore Dr, Fort Myers, FL 33905",
    price: "$595,000",
    beds: "3",
    photos: [],
    sourceUrl: "https://x.test/listing",
  };
  const current = (): EmailDoc => SEED_DOCS.find((s) => s.id === "market-spotlight")!.build();

  it("the doc CARRIES the unsourced cells — every one an invitation, none a zero", () => {
    const doc = buildListingFlyer(sparse, current());
    const cells = doc.blocks.flatMap((b) => (b.type === "stats" ? b.props.stats : []));
    const baths = cells.find((c) => c.label === "Baths");
    expect(baths).toEqual({ value: "", label: "Baths" }); // the slot exists, empty
    expect(cells.find((c) => c.label === "Beds")?.value).toBe("3"); // sourced value stays
    for (const c of cells) expect(c.value).not.toBe("0"); // never fabricated
    // The photo slot survives as an empty dropzone rather than being dropped.
    const photo = doc.blocks.find((b) => b.type === "image" && b.props.kind === "photo");
    expect(photo?.type === "image" && photo.props.url).toBe("");
  });

  it("the SENT email carries none of them — no naked labels, no empty photo box", async () => {
    const doc = buildListingFlyer(sparse, current());
    const html = await renderEmailDocHtml(doc);
    expect(html).toContain("$595,000"); // sourced
    expect(html).toContain("Beds");
    expect(html).not.toContain("Baths"); // unsourced → absent
    expect(html).not.toContain("Sq Ft");
    expect(html).not.toContain("$/Sq Ft");
    expect(html).not.toContain("Built");
    expect(html).not.toContain("Add the photo");
    expect(html).not.toContain("Paste your text here");
  });
});
