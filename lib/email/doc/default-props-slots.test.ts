// THE SLOT RULE applied to the add-block palette (check: email_palette_demo_figures).
// DEFAULT_BLOCK_PROPS feeds createBlock() — every block the palette mints lands on a
// REAL canvas, so a demo figure here ($485K / 4521 Surfside class) is one save away
// from shipping in a real send. Data-dependent fields must be EMPTY open slots; the
// instruction lives in the label (docSkeleton skips empty fields, so the AI treats
// an empty value as a slot to fill and a filled one as "the current answer").

import { describe, expect, it } from "bun:test";
import { DEFAULT_BLOCK_PROPS } from "./default-docs";

describe("DEFAULT_BLOCK_PROPS — the slot rule (no demo figures in the palette)", () => {
  it("hero ships an empty value slot", () => {
    expect(DEFAULT_BLOCK_PROPS.hero.value).toBe("");
  });

  it("stats ship structural labels with empty value slots", () => {
    for (const s of DEFAULT_BLOCK_PROPS.stats.stats) {
      expect(s.value).toBe("");
      expect(s.label).not.toBe("");
    }
  });

  it("listing ships no demo listing", () => {
    const l = DEFAULT_BLOCK_PROPS.listing;
    for (const field of ["price", "beds", "baths", "sqft", "address"] as const) {
      expect(l[field], field).toBe("");
    }
  });

  it("metric-card ships no demo metric (and no fabricated bar)", () => {
    const m = DEFAULT_BLOCK_PROPS["metric-card"];
    for (const field of ["metricValue", "sub", "rankText", "movementText"] as const) {
      expect(m[field], field).toBe("");
    }
    expect(m.barPct).toBeUndefined();
  });

  it("no default anywhere carries a dollar figure or the legacy demo strings", () => {
    const json = JSON.stringify(DEFAULT_BLOCK_PROPS);
    expect(json).not.toMatch(/\$\d/);
    expect(json).not.toContain("4521 Surfside");
    expect(json).not.toContain("485");
  });
});
