// lib/brand/fonts.ts
//
// THE one font root (wave 2, spec 2026-07-02-brand-tokens-one-root). Every render
// engine resolves fonts from this Record — email stacks (lib/email/blocks/styles.ts
// re-derives), webfont <link>s, PDF built-ins (lib/pdf/email-doc-pdf.tsx), and the
// server canvas (resvg — bundled faces, the lib/charts/chart-fonts pattern
// generalized). Record<FontFamily, …> means a new font CANNOT ship without
// a complete entry here AND a FONT_ROUTING target (both keyed on FontFamily).
//
// Email policy (operator-locked 07/02/2026): progressive enhancement, auto-safe,
// no toggles. `stack` is ALWAYS the inline font-family value; `webfontUrl` is an
// additive <Head> link for the ~24% of clients honoring @font-face (caniemail,
// fetched 07/02/2026); Outlook is pinned to the stack via an [if mso] override
// (its @font-face bug otherwise lands on Times New Roman).
//
// CANVAS FONTS ARE THE BRAND'S OWN FACES (operator decree 08/06/2026, on a real render:
// "the font looks fucking different"). Until this date every server-rasterized chart came
// out in Liberation Sans regardless of brand — the 15 SVG builders hardcode
// `font-family="Arial"`, which is never a loaded family, so resvg resolved every label
// through a single pinned `defaultFontFamily`. A bold chart title therefore sat inside a
// Montserrat email in an Arial clone, always. `canvasFamily`/`canvasFiles` carry the REAL
// face per brand; the builders' Arial literals are deliberately NOT touched, because that
// fallback is the mechanism the renderer already documents — pointing it at the brand
// fixes all 15 builders at once and adds no new machinery.
//
// The faces are static Regular/Bold instances from the Google Fonts css2 endpoint
// (verified live 08/06/2026: it serves per-weight TTFs to a legacy UA, which sidesteps
// resvg 2.6.2's variable-axis limits). All six are SIL OFL — see LICENSE-GoogleFonts.txt.

import path from "node:path";
import type { FontFamily } from "@/lib/email/doc/types";

export interface BrandFont {
  /** Picker label. */
  label: string;
  /** Email-safe fallback stack — ALWAYS present inline in output. */
  stack: string;
  /** Google Fonts CSS2 <link>; omitted = pure system family. Additive only. */
  webfontUrl?: string;
  /** react-pdf built-in (v1: no Font.register — upgrade path is a pdfRegister field). */
  pdf: "Helvetica" | "Times-Roman";
  /** REAL bundled family for server-rasterized charts — handed to resvg as the fallback
   *  for the SVG builders' hardcoded "Arial", so a chart renders in the SAME typeface as
   *  the email body around it. Georgia and Century Gothic are PROPRIETARY and cannot be
   *  bundled; those two name an OFL substitute (metric-compatible where one exists). */
  canvasFamily: string;
  /** The two bundled faces backing `canvasFamily` — [Regular, Bold], basenames under
   *  assets/fonts. Bold is a REAL face so `font-weight:bold` (every chart title and value
   *  label in this codebase) resolves instead of being synthesized into a smear. */
  canvasFiles: [string, string];
  /** Browser stack for the Konva client canvas (preview + client PNG export). */
  previewStack: string;
}

