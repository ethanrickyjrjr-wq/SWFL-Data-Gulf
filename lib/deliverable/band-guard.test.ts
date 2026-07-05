import { test, expect, describe } from "bun:test";
import {
  classifyFamily,
  FAMILY_BANDS,
  parseMagnitude,
  checkBand,
  bandOutliers,
  resolveOutlierNote,
  type Outlier,
} from "./band-guard";
import { lintDeliverableNarrative } from "./narrative-lint";
import type { SnapshotItem, Narrative } from "./templates";

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

describe("classifyFamily", () => {
  test("slow prices/values", () => {
    expect(classifyFamily("Median Home Value")).toBe("slow_price");
    expect(classifyFamily("Median Asking Rent")).toBe("slow_price");
    expect(classifyFamily("Price per Square Foot")).toBe("slow_price");
  });
  test("volatile counts", () => {
    expect(classifyFamily("Active Inventory")).toBe("volatile_count");
    expect(classifyFamily("Homes Sold")).toBe("volatile_count");
    expect(classifyFamily("New Permits (90 Days)")).toBe("volatile_count");
  });
  test("bounded ratios/scores", () => {
    expect(classifyFamily("Sale-to-List Ratio")).toBe("bounded_ratio");
    expect(classifyFamily("Market Heat Score")).toBe("bounded_ratio");
    expect(classifyFamily("Months of Supply")).toBe("bounded_ratio");
  });
  test("durations", () => {
    expect(classifyFamily("Days on Market")).toBe("duration");
  });
  test("structural/annual", () => {
    expect(classifyFamily("Median household income")).toBe("structural");
    expect(classifyFamily("Save-Our-Homes Gap")).toBe("structural");
  });
  test("unknown label falls through", () => {
    expect(classifyFamily("Some Novel Metric")).toBe("unknown");
  });
});

describe("FAMILY_BANDS", () => {
  test("every family has a band grounded in the spec", () => {
    expect(FAMILY_BANDS.volatile_count.monthlyBand).toBeGreaterThanOrEqual(10);
    expect(FAMILY_BANDS.slow_price.monthlyBand).toBeLessThanOrEqual(3);
    expect(FAMILY_BANDS.bounded_ratio.kind).toBe("abs");
    expect(FAMILY_BANDS.unknown).toBeDefined();
  });
});

describe("parseMagnitude", () => {
  test("handles currency, commas, percent, K/M/B suffix", () => {
    expect(parseMagnitude("$485K")).toBe(485000);
    expect(parseMagnitude("$1.2M")).toBe(1_200_000);
    expect(parseMagnitude("$30,074")).toBe(30074);
    expect(parseMagnitude("4.8%")).toBe(4.8);
    expect(parseMagnitude("127")).toBe(127);
    expect(parseMagnitude("—")).toBeNull();
    expect(parseMagnitude("n/a")).toBeNull();
  });
});

describe("checkBand", () => {
  test("in-band slow price is ok (monthly)", () => {
    const r = checkBand({
      nowValue: "$490K",
      priorValue: "$485K",
      family: "slow_price",
      gapDays: 30,
    });
    expect(r.status).toBe("ok");
  });
  test("home value 3x prior is a confirm_outlier", () => {
    const r = checkBand({
      nowValue: "$1.5M",
      priorValue: "$485K",
      family: "slow_price",
      gapDays: 30,
    });
    expect(r.status).toBe("confirm_outlier");
    expect(r.movePct).toBeGreaterThan(100);
  });
  test("a 9% permit-count move is noise (in band)", () => {
    const r = checkBand({
      nowValue: "109",
      priorValue: "100",
      family: "volatile_count",
      gapDays: 30,
    });
    expect(r.status).toBe("ok");
  });
  test("a 40% permit-count move confirms", () => {
    const r = checkBand({
      nowValue: "140",
      priorValue: "100",
      family: "volatile_count",
      gapDays: 30,
    });
    expect(r.status).toBe("confirm_outlier");
  });
  test("bounded ratio uses absolute points, not ratio", () => {
    // 12 → 30 is +18 points; band 8 × 2.5 = 20 → in band; +28 points would confirm.
    expect(
      checkBand({ nowValue: "30", priorValue: "12", family: "bounded_ratio", gapDays: 30 }).status,
    ).toBe("ok");
    expect(
      checkBand({ nowValue: "40", priorValue: "12", family: "bounded_ratio", gapDays: 30 }).status,
    ).toBe("confirm_outlier");
  });
  test("structural: any real monthly move confirms", () => {
    expect(
      checkBand({ nowValue: "$61,000", priorValue: "$60,000", family: "structural", gapDays: 30 })
        .status,
    ).toBe("confirm_outlier");
  });
  test("band scales to the send gap — a weekly gap tightens the count band", () => {
    // 12%/mo × (7/30) ≈ 2.8% normal; × 2.5 ≈ 7% confirm line. A 20% weekly jump confirms.
    expect(
      checkBand({ nowValue: "120", priorValue: "100", family: "volatile_count", gapDays: 7 })
        .status,
    ).toBe("confirm_outlier");
  });
  test("unparseable or zero prior → uncheckable, never a false confirm", () => {
    expect(
      checkBand({ nowValue: "$5", priorValue: "—", family: "slow_price", gapDays: 30 }).status,
    ).toBe("uncheckable");
    expect(
      checkBand({ nowValue: "5", priorValue: "0", family: "slow_price", gapDays: 30 }).status,
    ).toBe("uncheckable");
  });
});

