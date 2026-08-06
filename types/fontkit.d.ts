// fontkit 2.0.4 ships no types and no @types package. This is the NARROW surface
// lib/brand/text-metrics.ts uses — advance widths out of a bundled TTF. Deliberately
// not a full typing of the library: anything wider invites use we have not verified.
declare module "fontkit" {
  interface FontkitGlyphRun {
    /** Sum of the run's advance widths, in font design units. */
    advanceWidth: number;
  }
  interface FontkitFont {
    /** Design units per em — divide an advance by this, multiply by px size. */
    unitsPerEm: number;
    /** Shapes a string and returns its advance run. */
    layout(text: string): FontkitGlyphRun;
  }
  /** Throws on an unreadable/absent path; callers MUST catch (see text-metrics).
   *  NAMED import only — fontkit 2.0.4's ESM entry (dist/module.mjs) has NO default
   *  export, so `import fontkit from "fontkit"` throws at load under Bun and ESM Node. */
  export function openSync(path: string): FontkitFont;
}
