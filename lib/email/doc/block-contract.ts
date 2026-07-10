// lib/email/doc/block-contract.ts
//
// THE supply/design contract — one entry per BlockType, the single source of
// truth for block-vocabulary metadata that used to live in four drifting places:
//   • author-doc.ts  KNOWN_TYPES         → KNOWN_BLOCK_TYPES
//   • build-doc.ts    author vocabulary  → AUTHORABLE_TYPES
//   • author-doc.ts  BANDABLE set        → BANDABLE_TYPES
//   • AddBlockPanel.tsx  BLOCK_MENU      → BLOCK_MENU
// Add a block type once, here, and every consumer picks it up. PURE data — no
// React, no imports beyond the BlockType contract. Default props still live in
// default-docs.ts (DEFAULT_BLOCK_PROPS); this file owns the *behavioral* metadata.
//
// ORDER MATTERS: entries are listed in DEFAULT_BLOCK_PROPS insertion order, so a
// `.filter(...)` derivation reproduces the pre-converge lists byte-for-byte
// (proven in block-contract.test.ts). Keep new entries in sync with that order.
import type { BlockType, PhotoRatio } from "./types";

/** Fence 2 — the vertical zone a block belongs to. OPEN blocks lead (masthead),
 *  CLOSE blocks trail (footer / sources), everything else is BODY. The AI author is
 *  hard-sorted into zone order at assembly (`deriveLayout`); the canvas advises the
 *  user but never blocks (fences are hard for the AI, soft for the user). */
export type BlockZone = "open" | "body" | "close";

export interface BlockContractEntry {
  /** In the AI author's BLOCK VOCABULARY? false only for data-seeded `metric-card`
   *  (its held value is `metricValue`, sourced by the ZIP seed builder — an
   *  authored one would ship a placeholder number). */
  authorable: boolean;
  /** Accepts a semantic band (its props extend BlockBase → paddingY/sectionBg). */
  bandable: boolean;
  /** Fence 2 zone (see BlockZone). */
  zone: BlockZone;
  /** Present iff the user can add this block from the palette; carries its menu
   *  chrome. Absent → not user-addable (`metric-card` data-seeded, `sources`
   *  builder-seeded from held citations). */
  menu?: { label: string; icon: string };
}

export const BLOCK_CONTRACT: Record<BlockType, BlockContractEntry> = {
  header: { authorable: true, bandable: false, zone: "open", menu: { label: "Header", icon: "▦" } },
  hero: {
    authorable: true,
    bandable: true,
    zone: "body",
    menu: { label: "Big Number", icon: "◆" },
  },
  stats: { authorable: true, bandable: true, zone: "body", menu: { label: "Stats", icon: "▣" } },
  signal: { authorable: true, bandable: true, zone: "body", menu: { label: "Callout", icon: "❖" } },
  text: { authorable: true, bandable: true, zone: "body", menu: { label: "Text", icon: "¶" } },
  image: { authorable: true, bandable: true, zone: "body", menu: { label: "Image", icon: "▢" } },
  listing: {
    authorable: true,
    bandable: true,
    zone: "body",
    menu: { label: "Listing", icon: "⌂" },
  },
  "multi-column": {
    authorable: true,
    bandable: true,
    zone: "body",
    menu: { label: "Columns", icon: "▥" },
  },
  list: { authorable: true, bandable: true, zone: "body", menu: { label: "List", icon: "☰" } },
  "metric-card": { authorable: false, bandable: false, zone: "body" },
  "agent-card": {
    authorable: true,
    bandable: false,
    zone: "body",
    menu: { label: "Agent Card", icon: "☻" },
  },
  "agent-hero": {
    authorable: true,
    bandable: false,
    zone: "body",
    menu: { label: "Agent Feature", icon: "◧" },
  },
  "social-icons": {
    authorable: true,
    bandable: false,
    zone: "close",
    menu: { label: "Social Icons", icon: "✦" },
  },
  button: { authorable: true, bandable: false, zone: "body", menu: { label: "Button", icon: "▭" } },
  divider: {
    authorable: true,
    bandable: false,
    zone: "body",
    menu: { label: "Divider", icon: "—" },
  },
  sources: { authorable: true, bandable: false, zone: "close" },
  footer: {
    authorable: true,
    bandable: false,
    zone: "close",
    menu: { label: "Footer", icon: "▤" },
  },
};

const ENTRIES = Object.entries(BLOCK_CONTRACT) as [BlockType, BlockContractEntry][];

// ── The variety space (fences = the bounds, not one forced look) ──────────────
// These constants are the registry half of every fence: the AI path clamps INTO
// them (hard), the canvas guides the user AROUND them (soft). One definition, two
// enforcement sites — see lib/email/author-doc.ts (hard) and the grid canvas (soft).

/** Fence 2 — sort rank per zone (open leads, close trails). */
export const ZONE_RANK: Record<BlockZone, number> = { open: 0, body: 1, close: 2 };

/** Fence 1 — the blessed row-span multisets (the layout variety space). A row of
 *  N blocks is snapped to the nearest of these; each multiset is sorted descending
 *  and the caller restores the original orientation. `{6,6}` and `{12}` are blessed,
 *  so today's side-by-side and full-bleed rows are unchanged; `{8,4}` keeps the
 *  seeded photo+text split legal (unordered — `[4,8]` and `[8,4]` are the same set). */
export const BLESSED_ROW_SPANS: Record<number, number[][]> = {
  1: [[12]],
  2: [
    [6, 6],
    [8, 4],
    [7, 5],
  ],
  3: [[4, 4, 4]],
};

/** Fence 5 — at most this many accent bands per email (emphasis is budgeted, not
 *  banned). The AI author is clamped to it at assembly; the canvas warns the user. */
export const ACCENT_BUDGET = 2;

/** Fence 3 — the blessed photo aspect ratios (the photo-size variety axis).
 *  16:9 is the wide banner cut (magazine/luxury full-bleed heroes). */
export const PHOTO_RATIOS: readonly PhotoRatio[] = ["3:2", "4:3", "4:5", "1:1", "16:9"];
export const DEFAULT_PHOTO_RATIO: PhotoRatio = "3:2";

/** Every legal block type (author-doc.ts KNOWN_TYPES). */
export const KNOWN_BLOCK_TYPES: ReadonlySet<BlockType> = new Set(ENTRIES.map(([t]) => t));

/** The AI author's BLOCK VOCABULARY, in prompt order (build-doc.ts vocabulary). */
export const AUTHORABLE_TYPES: BlockType[] = ENTRIES.filter(([, e]) => e.authorable).map(
  ([t]) => t,
);

/** Blocks that accept a semantic band (author-doc.ts BANDABLE). */
export const BANDABLE_TYPES: ReadonlySet<BlockType> = new Set(
  ENTRIES.filter(([, e]) => e.bandable).map(([t]) => t),
);

/** The user add-block palette, in display order (AddBlockPanel.tsx BLOCK_MENU). */
export const BLOCK_MENU: { type: BlockType; label: string; icon: string }[] = ENTRIES.filter(
  ([, e]) => e.menu,
).map(([type, e]) => ({ type, label: e.menu!.label, icon: e.menu!.icon }));
