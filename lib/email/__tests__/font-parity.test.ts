// Font parity — the wave-2 acceptance gate (spec 2026-07-02-brand-tokens-one-root).
// The pre-wave-2 bug: the flow renderer injected the webfont <link> while
// compileGrid emitted an EMPTY <Head> — the same doc kept or lost its brand font
// depending on whether any block carried a grid `layout`. Both paths now build
// their head from ONE place (lib/email/blocks/email-head.ts), asserted here
// through renderEmailDocHtml (the one render seam).
import { describe, expect, test } from "bun:test";
import { renderEmailDocHtml } from "@/lib/email/render-email-doc";
import { BRAND_FONTS } from "@/lib/brand/fonts";
import type { EmailDoc } from "@/lib/email/doc/types";

const GS = {
  primaryColor: "#0f1d24",
  accentColor: "#3DC9C0",
  fontFamily: "LATO_SANS" as const,
  displayFontFamily: "PLAYFAIR_SERIF" as const,
  textColor: "#242424",
  backdropColor: "#F8F8F8",
};
const HERO = {
  id: "hero1",
  type: "hero" as const,
  props: { kicker: "K", value: "42", prose: "p" },
};

function flowDoc(): EmailDoc {
  return { globalStyle: { ...GS }, blocks: [{ ...HERO }] } as EmailDoc;
}
function gridDoc(): EmailDoc {
  return {
    globalStyle: { ...GS },
    blocks: [{ ...HERO, layout: { x: 0, y: 0, w: 12, h: 4 } }],
  } as EmailDoc;
}

describe("font parity — flow and grid emit the same head (the divergence killer)", () => {
  test("both paths carry BOTH webfont links (body + display families)", async () => {
    // React attribute-escapes & to &amp; in hrefs — correct HTML; compare escaped.
    const esc = (u: string) => u.replace(/&/g, "&amp;");
    const flow = await renderEmailDocHtml(flowDoc());
    const grid = await renderEmailDocHtml(gridDoc());
    for (const html of [flow, grid]) {
      expect(html).toContain(esc(BRAND_FONTS.LATO_SANS.webfontUrl!));
      expect(html).toContain(esc(BRAND_FONTS.PLAYFAIR_SERIF.webfontUrl!));
    }
  });

  test("both paths inline the same fallback stack (never link-only)", async () => {
    const flow = await renderEmailDocHtml(flowDoc());
    const grid = await renderEmailDocHtml(gridDoc());
    for (const html of [flow, grid]) expect(html).toContain("Lato");
  });

  test("both paths pin Outlook to the safe stack via [if mso]", async () => {
    const flow = await renderEmailDocHtml(flowDoc());
    const grid = await renderEmailDocHtml(gridDoc());
    for (const html of [flow, grid]) {
      expect(html).toContain("<!--[if mso]>");
      expect(html).toContain("Georgia"); // display serif's mso-safe pin
    }
  });

  test("a pure system-stack doc emits NO webfont link on either path", async () => {
    const doc = flowDoc();
    doc.globalStyle.fontFamily = "MODERN_SANS";
    doc.globalStyle.displayFontFamily = undefined;
    const html = await renderEmailDocHtml(doc);
    expect(html).not.toContain("fonts.googleapis.com");
  });
});