describe("bandOutliers", () => {
  test("an outlier metric is detected with its now/prior values", () => {
    const now = [metric("Median Home Value", "$1.5M")];
    const prior = [metric("Median Home Value", "$485K")];
    const outliers = bandOutliers(now, prior, 30);
    expect(outliers.length).toBe(1);
    expect(outliers[0].nowValue).toBe("$1.5M");
    expect(outliers[0].priorValue).toBe("$485K");
    expect(outliers[0].family).toBe("slow_price");
  });
  test("an in-band metric is not an outlier", () => {
    const now = [metric("Median Home Value", "$490K")];
    const prior = [metric("Median Home Value", "$485K")];
    expect(bandOutliers(now, prior, 30)).toEqual([]);
  });
  test("a metric with no prior match is not an outlier", () => {
    const now = [metric("Median Home Value", "$1.5M")];
    const prior = [metric("Active Inventory", "100")];
    expect(bandOutliers(now, prior, 30)).toEqual([]);
  });
  test("label match is case/space-insensitive", () => {
    const now = [metric("  median home value ", "$1.5M")];
    const prior = [metric("Median Home Value", "$485K")];
    expect(bandOutliers(now, prior, 30).length).toBe(1);
  });
});

describe("resolveOutlierNote", () => {
  const o: Outlier = {
    label: "Median Home Value",
    nowValue: "$1.5M",
    priorValue: "$485K",
    family: "slow_price",
    movePct: 209,
  };

  test("grounded + within tolerance → no note (real move, verified)", () => {
    expect(
      resolveOutlierNote(o, {
        within_tolerance: true,
        value_used: "$1.49M",
        source_urls: ["https://zillow.com/x"],
      }),
    ).toBe("");
  });

  test("grounded + out of tolerance → discrepancy note citing the source value", () => {
    const note = resolveOutlierNote(o, {
      within_tolerance: false,
      value_used: "$500K",
      source_urls: ["https://redfin.com/y"],
    });
    expect(note).toContain("$1.5M"); // our (current) value — anchors
    expect(note).toContain("$500K"); // the source's value
    expect(note).toContain("redfin.com");
    expect(note).toMatch(/falsifier\s*:/i);
  });

  test("no grounded confirm (null) → please-confirm note", () => {
    const note = resolveOutlierNote(o, null);
    expect(note.toLowerCase()).toContain("please confirm");
    expect(note).toContain("$1.5M");
    expect(note).toMatch(/falsifier\s*:/i);
  });

  test("ungrounded result (no source urls) is treated as could-not-confirm", () => {
    const note = resolveOutlierNote(o, {
      within_tolerance: true,
      value_used: "$1.5M",
      source_urls: [],
    });
    expect(note.toLowerCase()).toContain("please confirm");
  });

  test("both note branches survive the deliverable note gate", () => {
    const discrepancy = resolveOutlierNote(o, {
      within_tolerance: false,
      value_used: "$500K",
      source_urls: ["https://redfin.com/y"],
    });
    const please = resolveOutlierNote(o, null);
    const narrative: Narrative = {
      exec_summary: "",
      sections: [],
      inference_notes: [discrepancy, please],
    };
    // Anchor set = the current snapshot value the deliverable holds.
    const res = lintDeliverableNarrative(narrative, ["$1.5M"], []);
    expect(res.violations.filter((v) => v.location === "inference_note")).toEqual([]);
  });
});
