import { test, expect, beforeEach } from "bun:test";
import {
  getReportContext,
  publishReportContext,
  clearReportContext,
  subscribeReportContext,
  resolveSuggestions,
  resolveMetric,
  __resetReportContextForTest,
  type MetricSuggestion,
  type ReportContext,
} from "./report-context-store";
import type { SelectedFact } from "./use-highlight";

beforeEach(() => __resetReportContextForTest());

/** A SelectedFact stub — the resolvers only read text/context/factType. */
function fact(text: string, factType: SelectedFact["factType"], context?: string): SelectedFact {
  return { text, factType, context, rect: {} as DOMRect, mode: "fact" };
}

const REPORT: ReportContext = {
  reportId: "zip:33931",
  conclusion: "Fort Myers Beach carries elevated flood loss.",
  freshnessToken: "SWFL-7421-v5-20260622",
  metricSuggestions: [],
};

// ── store ────────────────────────────────────────────────────────────────────

test("publish → get; clear → null", () => {
  expect(getReportContext()).toBeNull();
  publishReportContext(REPORT);
  expect(getReportContext()).toEqual(REPORT);
  clearReportContext();
  expect(getReportContext()).toBeNull();
});

test("publishing an UNCHANGED context does not notify (no useSyncExternalStore loop)", () => {
  let hits = 0;
  const unsub = subscribeReportContext(() => hits++);
  publishReportContext(REPORT);
  expect(hits).toBe(1);
  // Same load-bearing fields → no-op (same metricSuggestions reference).
  publishReportContext({ ...REPORT });
  expect(hits).toBe(1);
  // A real change notifies.
  publishReportContext({ ...REPORT, reportId: "zip:33908" });
  expect(hits).toBe(2);
  unsub();
});

test("clear only notifies when there was an active context", () => {
  let hits = 0;
  const unsub = subscribeReportContext(() => hits++);
  clearReportContext(); // already null → no-op
  expect(hits).toBe(0);
  publishReportContext(REPORT);
  clearReportContext();
  expect(hits).toBe(2); // publish + clear
  unsub();
});

// ── resolvers (relocated from HighlighterLayer) ────────────────────────────────

const carried: MetricSuggestion[] = [
  {
    label: "Median sale price",
    suggestions: ["What's driving this?", "How does Collier compare?"],
    value: "$525,000",
    sourceUrl: "https://example.com/src",
    freshnessToken: "SWFL-7421-v5-20260622",
  },
];

test("resolveSuggestions matches a carried metric by row-context label", () => {
  expect(resolveSuggestions(fact("$525,000", "metric", "Median sale price"), carried)).toEqual([
    "What's driving this?",
    "How does Collier compare?",
  ]);
});

test("resolveSuggestions falls back to type-aware chips for an unmatched selection", () => {
  const out = resolveSuggestions(fact("Fort Myers Beach", "place"), carried);
  expect(Array.isArray(out)).toBe(true);
  // It must NOT echo the carried report chips when there is no row-label match.
  expect(out).not.toEqual(carried[0].suggestions);
});

test("resolveMetric returns the full carried metric on a label match, null otherwise", () => {
  expect(resolveMetric(fact("$525,000", "metric", "Median sale price"), carried)).toEqual(
    carried[0],
  );
  expect(resolveMetric(fact("$525,000", "metric"), carried)).toBeNull();
  expect(resolveMetric(fact("$525,000", "metric", "Unknown row"), carried)).toBeNull();
});
