import { test, expect } from "bun:test";
import { parseChartRequest } from "./route";

test("parseChartRequest: valid body with a stat headline resolves the hero", () => {
  const parsed = parseChartRequest({
    prompt: "median price by ZIP in Cape Coral",
    scope: { kind: "city", value: "Cape Coral" },
    design: {
      version: 1,
      format: "portrait",
      background: "#000",
      elements: [
        {
          id: "s",
          type: "stat",
          x: 0,
          y: 0,
          width: 1,
          height: 1,
          value: "$412K",
          label: "median",
          valueFontSize: 100,
          labelFontSize: 20,
          fill: "#fff",
          accent: "#0ea5b7",
        },
      ],
    },
  });
  expect(parsed).not.toBeNull();
  expect(parsed!.prompt).toBe("median price by ZIP in Cape Coral");
  expect(parsed!.hero).toEqual({ value: 412_000, unit: "currency" });
});

test("parseChartRequest: empty prompt → null (nothing to chart)", () => {
  expect(parseChartRequest({ prompt: "   " })).toBeNull();
});

test("parseChartRequest: missing design → hero null (still valid, chart attaches)", () => {
  const parsed = parseChartRequest({ prompt: "vacancy by corridor" });
  expect(parsed).not.toBeNull();
  expect(parsed!.hero).toBeNull();
});
