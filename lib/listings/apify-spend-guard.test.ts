// lib/listings/apify-spend-guard.test.ts
//
// THE FAILURE THIS SUITE IS NAMED FOR — 08/05/2026, $14.37 in one afternoon.
//
// Seven acceptance renders of ONE email each bought a fresh ~200-record ZIP month
// (~$1.95) plus a 5-record subject query (~$0.05). Nothing in the tree could stop
// it, because nothing in the tree knew a call cost money: there was no switch, no
// budget, and the only "receipt" counted ROWS ADDED to our own cache — which is
// ZERO when you re-buy the same 200 houses, so it printed "0 bought" while $2.00
// was being charged.
//
// Every test below is one of those facts turned into a red line.

import { describe, test, expect, beforeEach } from "bun:test";
import {
  resetSpendLedger,
  spendLedger,
  requestSpend,
  paidLaneEnabled,
  SpendRefusal,
  PROCESS_RESULT_BUDGET,
} from "./apify-spend-guard";

const ON = { OPERATOR_APPROVED_PAID_RUN: "1" };

beforeEach(() => resetSpendLedger());

// ── F1 · OFF BY DEFAULT. The whole point. ────────────────────────────────────
describe("F1 · the paid lane is OFF unless the operator turned it on for THIS run", () => {
  test("no env var set → the lane is off and a spend request is refused", () => {
    expect(paidLaneEnabled({})).toBe(false);
    const verdict = requestSpend(200, {});
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe(SpendRefusal.SwitchOff);
  });

  test("OPERATOR_APPROVED_PAID_RUN=1 turns it on — the repo's existing idiom, not a new one", () => {
    expect(paidLaneEnabled(ON)).toBe(true);
    expect(requestSpend(200, ON).allowed).toBe(true);
  });

  test("a refusal NEVER spends: the ledger stays at zero", () => {
    requestSpend(200, {});
    requestSpend(200, {});
    expect(spendLedger().results).toBe(0);
  });
});

// ── F2 · COUNT WHAT IS REQUESTED, BEFORE THE CALL. ───────────────────────────
// A call that RETURNS 200 records has already been billed for them. A budget that
// only counts returned rows learns the price after paying it — which is exactly
// how the row-delta receipt lied.
describe("F2 · the budget is charged on the REQUESTED cap, before the vendor is called", () => {
  test("the ledger moves on request, not on response", () => {
    requestSpend(200, ON);
    expect(spendLedger().results).toBe(200);
  });

  test("the process budget is a HARD stop across separate calls", () => {
    let allowed = 0;
    for (let i = 0; i < 100; i++) if (requestSpend(200, ON).allowed) allowed += 200;
    expect(allowed).toBeLessThanOrEqual(PROCESS_RESULT_BUDGET);
  });

  test("the call that would BREACH the budget is refused whole — never half-bought", () => {
    requestSpend(PROCESS_RESULT_BUDGET - 10, ON);
    const verdict = requestSpend(200, ON);
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe(SpendRefusal.BudgetExhausted);
    expect(spendLedger().results).toBe(PROCESS_RESULT_BUDGET - 10);
  });

  test("SEVEN RENDERS OF ONE EMAIL CANNOT COST $14 AGAIN — the 08/05/2026 shape", () => {
    // One render bought two sale months at ~200 each. Seven renders did it seven times.
    for (let render = 0; render < 7; render++) {
      requestSpend(200, ON);
      requestSpend(200, ON);
    }
    expect(spendLedger().estimatedUsd).toBeLessThanOrEqual(PROCESS_RESULT_BUDGET * 0.01);
    // The real bill that day was $14.08 on this path. The ceiling must be well under it.
    expect(spendLedger().estimatedUsd).toBeLessThan(14.08);
  });
});

// ── F3 · A REFUSAL IS NOT AN EMPTY MARKET. ───────────────────────────────────
// This file's directory has TWO scars from exactly this: the APIFY_KEY name
// mismatch returned a silent [] that read as "no comps", and a 403 hard-limit
// returned a silent [] that read as "this ZIP has no sold homes". A guard that
// returns a quiet [] is the third instance of the same bug.
describe("F3 · a refusal is DISTINGUISHABLE from 'the market is empty'", () => {
  test("every refusal names WHICH refusal it was", () => {
    expect(requestSpend(200, {}).reason).toBe(SpendRefusal.SwitchOff);
    requestSpend(PROCESS_RESULT_BUDGET, ON);
    expect(requestSpend(1, ON).reason).toBe(SpendRefusal.BudgetExhausted);
  });

  test("the ledger reports that a refusal HAPPENED, so a caller can say so out loud", () => {
    requestSpend(200, {});
    expect(spendLedger().refusals).toBe(1);
    expect(spendLedger().refused).toBe(true);
  });

  test("a clean run reports no refusal — the flag cannot be always-on", () => {
    requestSpend(10, ON);
    expect(spendLedger().refused).toBe(false);
  });
});

// ── F4 · A NON-POSITIVE CAP IS UNLIMITED TO THIS VENDOR. ─────────────────────
// `max_results_per_location: 0` means UNLIMITED (up to 10k) — a $100 run from one
// omitted field. The guard must never treat 0 as "free".
describe("F4 · an unbounded request can never be waved through as costing nothing", () => {
  test("a 0 or negative cap is charged as the vendor's real ceiling, not as zero", () => {
    requestSpend(0, ON);
    expect(spendLedger().results).toBeGreaterThan(0);
  });

  test("an unbounded request alone exhausts the budget rather than slipping under it", () => {
    expect(requestSpend(0, ON).allowed).toBe(true);
    expect(requestSpend(1, ON).allowed).toBe(false);
  });
});
