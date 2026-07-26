import { describe, expect, test } from "bun:test";
import { isDegradedZipModules, type ZipPageModules } from "./page-data";

const healthy: ZipPageModules = {
  metroTrend: {
    data: [{ period: "2026-06-01", cape_coral: 400000 }],
  } as ZipPageModules["metroTrend"],
  sourcedFigures: [],
  narrative: null,
  pulseNearby: [],
  seedEmailHtml: null,
};

describe("isDegradedZipModules — an env-wide outage must never be cached for an hour", () => {
  test("all lake-backed modules empty = degraded (missing creds / outage shape)", () => {
    expect(
      isDegradedZipModules({
        metroTrend: { data: [] },
        sourcedFigures: [],
        narrative: null,
        pulseNearby: [],
        seedEmailHtml: null,
      }),
    ).toBe(true);
  });

  test("any one module with data = healthy, cacheable", () => {
    expect(isDegradedZipModules(healthy)).toBe(false);
  });

  test("seedEmailHtml alone never rescues a degraded tuple — it is legitimately null-able", () => {
    expect(
      isDegradedZipModules({
        metroTrend: { data: [] },
        sourcedFigures: [],
        narrative: null,
        pulseNearby: [],
        seedEmailHtml: "<html>seed</html>",
      }),
    ).toBe(true);
  });
});
