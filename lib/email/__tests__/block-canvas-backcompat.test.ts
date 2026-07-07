import { describe, expect, it } from "bun:test";
import { renderEmailDocHtml } from "../render-email-doc";
import type { EmailDoc } from "../doc/types";

// ── RETIRE-BLOCK-SHELL BACKWARD-COMPAT GUARD (2026-07-07) ─────────────────────
// The block *editor* (EmailLabShell/BlockCanvas) was deleted when the lab went
// grid-only. Deliverables saved with template:"block-canvas" — a doc whose blocks
// carry NO `layout` — still live in the DB and must keep rendering + sending. Every
// send/preview surface (render route, blast route, scheduled-send) turns such a doc
// into HTML through renderEmailDocHtml (see its header). This locks that path: a
// layout-less doc renders through the free EmailDocEmail branch, never the grid
// compiler. If a future edit drops block-canvas support, this reds.

const BLOCK_CANVAS_DOC: EmailDoc = {
  globalStyle: {
    primaryColor: "#0f1d24",
    accentColor: "#3DC9C0",
    fontFamily: "MODERN_SANS",
    textColor: "#242424",
    backdropColor: "#F8F8F8",
  },
  // No `layout` on any block — this is the exact shape a saved block-canvas
  // deliverable holds.
  blocks: [
    {
      id: "b1",
      type: "header",
      props: { companyName: "SWFL Data Gulf", tagline: "Gulf Coast Intel" },
    },
    {
      id: "b2",
      type: "text",
      props: { body: "Saved before the block editor retired.", align: "left" },
    },
    {
      id: "b3",
      type: "footer",
      props: {
        companyName: "SWFL Data Gulf",
        address: "123 Main St, Fort Myers, FL 33901",
        websiteUrl: "https://swfldatagulf.com",
      },
    },
  ],
};

describe("block-canvas deliverables survive the grid-only retirement", () => {
  it("a layout-less (block-canvas) doc still renders to a full HTML email", async () => {
    const html = await renderEmailDocHtml(BLOCK_CANVAS_DOC);
    expect(typeof html).toBe("string");
    expect(html.length).toBeGreaterThan(100);
    expect(html).toMatch(/<html/i);
    expect(html).toMatch(/<body/i);
    // content from every block made it through
    expect(html).toContain("Gulf Coast Intel");
    expect(html).toContain("Saved before the block editor retired.");
    expect(html).toContain("swfldatagulf.com");
  });

  it("a grid doc (blocks with layout) still compiles through the grid path", async () => {
    const gridDoc: EmailDoc = {
      ...BLOCK_CANVAS_DOC,
      blocks: BLOCK_CANVAS_DOC.blocks.map((b, i) => ({
        ...b,
        layout: { x: 0, y: i * 4, w: 12, h: 4 },
      })),
    };
    const html = await renderEmailDocHtml(gridDoc);
    expect(html.length).toBeGreaterThan(100);
    expect(html).toContain("Saved before the block editor retired.");
  });
});
