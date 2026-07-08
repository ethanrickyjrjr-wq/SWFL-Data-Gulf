import { test, expect } from "bun:test";
import { marketSnapshotForZip } from "./market-snapshot";
import type { ParsedBrain } from "@/refinery/render/speaker.mts";

// Minimal ParsedBrain stub: only the fields marketSnapshotForZip reads.
function brainWithZipRow(cells: Record<string, unknown>): ParsedBrain {
  return {
    freshness_token: "SWFL-housing-swfl-20260701",
    output: {
      detail_tables: [
        {
          id: "housing_by_zip",
          grain: "zip",
          columns: [],
          rows: [{ key: "33908", label: "33908", cells }],
          source: { citation: "Redfin via SWFL Data Gulf", url: "https://www.redfin.com" },
        },
      ],
    },
  } as unknown as ParsedBrain;
}

test("returns the ZIP's snapshot with market type inferred from months_of_supply", async () => {
  const load = async () =>
    brainWithZipRow({
      months_of_supply: 2.1,
      inventory: 140,
      homes_sold: 66,
      median_sale_price: 489000,
      median_dom: 41,
      low_sample: false,
    });
  const snap = await marketSnapshotForZip("33908", { load });
  expect(snap).not.toBeNull();
  expect(snap!.monthsOfSupply).toBe(2.1);
  expect(snap!.activeInventory).toBe(140);
  expect(snap!.homesSold).toBe(66);
  expect(snap!.marketType).toBe("Seller's market"); // < 3
  expect(snap!.asOf).toBe("07/01/2026"); // MM/DD/YYYY from the freshness token
});

test("infers a buyer's market above 6 months and balanced between", async () => {
  const buyer = await marketSnapshotForZip("33908", {
    load: async () => brainWithZipRow({ months_of_supply: 7.5, homes_sold: 30, low_sample: false }),
  });
  expect(buyer!.marketType).toBe("Buyer's market");
  const bal = await marketSnapshotForZip("33908", {
    load: async () => brainWithZipRow({ months_of_supply: 4.5, homes_sold: 30, low_sample: false }),
  });
  expect(bal!.marketType).toBe("Balanced");
});

test("returns null on a thin-sample row (never shown stale)", async () => {
  const snap = await marketSnapshotForZip("33908", {
    load: async () => brainWithZipRow({ months_of_supply: 2.0, homes_sold: 3, low_sample: true }),
  });
  expect(snap).toBeNull();
});

test("returns null when months_of_supply is null (nothing solid to show)", async () => {
  const snap = await marketSnapshotForZip("33908", {
    load: async () =>
      brainWithZipRow({ months_of_supply: null, homes_sold: 40, low_sample: false }),
  });
  expect(snap).toBeNull();
});

test("returns null on a missing ZIP row, and never throws when the brain is absent", async () => {
  expect(
    await marketSnapshotForZip("00000", {
      load: async () => brainWithZipRow({ months_of_supply: 2 }),
    }),
  ).toBeNull();
  expect(await marketSnapshotForZip("33908", { load: async () => null })).toBeNull();
});
