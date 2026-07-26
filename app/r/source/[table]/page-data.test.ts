import { describe, expect, test } from "bun:test";
import { isDegradedSourceSample } from "./page-data";

describe("isDegradedSourceSample — error shapes must never be cached for an hour", () => {
  test("no_creds / count_error / sample_error are degraded (never stored)", () => {
    expect(isDegradedSourceSample({ status: "no_creds" })).toBe(true);
    expect(isDegradedSourceSample({ status: "count_error" })).toBe(true);
    expect(isDegradedSourceSample({ status: "sample_error", rowCount: 12 })).toBe(true);
  });

  test("ok and empty are healthy outcomes — cacheable", () => {
    expect(isDegradedSourceSample({ status: "ok", rowCount: 3, rows: [{ a: 1 }] })).toBe(false);
    expect(isDegradedSourceSample({ status: "empty" })).toBe(false);
  });
});
