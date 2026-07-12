/**
 * freshness-pulse unit tests. Lock the brain-first + MOAT guarantees:
 *  - empty daily_truth → a valid empty-tolerant BrainOutput (ships before data).
 *  - a cited county number becomes a key_metric with its source receipt.
 *  - the THREE math-path gates (no number reaches scoring unless it is real):
 *      · value != null   (a NULL row never surfaces)
 *      · source_url      (a model-memory number with no source is dropped — the MOAT)
 *      · !anomaly_flag   (a HELD anomaly waits for human review, never the brain)
 *  - reporter discipline: direction is ALWAYS neutral, magnitude 0 (Tier-1, no opinion).
 *  - Baseline-Delta: projectZipPulse projects a tagged, falsifiable [INFERENCE] point;
 *    a real same-period vendor ZIP value WINS over the approx for that ZIP.
 *  - pack wiring: corpusSummary stashes rows; outputProducer reads them.
 *
 * Tests call the EXPORTED PURE builder (buildFreshnessPulse) + projectZipPulse —
 * the producer is sync and reads module state set by corpusSummary, so the pure
 * builder is the honest unit-test surface (the plan sketch's
 * `outputProducer({dailyTruth,zipBaselines})` does not match the real
 * `(out: PackOutput)` contract). One test exercises the real corpusSummary →
 * outputProducer wiring end to end.
 */
import { test, expect } from "bun:test";
import type { PackOutput } from "../types/pack.mts";
import type { RawFragment } from "../types/fragment.mts";
import { freshnessPulse, buildFreshnessPulse, projectZipPulse } from "./freshness-pulse.mts";
import type { DailyTruthRow } from "../sources/daily-truth-source.mts";

function row(p: Partial<DailyTruthRow> = {}): DailyTruthRow {
  return {
    kind: "daily-truth",
    metric_key: "median_asking_price",
    area: "cape_coral",
    period: "2026-06-15",
    value: 362000,
    unit: "usd",
    source_url: "https://www.redfin.com/x",
    source_title: "Redfin",
    source_tag: "live_search",
    verified_on_page: true,
    agreement_n: 1,
    anomaly_flag: false,
    retrieved_at: "2026-06-15T12:00:00Z",
    ...p,
  };
}

const mortgageRow = (p: Partial<DailyTruthRow> = {}): DailyTruthRow =>
  row({
    metric_key: "mortgage_30yr_fixed",
    area: "swfl",
    value: 6.52,
    unit: "pct",
    period: "2026-06-11",
    source_url: "https://fred.stlouisfed.org/series/MORTGAGE30US",
    source_title: "FRED",
    ...p,
  });

test("empty daily_truth → valid empty-tolerant output (ships before data)", () => {
  const out = buildFreshnessPulse({ dailyTruth: [], zipBaselines: [] });
  expect(out.conclusion).toMatch(/no fresh sourced snapshot/i);
  expect(out.key_metrics).toEqual([]);
  expect(out.direction).toBe("neutral"); // reporter = no opinion
  expect(out.magnitude).toBe(0);
  expect(out.caveats.length).toBeGreaterThan(0);
  expect(out.detail_tables ?? []).toEqual([]);
});

test("cited county facts become key_metrics with a source receipt", () => {
  const out = buildFreshnessPulse({
    dailyTruth: [row({ value: 362000 }), mortgageRow()],
    zipBaselines: [],
  });
  const slugs = out.key_metrics.map((m) => m.metric);
  expect(slugs).toContain("freshness_median_asking_price_cape_coral_usd");
  expect(slugs).toContain("freshness_mortgage_30yr_fixed_pct");
  // every cited metric carries a real source URL (CITE rule) + its as-of period.
  expect(out.key_metrics.every((m) => !!m.source.url)).toBe(true);
  const price = out.key_metrics.find(
    (m) => m.metric === "freshness_median_asking_price_cape_coral_usd",
  );
  expect(price?.value).toBe(362000);
  expect(price?.source.url).toBe("https://www.redfin.com/x");
});

test("a HELD anomaly never enters key_metrics (waits for human review)", () => {
  const out = buildFreshnessPulse({
    dailyTruth: [
      row({ value: 362000, anomaly_flag: false }),
      row({ area: "naples", value: 999000, anomaly_flag: true }), // held
    ],
    zipBaselines: [],
  });
  const slugs = out.key_metrics.map((m) => m.metric);
  expect(slugs).toContain("freshness_median_asking_price_cape_coral_usd");
  expect(slugs).not.toContain("freshness_median_asking_price_naples_usd");
});

