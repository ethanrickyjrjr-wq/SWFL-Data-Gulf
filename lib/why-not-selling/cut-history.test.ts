import { test, expect } from "bun:test";
import { loadCutHistory } from "./cut-history";

test("keeps only same-state negative-delta rows, oldest first", async () => {
  const rows = [
    {
      at: "2026-05-01",
      price: 590000,
      price_delta: -10000,
      from_state: "active",
      to_state: "active",
    },
    {
      at: "2026-03-01",
      price: 600000,
      price_delta: -15000,
      from_state: "active",
      to_state: "active",
    },
    {
      at: "2026-04-01",
      price: 600000,
      price_delta: null,
      from_state: "holding",
      to_state: "active",
    },
    {
      at: "2026-06-01",
      price: 605000,
      price_delta: 15000,
      from_state: "active",
      to_state: "active",
    },
  ];
  const cuts = await loadCutHistory("K:33904", { fetchRows: async () => rows });
  expect(cuts.map((c) => c.at)).toEqual(["2026-03-01", "2026-05-01"]);
});

test("empty-tolerant: fetch error -> []", async () => {
  const cuts = await loadCutHistory("K:33904", {
    fetchRows: async () => {
      throw new Error("x");
    },
  });
  expect(cuts).toEqual([]);
});
