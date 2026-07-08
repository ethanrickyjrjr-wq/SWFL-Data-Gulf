// render-static.tsx — THE bridge that makes one vendored bklit component
// render BOTH surfaces: the live web frame (client, animated, via ParentSize)
// and a static email PNG (server, single-pass, via `staticSize`). Proven live
// 2026-07-08: BarChart forked with `staticSize`+`initialLoaded` renders real,
// correctly-scaled bar geometry through a single-pass server render (not
// blank/0×0) — see the spike PNG in that session. Line/Area/Composed only
// need `staticSize` (their reveal state already syncs to `status="ready"`
// synchronously, no `initialLoaded` needed — see NOTICE.md).
//
// Uses `@react-email/render`'s `render()` (already a dependency —
// lib/email/render-email-doc.ts renders the whole EmailDoc through it) rather
// than importing `react-dom/server` directly: Next's App Router treats a
// direct `react-dom/server` import in any traced .tsx file as an illegal
// nested-render (the RSC double-renderer guard), even when — as here — the
// call only ever runs inside a Node API route, nowhere near the page's own
// RSC tree. `@react-email/render` is exempt because Next doesn't apply that
// check inside node_modules; it wraps the identical renderToStaticMarkup call.
//
// Callers pass a bklit chart element (already given `staticSize={{width,
// height}}`) — this module only does the SSR mechanics: wrap in
// `StaticChartPreviewProvider` (kills the upstream cartesian reveal
// clip-path — a docs-preview feature bklit ships for exactly this), render to
// a string, and hand back a well-formed standalone SVG string ready for
// `@resvg/resvg-js` (the same rasterizer `lib/email/chart-image.ts` uses for
// every other email chart).
import { render } from "@react-email/render";
import type { ReactElement } from "react";
import { StaticChartPreviewProvider } from "./static-chart-preview-context";

export interface StaticRenderSize {
  width: number;
  height: number;
}

/** Render a bklit chart element to a standalone SVG string. Returns `null`
 *  (never throws) when the element didn't produce an `<svg>` — a defensive
 *  guard, not an expected path once a shape is wired up correctly; the caller
 *  falls back to the existing hand-built SVG producer (RULE 0.7, best-effort). */
export async function renderBklitStaticSvg(element: ReactElement): Promise<string | null> {
  try {
    const html = await render(<StaticChartPreviewProvider>{element}</StaticChartPreviewProvider>);
    const match = html.match(/<svg[\s\S]*?<\/svg>/);
    if (!match) return null;
    return match[0].replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ');
  } catch {
    return null;
  }
}
