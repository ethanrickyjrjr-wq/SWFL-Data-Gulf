import { describe, expect, it } from "bun:test";
import { render } from "@react-email/render";
import { EmailDocEmail } from "./blocks/EmailDocRenderer";
import { renderEmailDocHtml } from "./render-email-doc";
import type { EmailDoc } from "./doc/types";

const STYLE: EmailDoc["globalStyle"] = {
  primaryColor: "#0f1d24",
  accentColor: "#3DC9C0",
  fontFamily: "MODERN_SANS",
  textColor: "#242424",
  backdropColor: "#F8F8F8",
};

/** Free-tier doc: no block carries a `layout`. */
const FREE_DOC: EmailDoc = {
  globalStyle: STYLE,
  blocks: [
    { id: "f1", type: "text", props: { body: "Free-tier body copy.", align: "left" } },
    {
      id: "f2",
      type: "button",
      props: { label: "View Report", url: "https://example.com/report", bgColor: "#3DC9C0" },
    },
  ],
};

/** Paid grid doc: two half-width blocks side by side on the same row. */
const GRID_DOC: EmailDoc = {
  globalStyle: STYLE,
  blocks: [
    {
      id: "g1",
      type: "text",
      props: { body: "Left column copy.", align: "left" },
      layout: { x: 0, y: 0, w: 6, h: 4 },
    },
    {
      id: "g2",
      type: "text",
      props: { body: "Right column copy.", align: "left" },
      layout: { x: 6, y: 0, w: 6, h: 4 },
    },
  ],
};

/** The seed shape that overflowed the 600px container (07/10/2026 captures):
 *  a hero beside a 3-cell stats block in a half-width column. Unbreakable 32px
 *  values force the stats table wider than its ghost column — the narrow
 *  variant must stack instead. */
const NARROW_STATS_DOC: EmailDoc = {
  globalStyle: STYLE,
  blocks: [
    {
      id: "n1",
      type: "hero",
      props: { kicker: "Price Reduced", value: "−$25,000", label: "New Asking Price", prose: "" },
      layout: { x: 0, y: 0, w: 6, h: 4 },
    },
    {
      id: "n2",
      type: "stats",
      props: {
        stats: [
          { value: "$630,000", label: "Original Price" },
          { value: "−$25,000", label: "Price Drop" },
          { value: "83 days", label: "Days on Market" },
        ],
      },
      layout: { x: 6, y: 0, w: 6, h: 4 },
    },
  ],
};

/** Same stats full-width — the classic side-by-side row must NOT stack. */
const WIDE_STATS_DOC: EmailDoc = {
  globalStyle: STYLE,
  blocks: [
    {
      id: "w1",
      type: "stats",
      props: {
        stats: [
          { value: "$630,000", label: "Original Price" },
          { value: "−$25,000", label: "Price Drop" },
          { value: "83 days", label: "Days on Market" },
        ],
      },
      layout: { x: 0, y: 0, w: 12, h: 4 },
    },
  ],
};

describe("renderEmailDocHtml — the ONE EmailDoc→HTML root", () => {
  it("free doc (no layout) is byte-identical to render(EmailDocEmail(...))", async () => {
    const viaRoot = await renderEmailDocHtml(FREE_DOC);
    const direct = await render(EmailDocEmail({ doc: FREE_DOC }));
    expect(viaRoot).toBe(direct);
  });

  it("grid doc compiles positioned columns (Outlook ghost tables), not the free stacker", async () => {
    const html = await renderEmailDocHtml(GRID_DOC);
    // compile-grid's multi-column row emits the mso ghost-table wrapper the
    // free renderer never produces — the exact divergence the blast route shipped.
    expect(html).toContain("<!--[if mso]>");
    expect(html).toContain("Left column copy.");
    expect(html).toContain("Right column copy.");
    const freeStacked = await render(EmailDocEmail({ doc: GRID_DOC }));
    expect(html).not.toBe(freeStacked);
  });

  it("a 3-cell stats block in a half-width grid column renders the stacked variant", async () => {
    const html = await renderEmailDocHtml(NARROW_STATS_DOC);
    expect(html).toContain('data-stats-variant="stacked"');
    expect(html).toContain("$630,000");
  });

  it("a full-width stats block keeps the classic side-by-side row", async () => {
    const html = await renderEmailDocHtml(WIDE_STATS_DOC);
    expect(html).not.toContain('data-stats-variant="stacked"');
    expect(html).toContain("$630,000");
  });

  // ── THE SPEC STRIP MUST FIT ITS OWN CONTENT BOX (07/14/2026) ─────────────────
  //
  // A 6-cell spec strip is a TABLE, and a table does not reflow: it ran off a 390px phone —
  // "Residential" clipped, the whole email scrolling sideways (operator-reported). The cells
  // are now Cerberus inline-blocks that wrap.
  //
  // The arithmetic is the whole fix, and it is the part that bit us: the cells share the
  // Section's CONTENT box (600 − 2×16 = 568), NOT the 600px canvas. Computed against 600, six
  // 100px cells sum to 600, overflow by 32px, and the sixth cell drops to its own line ON
  // DESKTOP — the bug reintroduced one layer down. Nothing but this test would catch that,
  // because both versions render, both are "valid", and only one of them looks right.
  it("a 6-cell spec strip's cells fit the section's content box, so it stays ONE row at 600px", async () => {
    const STRIP_DOC: EmailDoc = {
      globalStyle: STYLE,
      blocks: [
        {
          id: "s1",
          type: "stats",
          layout: { x: 0, y: 0, w: 12, h: 3 },
          props: {
            variant: "strip",
            stats: [
              { label: "Beds", value: "3" },
              { label: "Baths", value: "3.5" },
              { label: "Sq Ft", value: "2,847" },
              { label: "Lot", value: "0.26 ac" },
              { label: "$/Sq Ft", value: "$209", emphasis: "primary" },
              { label: "Type", value: "Residential" },
            ],
          },
        },
      ],
    } as unknown as EmailDoc;

    const html = await renderEmailDocHtml(STRIP_DOC);

    // Every cell is an inline-block (it wraps) and Outlook gets a ghost <td> (it doesn't).
    const cellWidths = [...html.matchAll(/display:inline-block;width:100%;max-width:(\d+)px/g)].map(
      (m) => Number(m[1]),
    );
    expect(cellWidths).toHaveLength(6);
    expect(html).toContain("<!--[if mso]>");

    // THE INVARIANT: the six cells must fit 568px, not 600px.
    const CONTENT_BOX = 600 - 2 * 16;
    expect(cellWidths.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(CONTENT_BOX);
    // ...and they must still be as wide as they can be — a too-timid cell wastes the strip.
    expect(cellWidths.reduce((a, b) => a + b, 0)).toBeGreaterThan(CONTENT_BOX - 6);

    // The last cell is the one that was being clipped. It survives.
    expect(html).toContain("Residential");
  });
});
