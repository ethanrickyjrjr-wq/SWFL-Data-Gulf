// lib/buyer-leverage/cut-history.test.ts
import { expect, test } from "bun:test";
import { deriveCutHistory, type TransitionRow } from "./cut-history";

const cut = (at: string, delta: number, from = "active", to = "active"): TransitionRow => ({
  at,
  from_state: from,
  to_state: to,
  price: 500000,
  price_delta: delta,
});

test("counts only same-state negative price moves as cuts", () => {
  const rows: TransitionRow[] = [
    cut("2026-07-10", -20000),
    cut("2026-06-01", -25000),
    cut("2026-05-01", 15000), // a RAISE — excluded
    cut("2026-04-01", -10000, "holding", "active"), // relist delta — excluded (state changed)
  ];
  const h = deriveCutHistory(rows, false);
  expect(h.count).toBe(2);
  expect(h.totalCutUsd).toBe(45000);
  expect(h.events.map((e) => e.date)).toEqual(["07/10/2026", "06/01/2026"]);
  expect(h.complete).toBe(true);
});

test("floored subject → complete=false (count is a lower bound)", () => {
  const h = deriveCutHistory([cut("2026-07-10", -20000)], true);
  expect(h.count).toBe(1);
  expect(h.complete).toBe(false);
});

test("no cuts → zeros, empty events, never throws", () => {
  const h = deriveCutHistory([], false);
  expect(h).toEqual({ count: 0, totalCutUsd: 0, events: [], complete: true });
});
