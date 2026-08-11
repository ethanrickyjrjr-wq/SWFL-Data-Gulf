/**
 * Red-first tests for bakeExitCode — named after the failure modes they target.
 *
 * THE FAILURE THIS FIXES (08/11/2026): `bake-narratives.mts` returned 1 on ANY
 * validation failure. On 08/11 it baked 60 surfaces, correctly rejected 9 the
 * no-invention validator caught inventing numbers, kept the previous rows — and
 * exited 1. That reddened the whole nightly chain, which success-gates
 * `grade-predictions.yml`, so prediction grading was SKIPPED every night from
 * 07/22/2026 onward. A working guard was reported as a broken pipeline.
 *
 * The opposite error is the real danger and is explicitly tested below: a blanket
 * exit 0 would let failing surfaces serve last month's prose forever with nothing
 * saying so — the `stale-source-served-silently` shape (5 strikes, guard OWED).
 * So a partial-failure run is GREEN BUT LOUD, and systemic breakage is still RED.
 */
import { describe, expect, test } from "bun:test";
import { bakeExitCode, BAKE_FAIL_RATIO_DEFAULT } from "./bake-exit.mts";

describe("bakeExitCode", () => {
  test("FM1: a clean run is green", () => {
    expect(bakeExitCode({ baked: 60, failed: 0, skipped: 66 })).toBe(0);
  });

  test("FM2: THE REGRESSION — a mostly-good run with a few validator rejections is GREEN, not red (08/11 real tally: 60/66/9)", () => {
    expect(bakeExitCode({ baked: 60, failed: 9, skipped: 66 })).toBe(0);
  });

  test("FM3: total breakage — nothing baked while failures piled up — is still RED", () => {
    expect(bakeExitCode({ baked: 0, failed: 9, skipped: 66 })).toBe(1);
  });

  test("FM4: a systemic break — more surfaces failed than baked — is still RED", () => {
    // 40 failed of 50 attempted = 0.80, far above the default ceiling.
    expect(bakeExitCode({ baked: 10, failed: 40, skipped: 0 })).toBe(1);
  });

  test("FM5: the ceiling is inclusive — an even split is green, a majority-failure is red", () => {
    // 50 failed of 100 attempted = exactly 0.50.
    expect(bakeExitCode({ baked: 50, failed: 50, skipped: 0 })).toBe(0);
    expect(bakeExitCode({ baked: 49, failed: 51, skipped: 0 })).toBe(1);
  });

  test("FM5b: THE OVER-TIGHT-CEILING REGRESSION — a noisy night at ~2x observed rate must NOT redden the chain (first pass set 0.25 and would have)", () => {
    // Observed noise on 08/11/2026 was 9/69 = 13.0%. A bad night at double that
    // is still ordinary validator behaviour, not a systemic break.
    expect(bakeExitCode({ baked: 74, failed: 26, skipped: 0 })).toBe(0);
    expect(bakeExitCode({ baked: 60, failed: 20, skipped: 46 })).toBe(0);
  });

  test("FM6: an all-skipped run (nothing due) is green, and never divides by zero", () => {
    expect(bakeExitCode({ baked: 0, failed: 0, skipped: 126 })).toBe(0);
  });

  test("FM7: a caller-supplied hard error is RED regardless of a healthy tally", () => {
    expect(bakeExitCode({ baked: 60, failed: 0, skipped: 66, hardError: true })).toBe(1);
  });

  test("FM8: the ratio ceiling is overridable, so a stricter run can be demanded", () => {
    expect(bakeExitCode({ baked: 95, failed: 5, skipped: 0 }, 0.01)).toBe(1);
    expect(bakeExitCode({ baked: 95, failed: 5, skipped: 0 })).toBe(0);
  });

  test("FM9: the default ceiling is a stated number, not a floating literal", () => {
    expect(BAKE_FAIL_RATIO_DEFAULT).toBe(0.5);
  });
});
