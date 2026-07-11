import { describe, it, expect } from "bun:test";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { SEED_DOCS } from "./default-docs";
import { SEED_PREVIEWS } from "./seed-previews";
import { previewFill } from "./preview-fill";

/** Chart URLs (committed SVGs) of a filled doc's image blocks, in slot order. */
function chartUrls(doc: ReturnType<typeof previewFill>): string[] {
  const urls: string[] = [];
  for (const b of doc.blocks) {
    if (b.type === "image" && b.props.url?.endsWith(".svg")) urls.push(b.props.url);
  }
  return urls;
}

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

  it("leaves no known authoring-instruction copy in filled output", () => {
    // Preset seed copy that reads as an instruction to the author — each of
    // these shipped visibly in a capture at least once (set-level QA 07/09/2026).
    const leaks = [
      "Pull side-by-side data",
      "Pull a real number",
      "Ground it in a real number",
      "say which and why",
      "Welcome them in your own voice",
      "Read the trend in plain language",
      "A short bio that builds trust",
      "What you expect heading into next year",
    ];
    for (const seed of SEED_DOCS) {
      const json = JSON.stringify(previewFill(seed.build(), { seedId: seed.id }));
      for (const leak of leaks) {
        expect(json, `${seed.id} leaks "${leak}"`).not.toContain(leak);
      }
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

  // ── variety guards (seed_preview_variety_pass, operator escalation
  // 07/09/2026: the SAME ZHVI chart rendered 3× inside one weekly-pulse
  // preview). These make that class of ship impossible.

  it("never repeats a chart inside one doc", () => {
    for (const seed of SEED_DOCS) {
      const urls = chartUrls(previewFill(seed.build(), { seedId: seed.id }));
      expect(new Set(urls).size, `${seed.id} chart slots: ${urls.join(", ")}`).toBe(urls.length);
    }
  });

  it("keeps hero values distinct within each gallery group", () => {
    const byGroup = new Map<string, Map<string, string>>();
    for (const seed of SEED_DOCS) {
      const group = SEED_PREVIEWS.find((p) => p.id === seed.id)?.group ?? "?";
      const filled = previewFill(seed.build(), { seedId: seed.id });
      const heroBlock = filled.blocks.find((b) => b.type === "hero");
      if (!heroBlock || heroBlock.type !== "hero") continue;
      const value = heroBlock.props.value ?? "";
      const seen = byGroup.get(group) ?? new Map<string, string>();
      expect(
        seen.has(value),
        `group "${group}": ${seed.id} and ${seen.get(value)} share hero "${value}"`,
      ).toBe(false);
      seen.set(value, seed.id);
      byGroup.set(group, seen);
    }
  });

  it("caps any single chart at 3 appearances across the whole gallery", () => {
    const counts = new Map<string, number>();
    for (const seed of SEED_DOCS) {
      for (const url of chartUrls(previewFill(seed.build(), { seedId: seed.id }))) {
        counts.set(url, (counts.get(url) ?? 0) + 1);
      }
    }
    for (const [url, n] of counts) {
      expect(n, `${url} appears ${n}× across the gallery`).toBeLessThanOrEqual(3);
    }
  });

  it("every filled image/chart/listing asset exists on disk", () => {
    for (const seed of SEED_DOCS) {
      const filled = previewFill(seed.build(), { seedId: seed.id });
      for (const b of filled.blocks) {
        const urls: (string | undefined)[] =
          b.type === "image" ? [b.props.url] : b.type === "listing" ? [b.props.photoUrl] : [];
        for (const u of urls) {
          if (!u || !u.startsWith("/")) continue;
          expect(
            existsSync(join(process.cwd(), "public", u.replace(/^\//, ""))),
            `${seed.id}: missing asset ${u}`,
          ).toBe(true);
        }
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

import { assertHeroChartCoherence } from "../../deliverable/chart-coherence";
import { SEED_CHART_SERIES } from "./seed-chart-series";
import { resolveHeadlineFigure } from "./preview-fill";

/** Basename of a committed chart asset URL ("/showcase/.../chart-x.svg" -> "chart-x.svg"). */
function assetBasename(url: string): string {
  return url.split("/").pop() ?? url;
}

// A real, human-reasoned exception -- template id + why. Empty today: the
// luxury fixture (Task 4) is the fix, not an allowlisted exception. Adding an
// entry here is a deliberate, reviewed call -- never a way to silence red CI.
const COHERENCE_ALLOWLIST: Record<string, string> = {};

describe("chart<->headline coherence gate (deliverable-coherence-gate)", () => {
  const CHART_BEARING_TEMPLATES = [
    "market-spotlight",
    "weekly-pulse",
    "trend-snapshot",
    "rate-watch",
    "luxury-market-report",
    "neighborhood-report",
    "investment-brief",
    "monthly-digest",
    "year-in-review",
  ];

  it("covers exactly the 9 chart-bearing templates (catches a new one silently gaining a chart)", () => {
    const actual = SEED_DOCS.filter((seed) => {
      const urls = chartUrls(previewFill(seed.build(), { seedId: seed.id }));
      return urls.length > 0;
    }).map((s) => s.id);
    expect(new Set(actual)).toEqual(new Set(CHART_BEARING_TEMPLATES));
  });

  it("every chart-bearing template's headline coheres with every one of its charts", () => {
    const failures: string[] = [];
    for (const id of CHART_BEARING_TEMPLATES) {
      const seed = SEED_DOCS.find((s) => s.id === id);
      if (!seed) throw new Error(`no SEED_DOCS entry for ${id}`);
      const filled = previewFill(seed.build(), { seedId: id });
      const hero = resolveHeadlineFigure(filled);
      const urls = chartUrls(filled);
      for (const url of urls) {
        const basename = assetBasename(url);
        const series = SEED_CHART_SERIES[basename];
        if (!series) throw new Error(`${id}: no SEED_CHART_SERIES entry for ${basename}`);
        const result = assertHeroChartCoherence({
          hero,
          chart: { values: series.values, unit: series.unit },
        });
        if (!result.coherent && !COHERENCE_ALLOWLIST[id]) {
          failures.push(`${id} (${basename}): ${result.reason}`);
        }
      }
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });
});
