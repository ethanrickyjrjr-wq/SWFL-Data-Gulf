import { test, expect } from "bun:test";
import { resolveSocialHero, evaluateChartCoherence } from "./chart-attach";
import type { SocialDesign } from "./types";
import type { ChartSpec } from "@/components/charts/registry/chart-spec";

function designWith(elements: SocialDesign["elements"]): SocialDesign {
  return { version: 1, format: "portrait", background: "#000", elements };
}

test("resolveSocialHero: picks the largest-font stat and parses its value", () => {
  const hero = resolveSocialHero(
    designWith([
      {
        id: "a",
        type: "stat",
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        value: "$412K",
        label: "median",
        valueFontSize: 80,
        labelFontSize: 20,
        fill: "#fff",
        accent: "#0ea5b7",
      },
      {
        id: "b",
        type: "stat",
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        value: "$3.2M",
        label: "top sale",
        valueFontSize: 120,
        labelFontSize: 20,
        fill: "#fff",
        accent: "#0ea5b7",
      },
    ]),
  );
  expect(hero).toEqual({ value: 3_200_000, unit: "currency" }); // the 120px stat wins, deterministically
});

test("resolveSocialHero: no stat element → null (safe default, chart attaches)", () => {
  const hero = resolveSocialHero(
    designWith([
      {
        id: "t",
        type: "text",
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        text: "hi",
        fontSize: 40,
        fontFamily: "Arial",
        fill: "#fff",
      },
    ]),
  );
  expect(hero).toBeNull();
});

test("resolveSocialHero: an unparseable stat value is skipped", () => {
  const hero = resolveSocialHero(
    designWith([
      {
        id: "a",
        type: "stat",
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        value: "Coming soon",
        label: "x",
        valueFontSize: 100,
        labelFontSize: 20,
        fill: "#fff",
        accent: "#0ea5b7",
      },
    ]),
  );
  expect(hero).toBeNull();
});

test("evaluateChartCoherence: null hero is always coherent (nothing to compare)", () => {
  const spec = {
    frameId: "bar-table",
    value_format: "usd",
    columns: ["z", "v"],
    rows: [
      ["a", 400000],
      ["b", 420000],
    ],
  } as ChartSpec;
  expect(evaluateChartCoherence(spec, null)).toEqual({ coherent: true });
});

test("evaluateChartCoherence: a $3.2M headline over a ~$400K chart is incoherent", () => {
  const spec = {
    frameId: "bar-table",
    value_format: "usd",
    columns: ["z", "v"],
    rows: [
      ["a", 400000],
      ["b", 420000],
    ],
  } as ChartSpec;
  const res = evaluateChartCoherence(spec, { value: 3_200_000, unit: "currency" });
  expect(res.coherent).toBe(false);
});

test("evaluateChartCoherence: a $412K headline over a ~$400K chart is coherent", () => {
  const spec = {
    frameId: "bar-table",
    value_format: "usd",
    columns: ["z", "v"],
    rows: [
      ["a", 400000],
      ["b", 420000],
    ],
  } as ChartSpec;
  expect(evaluateChartCoherence(spec, { value: 412_000, unit: "currency" })).toEqual({
    coherent: true,
  });
});
