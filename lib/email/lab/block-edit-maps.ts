// lib/email/lab/block-edit-maps.ts — which props the canvas pill popovers edit.
// LINK: the block-level click-through (list/multi-column per-row links stay in
// the inspector). COLOR: the box the type actually paints — bgColor where the
// component reads it (header/signal/button), else the BlockBase sectionBg.
import type { BlockType } from "@/lib/email/doc/types";

export const LINK_PROP: Partial<Record<BlockType, string>> = {
  hero: "linkUrl",
  signal: "linkUrl",
  text: "linkUrl",
  image: "linkUrl",
  listing: "linkUrl",
  button: "url",
  "agent-card": "ctaUrl",
  "agent-hero": "ctaUrl",
};

export const COLOR_PROP: Partial<Record<BlockType, string>> = {
  header: "bgColor",
  signal: "bgColor",
  button: "bgColor",
  hero: "sectionBg",
  stats: "sectionBg",
  text: "sectionBg",
  image: "sectionBg",
  listing: "sectionBg",
  "multi-column": "sectionBg",
  list: "sectionBg",
  "metric-card": "sectionBg",
};
