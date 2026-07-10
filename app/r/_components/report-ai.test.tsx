import { test, expect, beforeEach, afterAll } from "bun:test";
import type { ReactElement } from "react";
import { ReportAi } from "./report-ai";
import { ReportHighlightBridge } from "../../../components/highlighter/ReportHighlightBridge";

beforeEach(() => {
  delete process.env.HIGHLIGHTER_UI; // default = enabled
});
afterAll(() => {
  delete process.env.HIGHLIGHTER_UI;
});

function render(props: Parameters<typeof ReportAi>[0]): ReactElement | null {
  return ReportAi(props) as ReactElement | null;
}

test("encodes the surface via buildReportId (synthetic namespaced, brain bare)", () => {
  const zip = render({ surface: "zip", surfaceKey: "33901" });
  expect(zip?.type).toBe(ReportHighlightBridge);
  expect(zip?.props.reportId).toBe("zip:33901");
  const brain = render({ surface: "brain", surfaceKey: "housing-swfl" });
  expect(brain?.props.reportId).toBe("housing-swfl");
});

test("normalizes metrics: stringifies values, defaults per-metric freshness to the page token", () => {
  const el = render({
    surface: "corridor",
    surfaceKey: "us-41-fort-myers",
    freshnessToken: "tok-1",
    metrics: [{ label: "Cap rate", value: 6.2, sourceUrl: "https://x.example" }],
  });
  expect(el?.props.metricSuggestions).toEqual([
    {
      label: "Cap rate",
      value: "6.2",
      suggestions: [],
      sourceUrl: "https://x.example",
      sourceLabel: undefined,
      freshnessToken: "tok-1",
    },
  ]);
});

test("precomputed suggestions win; packId computes via suggestionsForMetric", () => {
  const el = render({
    surface: "zip",
    surfaceKey: "33901",
    metrics: [
      { label: "Median sale price", value: "$525,000", suggestions: ["keep me"] },
      { label: "Days on market", value: "12", packId: "housing-swfl" },
    ],
  });
  const [pre, computed] = (el?.props.metricSuggestions ?? []) as {
    suggestions: string[];
  }[];
  expect(pre.suggestions).toEqual(["keep me"]);
  expect(computed.suggestions.length).toBeGreaterThan(0);
});

test("renders nothing when the highlighter UI flag is off", () => {
  process.env.HIGHLIGHTER_UI = "0";
  expect(render({ surface: "method", surfaceKey: "cap_rate_median" })).toBeNull();
});
