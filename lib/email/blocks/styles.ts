// lib/email/blocks/styles.ts
//
// Shared style atoms for the pure block components. No React — just constants +
// a font-family resolver, so blocks stay consistent across the canvas DOM view
// and the server render() export.

import type { FontFamily, PaddingSize } from "../doc/types";

const FONT_STACKS: Record<FontFamily, string> = {
  MODERN_SANS: "Inter, -apple-system, 'Helvetica Neue', Arial, sans-serif",
  BOOK_SERIF: "Georgia, 'Times New Roman', Times, serif",
  GEOMETRIC_SANS: "'Century Gothic', 'Trebuchet MS', Futura, sans-serif",
};

export function fontStack(family: FontFamily): string {
  return FONT_STACKS[family];
}

const PAD_Y: Record<PaddingSize, string> = {
  none: "0px 28px",
  sm: "12px 28px",
  md: "24px 28px",
  lg: "36px 28px",
};

export function sectionPad(paddingY?: PaddingSize): string {
  return PAD_Y[paddingY ?? "md"];
}

export const SECTION_PAD = "24px 28px";
export const MUTED = "#6B7280";
export const BORDER = "#E5E7EB";
export const CARD_BG = "#ffffff";
