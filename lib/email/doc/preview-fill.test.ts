import { describe, it, expect } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { SEED_DOCS } from "./default-docs";
import { previewFill } from "./preview-fill";

describe("previewFill", () => {
  it("never mutates the input doc and returns a new object", () => {
    for (const seed of SEED_DOCS) {
      const doc = seed.build();
      const before = JSON.stringify(doc);
      const filled = previewFill(doc, { seedId: seed.id });
      expect(filled).not.toBe(doc);
      expect(JSON.stringify(doc)).toBe(before);
    }
  });

  it("fills empty hero/listing/stats slots on every seed", () => {
    for (const seed of SEED_DOCS) {
      const filled = previewFill(seed.build(), { seedId: seed.id });
      for (const b of filled.blocks) {
        if (b.type === "hero") {
          expect(b.props.value?.trim(), `${seed.id} hero.value`).toBeTruthy();
        }
        if (b.type === "listing") {
          expect(b.props.address?.trim(), `${seed.id} listing.address`).toBeTruthy();
          expect(b.props.price?.trim(), `${seed.id} listing.price`).toBeTruthy();
        }
        if (b.type === "stats") {
          for (const s of b.props.stats) {
            expect(s.value.trim(), `${seed.id} stat "${s.label}"`).toBeTruthy();
          }
        }
      }
    }
  });

  it("purges the legacy demo placeholders ($485K / 4521 Surfside class)", () => {
    for (const seed of SEED_DOCS) {
      const json = JSON.stringify(previewFill(seed.build(), { seedId: seed.id }));
      expect(json, seed.id).not.toContain("4521 Surfside");
      expect(json, seed.id).not.toContain("$485K");
      expect(json, seed.id).not.toContain("$489,000");
    }
  });

  it("leaves no [[placeholder]] tokens in filled output", () => {
    for (const seed of SEED_DOCS) {
      const filled = previewFill(seed.build(), { seedId: seed.id });
      expect(JSON.stringify(filled)).not.toContain("[[");
    }
  });

  it("keeps globalStyle and layout byte-identical (the design IS the preview)", () => {
    for (const seed of SEED_DOCS) {
      const doc = seed.build();
      const filled = previewFill(doc, { seedId: seed.id });
      expect(JSON.stringify(filled.globalStyle)).toBe(JSON.stringify(doc.globalStyle));
      for (let i = 0; i < doc.blocks.length; i++) {
        expect(JSON.stringify(filled.blocks[i].layout ?? null)).toBe(
          JSON.stringify(doc.blocks[i].layout ?? null),
        );
      }
    }
  });

  // THE INVARIANT: previewFill exists ONLY for the capture script / gallery.
  // No lab entry path — the pickers, the arrival controller, the seed data
  // layer — may ever import it, or demo data re-enters the canvas (the class
  // Track A purged: seed_static_figures_bypass_invention_gate).
  it("no lab entry path imports preview-fill", () => {
    const roots = ["components/email-lab", "app/email-lab", "app/project", "lib/lab-entry"].map(
      (p) => join(process.cwd(), p),
    );
    const offenders: string[] = [];
    const scan = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
          scan(full);
        } else if (/\.(ts|tsx|mts)$/.test(name) && !name.endsWith(".test.ts")) {
          if (readFileSync(full, "utf8").includes("preview-fill")) offenders.push(full);
        }
      }
    };
    for (const r of roots) scan(r);
    const defaultDocs = readFileSync(join(process.cwd(), "lib/email/doc/default-docs.ts"), "utf8");
    expect(defaultDocs).not.toContain("preview-fill");
    expect(offenders).toEqual([]);
  });
});
