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
import type { BlockType } from "./types";

export interface BlockContractEntry {
  /** In the AI author's BLOCK VOCABULARY? false only for data-seeded `metric-card`
   *  (its held value is `metricValue`, sourced by the ZIP seed builder — an
   *  authored one would ship a placeholder number). */
  authorable: boolean;
  /** Accepts a semantic band (its props extend BlockBase → paddingY/sectionBg). */
  bandable: boolean;
  /** Present iff the user can add this block from the palette; carries its menu
   *  chrome. Absent → not user-addable (`metric-card` data-seeded, `sources`
   *  builder-seeded from held citations). */
  menu?: { label: string; icon: string };
}

export const BLOCK_CONTRACT: Record<BlockType, BlockContractEntry> = {
  header: { authorable: true, bandable: false, menu: { label: "Header", icon: "▦" } },
  hero: { authorable: true, bandable: true, menu: { label: "Big Number", icon: "◆" } },
  stats: { authorable: true, bandable: true, menu: { label: "Stats", icon: "▣" } },
  signal: { authorable: true, bandable: true, menu: { label: "Callout", icon: "❖" } },
  text: { authorable: true, bandable: true, menu: { label: "Text", icon: "¶" } },
  image: { authorable: true, bandable: true, menu: { label: "Image", icon: "▢" } },
  listing: { authorable: true, bandable: true, menu: { label: "Listing", icon: "⌂" } },
  "multi-column": { authorable: true, bandable: true, menu: { label: "Columns", icon: "▥" } },
  list: { authorable: true, bandable: true, menu: { label: "List", icon: "☰" } },
  "metric-card": { authorable: false, bandable: false },
  "agent-card": { authorable: true, bandable: false, menu: { label: "Agent Card", icon: "☻" } },
  "agent-hero": { authorable: true, bandable: false, menu: { label: "Agent Feature", icon: "◧" } },
  "social-icons": { authorable: true, bandable: false, menu: { label: "Social Icons", icon: "✦" } },
  button: { authorable: true, bandable: false, menu: { label: "Button", icon: "▭" } },
  divider: { authorable: true, bandable: false, menu: { label: "Divider", icon: "—" } },
  sources: { authorable: true, bandable: false },
  footer: { authorable: true, bandable: false, menu: { label: "Footer", icon: "▤" } },
};

const ENTRIES = Object.entries(BLOCK_CONTRACT) as [BlockType, BlockContractEntry][];

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
