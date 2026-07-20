// lib/email/doc/block-contract.test.ts
//
// M1 supply/design contract — the ONE registry every block-vocabulary consumer
// reads from (KNOWN_TYPES, the AI author vocabulary, BANDABLE, the user
// AddBlockPanel menu). These tests FREEZE today's behavior: the contract must
// derive byte-identical lists to the scattered sources it replaces, so the
// big-bang converge is provably behavior-neutral.
import { describe, expect, it } from "bun:test";
import type { BlockType } from "./types";
import { DEFAULT_BLOCK_PROPS } from "./default-docs";
import {
  BLOCK_CONTRACT,
  AUTHORABLE_TYPES,
  KNOWN_BLOCK_TYPES,
  BANDABLE_TYPES,
  BLOCK_MENU,
} from "./block-contract";

// ── Frozen expected values, copied verbatim from the pre-converge sources ──

// author-doc.ts:356 — KNOWN_TYPES = new Set(Object.keys(DEFAULT_BLOCK_PROPS))
const EXPECTED_KNOWN = Object.keys(DEFAULT_BLOCK_PROPS) as BlockType[];

// vocabulary = Object.keys(DEFAULT_BLOCK_PROPS) minus metric-card and listing —
// listing's fields are data-seeded (loadListingContext/resolveSubject), never
// AI-written; authorable:true would let the generic author offer it and ship a
// hollow card with every field defaulting to "" (postmortem 07/20/2026).
const EXPECTED_AUTHORABLE = EXPECTED_KNOWN.filter((t) => t !== "metric-card" && t !== "listing");

// author-doc.ts:448 — BANDABLE set (blocks whose props extend BlockBase)
const EXPECTED_BANDABLE: BlockType[] = [
  "hero",
  "stats",
  "signal",
  "text",
  "image",
  "listing",
  "multi-column",
  "list",
];

// AddBlockPanel.tsx:5 — the user add-block menu, in display order
const EXPECTED_MENU: { type: BlockType; label: string; icon: string }[] = [
  { type: "header", label: "Header", icon: "▦" },
  { type: "hero", label: "Big Number", icon: "◆" },
  { type: "stats", label: "Stats", icon: "▣" },
  { type: "signal", label: "Callout", icon: "❖" },
  { type: "text", label: "Text", icon: "¶" },
  { type: "image", label: "Image", icon: "▢" },
  { type: "listing", label: "Listing", icon: "⌂" },
  { type: "multi-column", label: "Columns", icon: "▥" },
  { type: "list", label: "List", icon: "☰" },
  { type: "agent-card", label: "Agent Card", icon: "☻" },
  { type: "agent-hero", label: "Agent Feature", icon: "◧" },
  { type: "social-icons", label: "Social Icons", icon: "✦" },
  { type: "button", label: "Button", icon: "▭" },
  { type: "divider", label: "Divider", icon: "—" },
  { type: "footer", label: "Footer", icon: "▤" },
];

describe("BLOCK_CONTRACT coverage", () => {
  it("has exactly one entry per BlockType (no missing, no extra)", () => {
    expect(Object.keys(BLOCK_CONTRACT).sort()).toEqual([...EXPECTED_KNOWN].sort());
  });

  it("is ordered in DEFAULT_BLOCK_PROPS insertion order (so derivations stay byte-identical)", () => {
    expect(Object.keys(BLOCK_CONTRACT)).toEqual(EXPECTED_KNOWN);
  });
});

describe("derived lists match the pre-converge sources", () => {
  it("KNOWN_BLOCK_TYPES == every DEFAULT_BLOCK_PROPS key (author-doc KNOWN_TYPES)", () => {
    expect([...KNOWN_BLOCK_TYPES].sort()).toEqual([...EXPECTED_KNOWN].sort());
  });

  it("AUTHORABLE_TYPES == vocabulary (all keys minus metric-card), same order (build-doc:922)", () => {
    expect(AUTHORABLE_TYPES).toEqual(EXPECTED_AUTHORABLE);
    expect(AUTHORABLE_TYPES).not.toContain("metric-card");
  });

  it("BANDABLE_TYPES == the author-doc BANDABLE set", () => {
    expect([...BANDABLE_TYPES].sort()).toEqual([...EXPECTED_BANDABLE].sort());
  });

  it("BLOCK_MENU == AddBlockPanel menu, exact entries and order", () => {
    expect(BLOCK_MENU).toEqual(EXPECTED_MENU);
  });

  it("BLOCK_MENU excludes the two non-user-addable types (metric-card, sources)", () => {
    const menuTypes = BLOCK_MENU.map((m) => m.type);
    expect(menuTypes).not.toContain("metric-card");
    expect(menuTypes).not.toContain("sources");
  });
});