test("a memory number with NO source_url is dropped (the MOAT)", () => {
  const out = buildFreshnessPulse({
    dailyTruth: [row({ area: "fort_myers", value: 410000, source_url: null })],
    zipBaselines: [],
  });
  expect(out.key_metrics).toEqual([]);
  expect(out.conclusion).toMatch(/no fresh sourced snapshot/i);
});

test("a NULL-valued row (all cascade legs failed) is dropped", () => {
  const out = buildFreshnessPulse({
    dailyTruth: [row({ value: null, source_url: null })],
    zipBaselines: [],
  });
  expect(out.key_metrics).toEqual([]);
});

test("direction stays neutral and magnitude 0 even with rich data (reporter)", () => {
  const out = buildFreshnessPulse({
    dailyTruth: [row(), mortgageRow(), row({ area: "naples", value: 575000 })],
    zipBaselines: [{ zip: "33904", baseline: 300000, countyToday: 362000, countyBaseline: 350000 }],
  });
  expect(out.direction).toBe("neutral");
  expect(out.magnitude).toBe(0);
  expect(out.overrides).toEqual([]);
  expect(out.contradicts).toEqual([]);
  expect(out.drivers).toEqual([]);
});

test("Baseline-Delta projects a tagged, falsifiable ZIP approx point", () => {
  // county today 362000 vs baseline-period county 350000 ⇒ +3.43% ; ZIP baseline 300000
  const p = projectZipPulse({
    zip: "33904",
    zipBaseline: 300000,
    countyToday: 362000,
    countyBaseline: 350000,
  });
  expect(p.value).toBeCloseTo(300000 * (362000 / 350000), -1);
  expect(p.source_tag).toBe("approx");
  expect(p.inference).toBe(true);
  expect(p.falsifier).toMatch(/superseded when the next zip-grain vendor file/i);
  expect(p.basis).toMatch(/county delta/i);
});

test("a same-period vendor ZIP value WINS over the approx for that ZIP", () => {
  const out = buildFreshnessPulse({
    dailyTruth: [],
    zipBaselines: [
      {
        zip: "33904",
        baseline: 300000,
        vendorValue: 305000,
        countyToday: 362000,
        countyBaseline: 350000,
      },
    ],
  });
  const zipTable = (out.detail_tables ?? []).find((t) => t.id === "freshness_by_zip");
  expect(zipTable).toBeTruthy();
  expect(zipTable?.grain).toBe("zip");
  const row33904 = zipTable?.rows.find((r) => r.key === "33904");
  // cells is a keyed object (BrainOutputDetailRow.cells), not a {key,value}[] array.
  expect(row33904?.cells.source_tag).toBe("vendor"); // not "approx"
  expect(row33904?.cells.value).toBe(305000);
});

test("an approx ZIP row is rendered when no vendor value exists for it", () => {
  const out = buildFreshnessPulse({
    dailyTruth: [],
    zipBaselines: [{ zip: "33904", baseline: 300000, countyToday: 362000, countyBaseline: 350000 }],
  });
  const zipTable = (out.detail_tables ?? []).find((t) => t.id === "freshness_by_zip");
  const row33904 = zipTable?.rows.find((r) => r.key === "33904");
  expect(row33904?.cells.source_tag).toBe("approx");
  expect(Number(row33904?.cells.value)).toBeCloseTo(300000 * (362000 / 350000), -1);
});

test("pack wiring: corpusSummary stashes rows, outputProducer reads them", () => {
  const fragments: RawFragment[] = [
    {
      fragment_id: "f1",
      source_id: "daily-truth",
      source_trust_tier: 2,
      fetched_at: "2026-06-15T12:00:00Z",
      raw: {},
      normalized: row({ value: 362000 }) as unknown as Record<string, unknown>,
    },
  ];
  // corpusSummary must populate module state for the (sync) producer.
  freshnessPulse.corpusSummary!(fragments);
  const out = freshnessPulse.outputProducer!({} as PackOutput);
  expect(out.direction).toBe("neutral");
  expect(out.key_metrics.map((m) => m.metric)).toContain(
    "freshness_median_asking_price_cape_coral_usd",
  );
});
