import { describe, expect, it } from "bun:test";
import { projectTierTrend } from "./tier-projection-series";
import type { ChartRow } from "@/types/viz";

function rows(n: number, base: number, slope: number): ChartRow[] {
  return Array.from({ length: n }, (_, i) => ({
    luxury_index: base + slope * i,
    starter_index: base + slope * i,
  })) as unknown as ChartRow[];
}

/** A clean line for `luxury`, `starter`, or both — and NOISE AROUND FLAT for the rest. */
function mixed(n: number, clean: "luxury" | "starter" | "both" | "neither"): ChartRow[] {
  // Alternating ±5 around a constant: real variance (so fitLine can fit it), but the
  // slope's interval straddles zero — its direction may not be read.
  const noisy = (i: number) => 100 + (i % 2 === 0 ? 5 : -5);
  const line = (i: number) => 100 + 2 * i;
  return Array.from({ length: n }, (_, i) => ({
    luxury_index: clean === "luxury" || clean === "both" ? line(i) : noisy(i),
    starter_index: clean === "starter" || clean === "both" ? line(i) : noisy(i),
  })) as unknown as ChartRow[];
}

describe("projectTierTrend", () => {
  it("projects from the FITTED LINE, not the last observed value", () => {
    // 12 months on an exact line, then spike the LAST point. The old trailingSlope
    // implementation anchored at that spike and dragged the projection with it.
    const r = rows(12, 100, 2);
    (r[11] as { luxury_index: number }).luxury_index = 500; // outlier
    const p = projectTierTrend(r, 6, 12)!;
    // The fitted line at month 11 is ~122, so a 6-month projection lands nowhere
    // near 500 + slope*6. Anchoring at the observed 500 would.
    expect(p.luxuryEnd).toBeLessThan(400);
  });

  it("returns null below the window size", () => {
    expect(projectTierTrend(rows(5, 100, 2), 6, 12)).toBeNull();
  });

  it("keeps its shape so TierProjectionChart needs no change", () => {
    const p = projectTierTrend(rows(24, 100, 2), 6, 12)!;
    expect(p).toHaveProperty("luxuryLatest");
    expect(p).toHaveProperty("starterLatest");
    expect(p).toHaveProperty("luxuryEnd");
    expect(p).toHaveProperty("starterEnd");
    expect(p.horizonMonths).toBe(6);
  });

  // ── THE GATE ────────────────────────────────────────────────────────────────
  // A slope whose interval contains zero has NO READABLE DIRECTION. The math still
  // computes an endpoint — the CALLER decides whether it may be drawn.

  it("a tier on a clean line is ESTABLISHED", () => {
    const p = projectTierTrend(mixed(12, "both"), 6, 12)!;
    expect(p.luxuryEstablished).toBe(true);
    expect(p.starterEstablished).toBe(true);
  });

  it("a tier that is NOISE AROUND FLAT is NOT established", () => {
    const p = projectTierTrend(mixed(12, "neither"), 6, 12)!;
    expect(p.luxuryEstablished).toBe(false);
    expect(p.starterEstablished).toBe(false);
  });

  it("still returns the object — and still computes both ends — when NEITHER tier is established", () => {
    // The gate lives in the caller, not the math. `projectTierTrend` must NOT collapse
    // "no readable direction" into its null (which means "could not fit at all").
    const p = projectTierTrend(mixed(12, "neither"), 6, 12);
    expect(p).not.toBeNull();
    expect(Number.isFinite(p!.luxuryEnd)).toBe(true);
    expect(Number.isFinite(p!.starterEnd)).toBe(true);
    expect(Number.isFinite(p!.luxuryLatest)).toBe(true);
    expect(Number.isFinite(p!.starterLatest)).toBe(true);
  });

  it("gates each tier INDEPENDENTLY — one clean, one noisy", () => {
    const p = projectTierTrend(mixed(12, "luxury"), 6, 12)!;
    expect(p.luxuryEstablished).toBe(true);
    expect(p.starterEstablished).toBe(false);
    // The unestablished tier's endpoint still computes.
    expect(Number.isFinite(p.starterEnd)).toBe(true);

    const q = projectTierTrend(mixed(12, "starter"), 6, 12)!;
    expect(q.luxuryEstablished).toBe(false);
    expect(q.starterEstablished).toBe(true);
  });

  it("reads the flag off the WINDOWED slice, not the full history", () => {
    // 24 rows: the first 12 are a clean line, the trailing 12 are noise around flat.
    // A fit over the full 24 would look established. The window is what may be read.
    const head = mixed(12, "both");
    const tail = mixed(12, "neither");
    const all = [...head, ...tail] as ChartRow[];
    const p = projectTierTrend(all, 6, 12)!;
    expect(p.luxuryEstablished).toBe(false);
    expect(p.starterEstablished).toBe(false);
  });
});
