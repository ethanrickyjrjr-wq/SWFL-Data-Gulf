// lib/email/insiders/budget.test.ts
import { describe, expect, test } from "bun:test";
import { IssueBudget, IssueBudgetError } from "./budget";

const MTOK = 1_000_000;

describe("IssueBudget", () => {
  test("records passes at real model rates and sums", () => {
    const b = new IssueBudget(20);
    // 250K in + 30K out on fable-5 = $2.50 + $1.50 = $4.00
    const e = b.record("draft", "claude-fable-5", {
      input_tokens: 0.25 * MTOK,
      output_tokens: 0.03 * MTOK,
    });
    expect(e.costUsd).toBeCloseTo(4.0, 2);
    expect(b.spentUsd()).toBeCloseTo(4.0, 2);
  });

  test("assertRoom throws a NAMED error when cap would be breached", () => {
    const b = new IssueBudget(20);
    b.record("draft", "claude-fable-5", { input_tokens: 1.5 * MTOK, output_tokens: 0.05 * MTOK }); // $17.50
    expect(() => b.assertRoom(5)).toThrow(IssueBudgetError); // 17.50 + 5 > 20
    expect(() => b.assertRoom(2)).not.toThrow(); // 19.50 <= 20
  });

  test("fallback-served pass logs at the SERVED model's rate", () => {
    const b = new IssueBudget(20);
    const e = b.record("draft", "claude-opus-4-8", { input_tokens: 1 * MTOK, output_tokens: 0 });
    expect(e.costUsd).toBeCloseTo(5.0, 2); // opus input rate, not fable's
  });
});
