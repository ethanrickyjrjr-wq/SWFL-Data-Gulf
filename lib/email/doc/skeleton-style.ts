// lib/email/doc/skeleton-style.ts
//
// NEUTRAL_SKELETON_STYLE — the placeholder palette for AUTO-SEEDED docs (the ZIP
// email prebuild). DEFAULT_GLOBAL_STYLE hardcodes SWFL's OWN navy/teal brand
// (#0f1d24 / #3DC9C0); a seed that carries those reads as an SWFL-branded template
// to a visitor who has not set a brand yet. This is grayscale/slate instead, so an
// unbranded send is visibly neutral — a skeleton waiting for a brand, not "our"
// email in disguise.
//
// This is purely a color-source swap: applyBrand()/brandGlobalStyle() already
// merge the operator's real brand tokens on top of whatever globalStyle a doc
// carries, so once the operator has a brand, this palette is fully overwritten —
// exactly as it would overwrite DEFAULT_GLOBAL_STYLE. Same shape as
// EmailGlobalStyle; fontFamily matches the house default so unbranded type is
// unchanged.

import type { EmailGlobalStyle } from "./types";

export const NEUTRAL_SKELETON_STYLE: EmailGlobalStyle = {
  primaryColor: "#1F2937", // slate-800 — headings/values
  accentColor: "#64748B", // slate-500 — bars/captions (NOT SWFL teal)
  fontFamily: "MODERN_SANS",
  textColor: "#1F2937",
  backdropColor: "#F8FAFC", // slate-50 — page backdrop
};
