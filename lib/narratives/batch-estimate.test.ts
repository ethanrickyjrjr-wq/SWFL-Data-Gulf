import { describe, expect, it } from "bun:test";
import { estimateRequestUsd, sizeToCap } from "./batch-estimate";

describe("estimateRequestUsd", () => {
  it("prices chars/4 input + full output ceiling at BATCH rates", () => {
    // 4M chars -> 1M input tokens @ $1.50/MTok batch + 1400 output tokens @ $7.50/MTok batch
    expect(estimateRequestUsd(4_000_000)).toBeCloseTo(1.5 + (1400 / 1_000_000) * 7.5, 6);
  });
});

describe("sizeToCap", () => {
  it("keeps items in order until the cap, drops the rest", () => {
    const items = [
      { promptChars: 4_000_000, key: "a" },
      { promptChars: 4_000_000, key: "b" },
      { promptChars: 4_000_000, key: "c" },
    ];
    const { fit, dropped, estimatedUsd } = sizeToCap(items, 3.1);
    expect(fit.map((i) => i.key)).toEqual(["a", "b"]);
    expect(dropped.map((i) => i.key)).toEqual(["c"]);
    expect(estimatedUsd).toBeCloseTo(2 * estimateRequestUsd(4_000_000), 6);
  });

  it("zero items fits trivially", () => {
    expect(sizeToCap([], 1)).toEqual({ fit: [], dropped: [], estimatedUsd: 0 });
  });
});
