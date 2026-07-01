import { SWFL_THEME } from "@/scripts/email/types";
import { SWFL_TOKEN_DEFAULTS } from "../token-defaults";
import { readableLabel } from "@/lib/charts/palette";

// Section 3 (S3) — shared helpers for the email-safe visual components.
//
// Colors derive from SWFL_THEME / SWFL_TOKEN_DEFAULTS — never re-hardcode those
// hex values (same single-source rule the chart layer follows). Every component
// emits a self-contained HTML string: inline styles only, no <script>/<canvas>/
// <style>, ≤600px wide, all data escaped.

export const COMPONENT_DEFAULTS = {
  primary: SWFL_THEME.primary, // #0f1d24 — headings, value text
  accent: SWFL_THEME.accent, // #3DC9C0 — badges, info callouts
  surface: SWFL_TOKEN_DEFAULTS.SURFACE, // #ffffff — stat-row background
  text: SWFL_TOKEN_DEFAULTS.TEXT, // #111827 — body copy
  neutral: "#6B7280", // muted labels / flat delta
  warn: "#F59E0B", // amber — warn callout
  positive: "#16A34A", // green — delta up
  negative: "#DC2626", // red — delta down
  // Web fonts are unavailable in email clients, so components fall back to a
  // universally-installed family — matches the chart layer for visual coherence.
  font: "Arial, sans-serif",
} as const;

/** HTML-escape so data-derived content can never break markup or an attribute. */
export function esc(s: string | number): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Dark (#111827) or white (#ffffff) text, whichever has real WCAG-2 contrast on
 * `bg` (delegates to readableLabel — was a rec601 luma heuristic). Non-hex colors
 * (named/rgb()) resolve to white (white beats dark ink on the L=0 fallback).
 */
export function readableText(bg: string): string {
  return readableLabel(bg, { dark: "#111827", light: "#ffffff" });
}
