import { describe, expect, test } from "bun:test";
import {
  CORRELATION_MIN_ZIPS,
  correlationMatrix,
  criticalR,
  isEstablished,
  pearson,
} from "./correlation";

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

describe("a correlation must be ESTABLISHED, not merely computed", () => {
  test("criticalR matches the published table", () => {
    expect(criticalR(10)).toBeCloseTo(0.632, 2); // n=10, df=8
    expect(criticalR(30)).toBeCloseTo(0.361, 2); // n=30, df=28
  });

  test("r = 0.5 at n = 10 is NOT established — the heatmap colors it today", () => {
    // 0.5 lands in the '0.2 to 0.6' bucket and renders as a real correlation.
    // At n=10 the critical value is 0.632, so 0.5 is indistinguishable from zero.
    expect(isEstablished(0.5, 10)).toBe(false);
  });

  test("r = 0.7 at n = 10 IS established", () => {
    expect(isEstablished(0.7, 10)).toBe(true);
  });

  test("the same r becomes established with more data", () => {
    expect(isEstablished(0.5, 10)).toBe(false);
    expect(isEstablished(0.5, 30)).toBe(true); // crit ~0.361
  });

  test("a null r is never established, at any n", () => {
    expect(isEstablished(null, 50)).toBe(false);
    expect(isEstablished(Number.NaN, 50)).toBe(false);
  });

  test("sign does not matter — the gate is on |r|", () => {
    expect(isEstablished(-0.7, 10)).toBe(true);
    expect(isEstablished(-0.5, 10)).toBe(false);
  });
});

describe("correlationMatrix judges each pair against ITS OWN n", () => {
  // Three metrics. `a` and `b` are complete on every row; `c` is present on only
  // the first 12. So a×b is judged at the full n and a×c at n = 12 — using the
  // GLOBAL min n for both would wrongly condemn the pair that has plenty of data.
  const metrics = [
    { key: "a", label: "A" },
    { key: "b", label: "B" },
    { key: "c", label: "C" },
  ];

  // A deterministic, seed-free zig-zag: strong enough to clear the critical value
  // at n = 40 (crit ≈ 0.312) but NOT at n = 12 (crit ≈ 0.576).
  const FULL = 40;
  const SHORT = 12;
  const rows = Array.from({ length: FULL }, (_, i) => ({
    a: i,
    b: i + (i % 2 === 0 ? 9 : -9), // moderate positive r with `a`
    c: i < SHORT ? i + (i % 2 === 0 ? 9 : -9) : null, // same shape, fewer rows
  }));

  test("emits `established` and per-pair `pairN` alongside the matrix", () => {
    const res = correlationMatrix(rows, metrics);
    expect(res).not.toBeNull();

    // The pairs really do have different complete-case counts.
    expect(res!.pairN[0][1]).toBe(FULL);
    expect(res!.pairN[0][2]).toBe(SHORT);
    expect(res!.minPairN).toBe(SHORT);

    // Same underlying relationship, both r's land in the coloured 0.2–0.6 band…
    const rFull = res!.matrix[0][1] as number;
    const rShort = res!.matrix[0][2] as number;
    expect(Math.abs(rFull)).toBeGreaterThan(0.2);
    expect(Math.abs(rShort)).toBeGreaterThan(0.2);

    // …but only the one with enough data clears ITS OWN critical value.
    expect(Math.abs(rFull)).toBeGreaterThan(criticalR(FULL));
    expect(Math.abs(rShort)).toBeLessThan(criticalR(SHORT));
    expect(res!.established[0][1]).toBe(true);
    expect(res!.established[0][2]).toBe(false); // would be COLOURED today
    expect(res!.established[2][0]).toBe(false); // symmetric

    // The diagonal is r = 1 and never greys.
    expect(res!.established[0][0]).toBe(true);
    expect(res!.established[1][1]).toBe(true);
    expect(res!.established[2][2]).toBe(true);
    expect(res!.pairN[1][1]).toBe(FULL);
    expect(res!.pairN[2][2]).toBe(SHORT);
  });

  test("the gate runs on the RAW r, not the 2dp rounded cell", () => {
    // `matrix` is rounded to 2dp for DISPLAY. Significance must be judged on the
    // full-precision r — a cell may not become established by a rounding artifact.
    const res = correlationMatrix(rows, metrics);
    const col = (key: "a" | "b" | "c", other: "a" | "b" | "c") =>
      rows.filter((r) => r[key] != null && r[other] != null).map((r) => r[key] as number);

    for (const [i, j] of [
      [0, 1],
      [0, 2],
      [1, 2],
    ] as const) {
      const ki = metrics[i].key as "a" | "b" | "c";
      const kj = metrics[j].key as "a" | "b" | "c";
      const rawR = pearson(col(ki, kj), col(kj, ki));
      const n = res!.pairN[i][j];
      // The flag agrees with the RAW r, which is what the source must gate on.
      expect(res!.established[i][j]).toBe(isEstablished(rawR, n));
      // And the displayed cell really is the rounded one (so the two can differ).
      expect(res!.matrix[i][j]).toBeCloseTo(Math.round((rawR as number) * 100) / 100, 10);
    }
  });
});
