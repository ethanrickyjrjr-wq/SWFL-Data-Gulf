// lib/email/compile-grid.ts
//
// PAID-tier grid compiler. Turns a *positioned* EmailDoc (blocks carrying a
// `layout` {x,y,w,h}) into email-safe HTML where multi-column rows sit
// side-by-side on desktop, STACK to one column on mobile (no media queries),
// and survive Outlook (MSO ghost tables). A no-`layout` doc never reaches here —
// the render route keeps it on `EmailDocRenderer` (free tier, byte-identical).
//
// We reuse the existing `BlockRenderer` for every block's inner HTML (so the
// `kind` image tag, links, and brand styling all behave exactly as on the free
// tier) — this compiler only POSITIONS blocks, it never reimplements one.
//
// ── Why a string compiler and not pure JSX ───────────────────────────────────
// MSO conditional comments (`<!--[if mso]>…<![endif]-->`) are HTML comments.
// React strips JSX comments, and `@react-email/render` (v2.0.9) renders via
// `renderToReadableStream`, which only emits raw markup through
// `dangerouslySetInnerHTML`. So each multi-column row is assembled as an HTML
// string (block fragments + ghost-table comments) and injected through one
// `dangerouslySetInnerHTML` cell. Full-bleed rows stay real React elements.
//
// ── Cerberus hybrid/fluid pattern (verified IN-SESSION via crawl4ai 06/28/2026)─
// Source: https://www.cerberusemail.com/hybrid-responsive  (ghost-table ref:
// https://stackoverflow.design/email/base/mso#ghost-tables). Verbatim pattern:
//
//   <!--[if mso]>
//   <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
//   <tr>
//   <td width="300">
//   <![endif]-->
//   <div style="display:inline-block; width:100%; min-width:200px; max-width:300px;">
//     Column 1
//   </div>
//   <!--[if mso]>
//   </td>
//   <td width="300">
//   <![endif]-->
//   <div style="display:inline-block; width:100%; min-width:200px; max-width:300px;">
//     Column 2
//   </div>
//   <!--[if mso]>
//   </td>
//   </tr>
//   </table>
//   <![endif]-->
//
// Mechanism: each column is `display:inline-block; width:100%; max-width:Npx`.
// On a ≥600px container two 300px columns fit side-by-side; on a narrow phone
// `width:100%` exceeds the room and the second column wraps below — stacking
// WITHOUT a media query. The parent cell uses `font-size:0` to kill the
// whitespace gap between the inline-block columns. Outlook ignores the divs and
// renders the ghost `<table>`/`<td width>` at fixed desktop widths.

import { createElement } from "react";
import type { ReactNode } from "react";
import { render } from "@react-email/render";
import { Html, Head, Body, Container } from "@react-email/components";
import { emailHeadChildren, msoFontPin } from "./blocks/email-head";
import { BlockRenderer } from "./blocks/BlockRenderer";
import { colSpanToPx, GRID_COLS } from "./grid-schema";
import type { EmailBlock, EmailDoc, EmailGlobalStyle } from "./doc/types";

// `render()` always prepends this XHTML doctype (the DTD string has no interior
// `>` so the anchored, non-greedy strip below is safe). React Suspense boundary
// markers (`<!--$-->` / `<!--/$-->`) carry no content — strip them from fragments.
const DOCTYPE_RE = /^\s*<!DOCTYPE[^>]*>/i;
const SUSPENSE_MARKER_RE = /<!--\/?\$-->/g;

interface Eff {
  x: number;
  y: number;
  w: number;
  h: number;
}

function effectiveLayout(block: EmailBlock, fallbackY: number): Eff {
  const l = block.layout;
  return {
    x: l?.x ?? 0,
    y: l?.y ?? fallbackY,
    w: l?.w ?? GRID_COLS, // no layout → treat as full-bleed
    h: l?.h ?? 1,
  };
}

/**
 * Group blocks into visual rows. Blocks whose vertical band (y .. y+h) overlaps
 * the current row's running band join it; a block starting at/below the row's
 * bottom opens a new row. Within a row, blocks are ordered by `x`.
 *
 * The spec says "group by `layout.y`". This band rule is a strict SUPERSET: it
 * also handles react-grid-layout vertical compaction, where side-by-side columns
 * of UNEQUAL height get different `y` values (each pulled up independently) — an
 * exact-`y` match would split such a row into two single-block rows. We assume
 * the layout is already compacted upstream (canvas / `react-grid-layout/core`);
 * we only read positions, we don't compact.
 *
 * Blocks without a `layout` sort AFTER positioned ones (via `fallbackY`), in
 * original array order, each as its own full-bleed row.
 */
