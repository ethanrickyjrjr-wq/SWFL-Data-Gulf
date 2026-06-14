import { test, beforeAll, describe } from "bun:test";
import assert from "node:assert/strict";
import type { RawFragment } from "../types/fragment.mts";

process.env["REFINERY_SOURCE"] = "fixture";

// Real imports of the pack's EXPORTED weight constants — assert on the shipping values, not
// on hardcoded literals. The old version discarded the module and returned its own numbers,
// so a weight change in the pack could never fail the "weights sum to 1.00" test.
const {
  sellerStressSwfl,
  DELISTING_WEIGHT,
  PRICE_DROP_BREADTH_WEIGHT,
  CANCELLATION_WEIGHT,
  PRICE_DROP_DEPTH_WEIGHT,
  RELISTING_WEIGHT,
} = await import("./seller-stress-swfl.mts");
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

describe("seller-stress-swfl rolling-12 trailing window (regression: early-year must not blank)", () => {
  function monthsBetween(start: string, end: string): string[] {
    const out: string[] = [];
    let [y, m] = start.split("-").map(Number);
    const [ey, em] = end.split("-").map(Number);
    while (y < ey || (y === ey && m <= em)) {
      out.push(`${y}-${String(m).padStart(2, "0")}-01`);
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
    return out;
  }

  function syntheticZip(zip: string, periods: string[]): RawFragment[] {
    const frags: RawFragment[] = [];
    for (const p of periods) {
      const base = { source_trust_tier: 3, fetched_at: "2026-02-15T00:00:00.000Z", raw: {} };
      frags.push({
        fragment_id: `drops|${zip}|${p}`,
        source_id: "redfin_price_drops_swfl",
        ...base,
        normalized: {
          zip_code: zip,
          period_begin: p,
          pct_active_with_drops: 40,
          avg_price_drop_pct: 5,
        },
      } as unknown as RawFragment);
      frags.push({
        fragment_id: `canc|${zip}|${p}`,
        source_id: "redfin_contract_cancellations_swfl",
        ...base,
        normalized: { zip_code: zip, period_begin: p, cancellation_rate_pct: 15 },
      } as unknown as RawFragment);
      frags.push({
        fragment_id: `delist|${zip}|${p}`,
        source_id: "redfin_delistings_relistings_swfl",
        ...base,
        normalized: {
          zip_code: zip,
          period_begin: p,
          share_delisted_pct: 18,
          share_relisted_pct: 3,
        },
      } as unknown as RawFragment);
    }
    return frags;
  }

  test("a ZIP whose latest period is February is still scored (calendar-YTD bug would suppress it)", () => {
    // 36 baseline months (2019–2021) + a trailing year ending 2026-02. Under the OLD
    // calendar-YTD cutoff only Jan + Feb 2026 (2 periods) qualified → < N_TRAILING_MIN(3) →
    // suppressed → brain flips to neutral. Rolling-12 spans Mar 2025..Feb 2026 (12) → scored.
    const periods = [
      ...monthsBetween("2019-01-01", "2021-12-01"),
      ...monthsBetween("2025-03-01", "2026-02-01"),
    ];
    sellerStressSwfl.corpusSummary!(syntheticZip("99999", periods));
    const result = sellerStressSwfl.outputProducer!({} as never);
    const row = result.detail_tables![0].rows.find((r) => r.key === "99999");
    assert.ok(row, "synthetic ZIP 99999 missing from detail table");
    assert.notStrictEqual(
      row!.cells["seller_stress_score"],
      null,
      "ZIP with a February latest period was suppressed — the calendar-YTD trailing-window bug is back",
    );
  });
});