export const BRAND_FONTS: Record<FontFamily, BrandFont> = {
  MODERN_SANS: {
    label: "Modern Sans",
    stack: "Inter, -apple-system, 'Helvetica Neue', Arial, sans-serif",
    pdf: "Helvetica",
    canvasFamily: "Inter",
    canvasFiles: ["Inter-Regular.ttf", "Inter-Bold.ttf"],
    previewStack: "Inter, -apple-system, 'Helvetica Neue', Arial, sans-serif",
  },
  BOOK_SERIF: {
    label: "Book Serif",
    stack: "Georgia, 'Times New Roman', Times, serif",
    pdf: "Times-Roman",
    // Georgia is proprietary. Gelasio is METRIC-COMPATIBLE with Georgia in Regular and
    // Bold (verified on fonts.google.com/specimen/Gelasio/about, 08/06/2026), so the
    // hand-rolled SVG builders' Arial-era padding still lands where it was measured.
    canvasFamily: "Gelasio",
    canvasFiles: ["Gelasio-Regular.ttf", "Gelasio-Bold.ttf"],
    previewStack: "Georgia, 'Times New Roman', Times, serif",
  },
  GEOMETRIC_SANS: {
    label: "Geometric Sans",
    stack: "'Century Gothic', 'Trebuchet MS', Futura, sans-serif",
    pdf: "Helvetica",
    // Century Gothic is proprietary and has NO metric-compatible OFL twin. Jost is a
    // Futura revival — the same geometric skeleton this stack reaches for. Called out as a
    // STYLE match, not a metric one: labels here can run slightly wider than Arial.
    canvasFamily: "Jost",
    canvasFiles: ["Jost-Regular.ttf", "Jost-Bold.ttf"],
    previewStack: "'Century Gothic', 'Trebuchet MS', Futura, sans-serif",
  },
  PLAYFAIR_SERIF: {
    label: "Playfair Display",
    stack: "'Playfair Display', Georgia, 'Times New Roman', serif",
    webfontUrl:
      "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&display=swap",
    pdf: "Times-Roman",
    canvasFamily: "Playfair Display",
    canvasFiles: ["PlayfairDisplay-Regular.ttf", "PlayfairDisplay-Bold.ttf"],
    previewStack: "'Playfair Display', Georgia, 'Times New Roman', serif",
  },
  LATO_SANS: {
    label: "Lato",
    stack: "'Lato', -apple-system, 'Helvetica Neue', Arial, sans-serif",
    webfontUrl: "https://fonts.googleapis.com/css2?family=Lato:wght@400;700&display=swap",
    pdf: "Helvetica",
    canvasFamily: "Lato",
    canvasFiles: ["Lato-Regular.ttf", "Lato-Bold.ttf"],
    previewStack: "'Lato', -apple-system, 'Helvetica Neue', Arial, sans-serif",
  },
  MONTSERRAT_SANS: {
    label: "Montserrat",
    // FALLBACK RE-CHECKED 08/05/2026 (caniemail.com, re-crawled — the 07/02/2026 finding above
    // still holds: ~24% @font-face support, Gmail webmail not among them). 'Century Gothic' and
    // 'Trebuchet MS' are legacy Windows-desktop fonts absent on mobile and Gmail's own renderer —
    // for the ~76% without webfont support this chain skipped both and landed on bare
    // `sans-serif` anyway, so neither fallback name was doing real work. A real, universal
    // system-font stack renders something intentional there instead of the OS's bare default.
    stack: "'Montserrat', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
    webfontUrl: "https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700&display=swap",
    pdf: "Helvetica",
    canvasFamily: "Montserrat",
    canvasFiles: ["Montserrat-Regular.ttf", "Montserrat-Bold.ttf"],
    previewStack: "'Montserrat', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
  },
};

const FONT_DIR = path.join(process.cwd(), "assets", "fonts");

/** Absolute paths of the two faces backing a brand — resvg `font.fontFiles`. */
export function canvasFilesFor(family: FontFamily): string[] {
  const entry = BRAND_FONTS[family] ?? BRAND_FONTS.MODERN_SANS;
  return entry.canvasFiles.map((f) => path.join(FONT_DIR, f));
}

/** The resvg family name for a brand — the target the builders' "Arial" falls back to.
 *  An unknown key degrades to the product default rather than to nothing (a family with
 *  no loaded face renders every label BLANK, silently — the original landmine). */
export function canvasFamilyFor(family: FontFamily): string {
  return (BRAND_FONTS[family] ?? BRAND_FONTS.MODERN_SANS).canvasFamily;
}

/** All bundled canvas faces — DERIVED from the Record, never hand-listed, so a new brand
 *  font cannot ship with an entry whose file was never added to the load list. */
export const CANVAS_FONT_FILES: string[] = [
  ...new Set(
    (Object.keys(BRAND_FONTS) as FontFamily[]).flatMap((f) =>
      BRAND_FONTS[f].canvasFiles.map((file) => path.join(FONT_DIR, file)),
    ),
  ),
];

/** resvg `defaultFontFamily` when a build carries no brand — unknown families land here,
 *  never on nothing. The product default (MODERN_SANS), not a generic Arial clone. */
export const CANVAS_DEFAULT_FAMILY = BRAND_FONTS.MODERN_SANS.canvasFamily;

/** Type guard for brand-blob font values — unknown keys are skipped, never CSS. */
export function isFontFamily(v: string): v is FontFamily {
  return Object.prototype.hasOwnProperty.call(BRAND_FONTS, v);
}
