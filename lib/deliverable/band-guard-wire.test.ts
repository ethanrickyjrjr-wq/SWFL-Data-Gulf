import { test, expect, describe, afterEach } from "bun:test";
import { buildDeliverableNarrative } from "./build";
import type { SnapshotItem } from "./templates";

function metric(label: string, value: string): SnapshotItem {
  return {
    id: crypto.randomUUID(),
    added_at: "2026-07-05T00:00:00Z",
    origin: "web",
    kind: "metric",
    report_id: "d1",
    label,
    value,
    freshness_token: "",
  } as SnapshotItem;
}

// buildDeliverableNarrative uses a deterministic mock narrative when agents are
// mocked (no ANTHROPIC key) — mockNarrative carries no "please confirm" text, so
// any such note came from the band-guard pass. `confirmOutlier` is stubbed so the
// wiring never touches the network.
describe("band guard wiring", () => {
  const now = [metric("Median Home Value", "$1.5M")];
  const prior = [metric("Median Home Value", "$485K")];

  afterEach(() => {
    delete process.env.BAND_GUARD_ENABLED;
  });

  test("flag OFF → no confirm note appended", async () => {
    delete process.env.BAND_GUARD_ENABLED;
    const r = await buildDeliverableNarrative({
      instruction: "",
      items: now,
      template: "email",
      priorItems: prior,
      gapDays: 30,
      confirmOutlier: async () => null,
    });
    expect(
      r.narrative.inference_notes.some((n) => n.toLowerCase().includes("please confirm")),
    ).toBe(false);
  });

  test("flag ON + outlier + could-not-confirm → please-confirm note appended", async () => {
    process.env.BAND_GUARD_ENABLED = "1";
    const r = await buildDeliverableNarrative({
      instruction: "",
      items: now,
      template: "email",
      priorItems: prior,
      gapDays: 30,
      confirmOutlier: async () => null,
    });
    expect(
      r.narrative.inference_notes.some((n) => n.toLowerCase().includes("please confirm")),
    ).toBe(true);
  });

  test("flag ON + web disagrees → discrepancy note citing the source", async () => {
    process.env.BAND_GUARD_ENABLED = "1";
    const r = await buildDeliverableNarrative({
      instruction: "",
      items: now,
      template: "email",
      priorItems: prior,
      gapDays: 30,
      confirmOutlier: async () => ({
        within_tolerance: false,
        value_used: "$500K",
        source_urls: ["https://redfin.com/y"],
      }),
    });
    expect(r.narrative.inference_notes.some((n) => n.includes("$500K"))).toBe(true);
  });

  test("flag ON + web agrees → number ships clean, no note", async () => {
    process.env.BAND_GUARD_ENABLED = "1";
    const r = await buildDeliverableNarrative({
      instruction: "",
      items: now,
      template: "email",
      priorItems: prior,
      gapDays: 30,
      confirmOutlier: async () => ({
        within_tolerance: true,
        value_used: "$1.49M",
        source_urls: ["https://zillow.com/x"],
      }),
    });
    expect(
      r.narrative.inference_notes.some((n) => n.toLowerCase().includes("please confirm")),
    ).toBe(false);
  });

  test("flag ON but no priorItems → no note (first send establishes baseline)", async () => {
    process.env.BAND_GUARD_ENABLED = "1";
    const r = await buildDeliverableNarrative({
      instruction: "",
      items: now,
      template: "email",
      confirmOutlier: async () => null,
    });
    expect(
      r.narrative.inference_notes.some((n) => n.toLowerCase().includes("please confirm")),
    ).toBe(false);
  });
});
