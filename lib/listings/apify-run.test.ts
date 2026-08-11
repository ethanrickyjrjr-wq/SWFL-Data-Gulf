// lib/listings/apify-run.test.ts
//
// The shared guarded runner: the refusal paths must short-circuit BEFORE any
// network call. The fetch stub FAILS the test if reached — no test may spend.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { runGuardedApifyActor } from "./apify-run";
import { resetSpendLedger, spendLedger } from "./apify-spend-guard";

const realFetch = globalThis.fetch;
let fetchCalls = 0;

beforeEach(() => {
  resetSpendLedger();
  fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls++;
    throw new Error("TEST VIOLATION: guarded runner reached the network");
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  resetSpendLedger();
});

describe("runGuardedApifyActor", () => {
  test("FAILURE: switch off → refused loudly with [] and ZERO network calls", async () => {
    const prev = process.env.OPERATOR_APPROVED_PAID_RUN;
    delete process.env.OPERATOR_APPROVED_PAID_RUN;
    try {
      const out = await runGuardedApifyActor({
        actorId: "one-api~realtor-property-scraper",
        input: { property_inputs: ["123 Main St, Columbus, OH"] },
        requestedResults: 1,
      });
      expect(out).toEqual([]);
      expect(fetchCalls).toBe(0);
      expect(spendLedger().refused).toBe(true);
      expect(spendLedger().results).toBe(0); // nothing charged on a refusal
    } finally {
      if (prev !== undefined) process.env.OPERATOR_APPROVED_PAID_RUN = prev;
    }
  });

  test("FAILURE: a non-positive requestedResults is priced as UNLIMITED, never as free", async () => {
    const prev = process.env.OPERATOR_APPROVED_PAID_RUN;
    delete process.env.OPERATOR_APPROVED_PAID_RUN;
    try {
      // Even refused, the point stands at the guard layer (covered in its own
      // test file); here we assert the runner passes the raw value through and
      // still refuses with the switch off rather than treating 0 as harmless.
      const out = await runGuardedApifyActor({
        actorId: "x~y",
        input: {},
        requestedResults: 0,
      });
      expect(out).toEqual([]);
      expect(fetchCalls).toBe(0);
    } finally {
      if (prev !== undefined) process.env.OPERATOR_APPROVED_PAID_RUN = prev;
    }
  });
});
