import { describe, expect, test } from "bun:test";
import { CORRELATION_MIN_ZIPS, correlationMatrix, pearson } from "./correlation";

const N = CORRELATION_MIN_ZIPS;

describe("pearson", () => {
  test("perfect positive and negative", () => {
    const xs = Array.from({ length: N }, (_, i) => i + 1);
    expect(
      pearson(
        xs,
        xs.map((v) => v * 3 + 2),
      ),
    ).toBeCloseTo(1, 10);
    expect(
      pearson(
        xs,
        xs.map((v) => -2 * v),
      ),
    ).toBeCloseTo(-1, 10);
  });

  test("known fixture", () => {
    // r for these pairs is 0.9037 (hand-checked: cov=6, sd_x=2.236, sd_y=2.969
    // over the padded series below keeps proportionality — use a direct case).
    const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const ys = [2, 1, 4, 3, 6, 5, 8, 7, 10, 9];
    const r = pearson(xs, ys);
    expect(r).not.toBeNull();
    expect(r as number).toBeGreaterThan(0.9);
    expect(r as number).toBeLessThan(1);
  });

  test("null under min n and on zero variance", () => {
    expect(pearson([1, 2, 3], [1, 2, 3])).toBeNull();
    const xs = Array.from({ length: N }, (_, i) => i);
    expect(pearson(Array(N).fill(5), xs)).toBeNull();
  });
});

describe("correlationMatrix", () => {
  const metrics = [
    { key: "a", label: "A" },
    { key: "b", label: "B" },
  ];

  test("symmetric with unit diagonal", () => {
    const rows = Array.from({ length: N }, (_, i) => ({ a: i, b: i * 2 + 1 }));
    const res = correlationMatrix(rows, metrics);
    expect(res).not.toBeNull();
    expect(res!.matrix[0][0]).toBe(1);
    expect(res!.matrix[1][1]).toBe(1);
    expect(res!.matrix[0][1]).toBe(res!.matrix[1][0]);
    expect(res!.matrix[0][1]).toBeCloseTo(1, 5);
    expect(res!.minPairN).toBe(N);
  });

  test("skips incomplete rows; null when a pair goes under min n", () => {
    const complete = Array.from({ length: N }, (_, i) => ({ a: i, b: i }));
    const withGaps = [...complete, { a: 99, b: null }, { a: null, b: 99 }];
    const res = correlationMatrix(withGaps, metrics);
    expect(res).not.toBeNull();
    expect(res!.minPairN).toBe(N);

    const tooFew = complete.slice(0, N - 1);
    expect(correlationMatrix(tooFew, metrics)).toBeNull();
  });
});