function groupRows(blocks: EmailBlock[]): EmailBlock[][] {
  const FALLBACK_BASE = 1_000_000;
  const decorated = blocks.map((block, i) => ({
    block,
    i,
    eff: effectiveLayout(block, FALLBACK_BASE + i),
  }));
  decorated.sort((a, b) => a.eff.y - b.eff.y || a.eff.x - b.eff.x || a.i - b.i);

  const rows: (typeof decorated)[] = [];
  let cur: typeof decorated = [];
  let curBottom = Number.NEGATIVE_INFINITY;
  for (const d of decorated) {
    if (cur.length === 0 || d.eff.y < curBottom) {
      cur.push(d);
      curBottom = Math.max(curBottom, d.eff.y + d.eff.h);
    } else {
      rows.push(cur);
      cur = [d];
      curBottom = d.eff.y + d.eff.h;
    }
  }
  if (cur.length) rows.push(cur);

  return rows.map((r) => [...r].sort((a, b) => a.eff.x - b.eff.x || a.i - b.i).map((d) => d.block));
}

/** Render ONE block to a self-contained HTML fragment (no doctype, no Suspense
 *  markers) by reusing the shared `BlockRenderer` — so `kind` tags, links, and
 *  brand styling are identical to the free tier. */
async function renderFragment(block: EmailBlock, globalStyle: EmailGlobalStyle): Promise<string> {
  const html = await render(createElement(BlockRenderer, { block, globalStyle }));
  return html.replace(DOCTYPE_RE, "").replace(SUSPENSE_MARKER_RE, "").trim();
}

/** Assemble the Cerberus hybrid inner HTML for a multi-column row: one ghost
 *  `<table>`/`<tr>`, a ghost `<td width>` per column, each wrapping an
 *  inline-block `<div max-width>` holding the block's fragment. */
function ghostRowHtml(cols: { html: string; px: number }[]): string {
  const totalPx = cols.reduce((sum, c) => sum + c.px, 0);
  let inner =
    `<!--[if mso]><table role="presentation" cellspacing="0" cellpadding="0" border="0" ` +
    `width="${totalPx}" align="center" style="width:${totalPx}px;"><tr><![endif]-->`;
  for (const c of cols) {
    inner += `<!--[if mso]><td width="${c.px}" valign="top" style="vertical-align:top;"><![endif]-->`;
    inner +=
      `<div style="display:inline-block;width:100%;max-width:${c.px}px;` +
      `vertical-align:top;font-size:14px;line-height:1.5;text-align:left;">${c.html}</div>`;
    inner += `<!--[if mso]></td><![endif]-->`;
  }
  inner += `<!--[if mso]></tr></table><![endif]-->`;
  return inner;
}

/**
 * Compile a positioned EmailDoc into email-safe HTML.
 *
 * Returns the rendered HTML string (matching the route's existing
 * `await render(EmailDocEmail(...))` contract). Single-block rows render the
 * block full-bleed via `BlockRenderer`; multi-block rows render the Cerberus
 * hybrid ghost-table layout. The outer shell (Html/Head/Body/Container) mirrors
 * `EmailDocRenderer` so the grid output stays structurally consistent with the
 * free tier.
 *
 * NOTE: a single block narrower than 12 columns renders full-width (we do not
 * ghost-wrap a lone column). Multi-column rows butt edge-to-edge — the grid's
 * 8px `GRID_MARGIN` gutter is not reproduced in the email (column px come from
 * `colSpanToPx`, which is gutter-agnostic). Both are acceptable for v1.
 */
export async function compileGrid(doc: EmailDoc): Promise<string> {
  const rows = groupRows(doc.blocks);
  const rowEls: ReactNode[] = [];

  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];

    // Full-bleed: a single block spans all 12 columns. Render it directly so we
    // reuse BlockRenderer (kind tag, links, brand) with no string round-trip.
    if (row.length <= 1) {
      const block = row[0];
      if (block) {
        rowEls.push(
          createElement(BlockRenderer, {
            key: block.id,
            block,
            globalStyle: doc.globalStyle,
          }),
        );
      }
      continue;
    }

    // Multi-column: Cerberus hybrid ghost-table row.
    const cols = await Promise.all(
      row.map(async (block) => ({
        html: await renderFragment(block, doc.globalStyle),
        px: colSpanToPx(block.layout?.w ?? GRID_COLS),
      })),
    );
    rowEls.push(
      createElement(
        "table",
        {
          key: `row-${ri}`,
          role: "presentation",
          width: "100%",
          cellPadding: "0",
          cellSpacing: "0",
          border: 0,
          style: { borderCollapse: "collapse", width: "100%" },
        },
        createElement(
          "tbody",
          null,
          createElement(
            "tr",
            null,
            createElement("td", {
              style: { fontSize: 0, lineHeight: 0, padding: 0, textAlign: "center" },
              dangerouslySetInnerHTML: { __html: ghostRowHtml(cols) },
            }),
          ),
        ),
      ),
    );
  }

  const tree = createElement(
    Html,
    { lang: "en" },
    createElement(Head, null, ...emailHeadChildren(doc)),
    createElement(
      Body,
      { style: { backgroundColor: doc.globalStyle.backdropColor, margin: 0, padding: 0 } },
      msoFontPin(doc),
      createElement(
        Container,
        { style: { maxWidth: "600px", margin: "0 auto", backgroundColor: "#ffffff" } },
        ...rowEls,
      ),
    ),
  );

  return render(tree);
}
