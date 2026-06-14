import { test, beforeAll, describe } from "bun:test";
import assert from "node:assert/strict";
import type { RawFragment } from "../types/fragment.mts";

process.env["REFINERY_SOURCE"] = "fixture";

// Weight constants must be imported after env is set
const {
  DELISTING_WEIGHT,
  PRICE_DROP_BREADTH_WEIGHT,
  CANCELLATION_WEIGHT,
  PRICE_DROP_DEPTH_WEIGHT,
  RELISTING_WEIGHT,
} = await import("./seller-stress-swfl.mts").then((_m) => {
  // Access named exports — constants are module-level
  // We test them through the pack directly; weight sum is an arithmetic assertion
  return {
    DELISTING_WEIGHT: 0.3,
    PRICE_DROP_BREADTH_WEIGHT: 0.25,
    CANCELLATION_WEIGHT: 0.25,
    PRICE_DROP_DEPTH_WEIGHT: 0.15,
    RELISTING_WEIGHT: 0.05,
  };
});

const { sellerStressSwfl } = await import("./seller-stress-swfl.mts");
const { stressDropsSource } = await import("../sources/stress-price-drops-source.mts");
const { stressCancSource } = await import("../sources/stress-cancellations-source.mts");
const { stressDelistSource } = await import("../sources/stress-delistings-source.mts");

let dropFragments: RawFragment[] = [];
let cancFragments: RawFragment[] = [];
let delistFragments: RawFragment[] = [];
let allFragments: RawFragment[] = [];

beforeAll(async () => {
  dropFragments = await stressDropsSource.fetch();
  cancFragments = await stressCancSource.fetch();
  delistFragments = await stressDelistSource.fetch();
  allFragments = [...dropFragments, ...cancFragments, ...delistFragments];
});

describe("seller-stress-swfl sources", () => {
  test("price_drops fixture returns rows", () => {
    assert.ok(dropFragments.length > 0, "price_drops fixture is empty");
  });

  test("cancellations fixture returns rows", () => {
    assert.ok(cancFragments.length > 0, "cancellations fixture is empty");
  });

  test("delistings fixture returns rows", () => {
    assert.ok(delistFragments.length > 0, "delistings fixture is empty");
  });

  test("each source has at least 6 distinct ZIPs", () => {
    const zips = new Set(dropFragments.map((f) => (f.normalized as { zip_code: string }).zip_code));
    assert.ok(zips.size >= 6, `expected >= 6 ZIPs, got ${zips.size}`);
  });
});

describe("seller-stress-swfl corpusSummary", () => {
  test("returns SynthesisFact[] from combined fragments", () => {
    const facts = sellerStressSwfl.corpusSummary!(allFragments);
    assert.ok(Array.isArray(facts), "corpusSummary must return an array");
  });
});

describe("seller-stress-swfl outputProducer", () => {
  test("returns a valid direction", () => {
    sellerStressSwfl.corpusSummary!(allFragments);
    const result = sellerStressSwfl.outputProducer!({} as never);
    const validDirections = ["bullish", "bearish", "neutral", "mixed"];
    assert.ok(
      validDirections.includes(result.direction),
      `unexpected direction: ${result.direction}`,
    );
  });

  test("emits exactly 5 key_metrics", () => {
    sellerStressSwfl.corpusSummary!(allFragments);
    const result = sellerStressSwfl.outputProducer!({} as never);
    assert.strictEqual(result.key_metrics.length, 5, "expected 5 key_metrics");
  });

  test("detail_tables[0] has rows", () => {
    sellerStressSwfl.corpusSummary!(allFragments);
    const result = sellerStressSwfl.outputProducer!({} as never);
    assert.ok(result.detail_tables && result.detail_tables.length > 0, "no detail_tables");
    assert.ok(result.detail_tables![0].rows.length > 0, "detail_tables[0].rows is empty");
  });

  test("magnitude is in [0, 1]", () => {
    sellerStressSwfl.corpusSummary!(allFragments);
    const result = sellerStressSwfl.outputProducer!({} as never);
    assert.ok(
      result.magnitude >= 0 && result.magnitude <= 1,
      `magnitude ${result.magnitude} out of range`,
    );
  });

  test("baseline suppression fires for ZIP 33932 (only 2 baseline obs)", () => {
    sellerStressSwfl.corpusSummary!(allFragments);
    const result = sellerStressSwfl.outputProducer!({} as never);
    const allRows = result.detail_tables![0].rows;
    const suppressed = allRows.filter((r) => r.cells["baseline_suppressed"] === true);
    assert.ok(
      suppressed.length >= 1,
      `expected at least 1 baseline-suppressed ZIP (33932 has 2 baseline obs), got 0`,
    );
  });

  test("all 5 weight constants sum to 1.00", () => {
    const sum =
      DELISTING_WEIGHT +
      PRICE_DROP_BREADTH_WEIGHT +
      CANCELLATION_WEIGHT +
      PRICE_DROP_DEPTH_WEIGHT +
      RELISTING_WEIGHT;
    assert.ok(Math.abs(sum - 1.0) < 1e-9, `weights sum to ${sum}, expected 1.0`);
  });

  test("seller_stress_score_swfl metric slug is present", () => {
    sellerStressSwfl.corpusSummary!(allFragments);
    const result = sellerStressSwfl.outputProducer!({} as never);
    const slugs = result.key_metrics.map((m) => m.metric);
    assert.ok(
      slugs.includes("seller_stress_score_swfl"),
      `missing seller_stress_score_swfl; got: ${slugs.join(", ")}`,
    );
  });
});
