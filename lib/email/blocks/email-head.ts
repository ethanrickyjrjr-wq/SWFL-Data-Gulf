// lib/email/blocks/email-head.ts
//
// THE shared font-head content both email renderers inject (flow EmailDocRenderer
// + grid compileGrid) — built in one place so the two paths cannot diverge again
// (the pre-wave-2 bug: flow had the webfont <link>, grid emitted an empty Head).
//
// Progressive enhancement (operator-locked 07/02/2026): the fallback stack is
// ALWAYS the inline font-family; these links are additive for the ~24% of clients
// honoring @font-face (caniemail css-at-font-face, fetched 07/02/2026). Outlook's
// Word engine gets an [if mso] pin forcing the SAFE stacks (its webfont handling
// otherwise lands text on Times New Roman). The pin is a raw HTML comment — React
// cannot render comments, so it ships as a dangerouslySetInnerHTML string on a
// wrapper div at body top (the same proven mechanism as compile-grid's ghost
// tables; a conditional comment INSIDE a <style> tag would be CSS text, not HTML).

import { createElement, type ReactNode } from "react";
import { BRAND_FONTS } from "@/lib/brand/fonts";
import type { EmailDoc, FontFamily } from "../doc/types";

/** Class the display-font Text nodes carry so the mso pin can target them. */
export const DISPLAY_FONT_CLASS = "bp-display";

/** The families a doc's text can render in: body + (optional distinct) display. */
function docFamilies(doc: EmailDoc): FontFamily[] {
  const { fontFamily, displayFontFamily } = doc.globalStyle;
  return displayFontFamily && displayFontFamily !== fontFamily
    ? [fontFamily, displayFontFamily]
    : [fontFamily];
}

/** Stack minus a leading webfont family — what Outlook should resolve instead. */
function safeStack(family: FontFamily): string {
  const f = BRAND_FONTS[family];
  return f.webfontUrl ? f.stack.split(",").slice(1).join(",").trim() : f.stack;
}

/** Webfont <link> elements for the families the doc actually uses (dedup'd). */
export function emailHeadChildren(doc: EmailDoc): ReactNode[] {
  const children: ReactNode[] = [];
  for (const f of docFamilies(doc)) {
    const url = BRAND_FONTS[f].webfontUrl;
    if (url) {
      children.push(createElement("link", { key: `wf-${f}`, rel: "stylesheet", href: url }));
    }
  }
  return children;
}

/** The Outlook font pin — first child of <Body> on BOTH render paths, or null
 *  when the doc uses pure system stacks (nothing to pin). */
export function msoFontPin(doc: EmailDoc): ReactNode | null {
  if (!docFamilies(doc).some((f) => BRAND_FONTS[f].webfontUrl)) return null;
  const body = safeStack(doc.globalStyle.fontFamily);
  const display = safeStack(doc.globalStyle.displayFontFamily ?? doc.globalStyle.fontFamily);
  const css =
    `body,table,td,p,a,span{font-family:${body} !important;}` +
    `.${DISPLAY_FONT_CLASS}{font-family:${display} !important;}`;
  return createElement("div", {
    key: "mso-font-pin",
    dangerouslySetInnerHTML: { __html: `<!--[if mso]><style>${css}</style><![endif]-->` },
  });
}
