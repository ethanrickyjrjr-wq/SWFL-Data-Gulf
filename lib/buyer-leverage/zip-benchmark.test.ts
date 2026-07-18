// lib/buyer-leverage/zip-benchmark.test.ts
import { expect, test } from "bun:test";
import { fetchZipBenchmark } from "./zip-benchmark";

test("assembles median + share + sample size", async () => {
  const b = await fetchZipBenchmark("33904", {
    fetchMedian: async () => ({ median_dom: 44, sample_size: 120 }),
    fetchShare: async () => 0.31,
  });
  expect(b).toEqual({ medianDomDays: 44, priceReducedShare: 0.31, sampleSize: 120 });
});

test("thin sample still returns; caller decides to drop", async () => {
  const b = await fetchZipBenchmark("34142", {
    fetchMedian: async () => ({ median_dom: 12, sample_size: 2 }),
    fetchShare: async () => null,
  });
  expect(b?.sampleSize).toBe(2);
  expect(b?.priceReducedShare).toBeNull();
});

test("both reads empty → null benchmark", async () => {
  const b = await fetchZipBenchmark("33904", {
    fetchMedian: async () => ({ median_dom: null, sample_size: 0 }),
    fetchShare: async () => null,
  });
  expect(b).toBeNull();
});

test("throwing reads → null (empty-tolerant)", async () => {
  // Brief-typo fix: the verbatim brief had fetchShare return 0.2 while asserting toBeNull().
  // That contradicts the global constraint ("return null only when BOTH are absent") AND the
  // verbatim implementation AND test 2 (present value → non-null benchmark). A throwing median
  // is caught → null median; with share ALSO null this is a genuine both-absent case → null.
  const b = await fetchZipBenchmark("33904", {
    fetchMedian: async () => {
      throw new Error("no rpc");
    },
    fetchShare: async () => null,
  });
  expect(b).toBeNull();
});
