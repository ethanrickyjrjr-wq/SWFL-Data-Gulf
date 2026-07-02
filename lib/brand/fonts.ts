// lib/brand/fonts.ts
//
// THE one font root (wave 2, spec 2026-07-02-brand-tokens-one-root). Every render
// engine resolves fonts from this Record — email stacks (lib/email/blocks/styles.ts
// re-derives), webfont <link>s, PDF built-ins (lib/pdf/email-doc-pdf.tsx), and the
// server canvas (resvg — bundled Liberation faces, the lib/charts/chart-fonts
// pattern generalized). Record<FontFamily, …> means a new font CANNOT ship without
// a complete entry here AND a FONT_ROUTING target (both keyed on FontFamily).
//
// Email policy (operator-locked 07/02/2026): progressive enhancement, auto-safe,
// no toggles. `stack` is ALWAYS the inline font-family value; `webfontUrl` is an
// additive <Head> link for the ~24% of clients honoring @font-face (caniemail,
// fetched 07/02/2026); Outlook is pinned to the stack via an [if mso] override
// (its @font-face bug otherwise lands on Times New Roman).

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
  /** Family name in server-rasterized SVG text — covered by CANVAS_FONT_FILES. */
  canvasSvg: "Liberation Sans" | "Liberation Serif";
  /** Browser stack for the Konva client canvas (preview + client PNG export). */
  previewStack: string;
}

export const BRAND_FONTS: Record<FontFamily, BrandFont> = {
  MODERN_SANS: {
    label: "Modern Sans",
    stack: "Inter, -apple-system, 'Helvetica Neue', Arial, sans-serif",
    pdf: "Helvetica",
    canvasSvg: "Liberation Sans",
    previewStack: "Inter, -apple-system, 'Helvetica Neue', Arial, sans-serif",
  },
  BOOK_SERIF: {
    label: "Book Serif",
    stack: "Georgia, 'Times New Roman', Times, serif",
    pdf: "Times-Roman",
    canvasSvg: "Liberation Serif",
    previewStack: "Georgia, 'Times New Roman', Times, serif",
  },
  GEOMETRIC_SANS: {
    label: "Geometric Sans",
    stack: "'Century Gothic', 'Trebuchet MS', Futura, sans-serif",
    pdf: "Helvetica",
    canvasSvg: "Liberation Sans",
    previewStack: "'Century Gothic', 'Trebuchet MS', Futura, sans-serif",
  },
  PLAYFAIR_SERIF: {
    label: "Playfair Display",
    stack: "'Playfair Display', Georgia, 'Times New Roman', serif",
    webfontUrl:
      "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&display=swap",
    pdf: "Times-Roman",
    canvasSvg: "Liberation Serif",
    previewStack: "'Playfair Display', Georgia, 'Times New Roman', serif",
  },
  LATO_SANS: {
    label: "Lato",
    stack: "'Lato', -apple-system, 'Helvetica Neue', Arial, sans-serif",
    webfontUrl: "https://fonts.googleapis.com/css2?family=Lato:wght@400;700&display=swap",
    pdf: "Helvetica",
    canvasSvg: "Liberation Sans",
    previewStack: "'Lato', -apple-system, 'Helvetica Neue', Arial, sans-serif",
  },
  MONTSERRAT_SANS: {
    label: "Montserrat",
    stack: "'Montserrat', 'Century Gothic', 'Trebuchet MS', sans-serif",
    webfontUrl: "https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700&display=swap",
    pdf: "Helvetica",
    canvasSvg: "Liberation Sans",
    previewStack: "'Montserrat', 'Century Gothic', 'Trebuchet MS', sans-serif",
  },
};

const FONT_DIR = path.join(process.cwd(), "assets", "fonts");

/** All bundled canvas faces — resvg `font.fontFiles`. Regular + Bold per family so
 *  `font-weight:bold` resolves to a real bold face, not a synthesized smear. */
export const CANVAS_FONT_FILES: string[] = [
  path.join(FONT_DIR, "LiberationSans-Regular.ttf"),
  path.join(FONT_DIR, "LiberationSans-Bold.ttf"),
  path.join(FONT_DIR, "LiberationSerif-Regular.ttf"),
  path.join(FONT_DIR, "LiberationSerif-Bold.ttf"),
];

/** resvg `defaultFontFamily` — unknown families land here, never on nothing. */
export const CANVAS_DEFAULT_FAMILY = "Liberation Sans";

/** Type guard for brand-blob font values — unknown keys are skipped, never CSS. */
export function isFontFamily(v: string): v is FontFamily {
  return Object.prototype.hasOwnProperty.call(BRAND_FONTS, v);
}
