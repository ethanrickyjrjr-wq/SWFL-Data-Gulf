// refinery/agents/spend-guard.test.mts — the hard spend cap at the ONE client seam.
import { describe, expect, test } from "bun:test";
import { assertUnderCaps, spendCaps, SpendCapError } from "./anthropic.mts";

describe("spendCaps (env parsing)", () => {
  test("defaults when unset; never silently zero", () => {
    const caps = spendCaps({} as NodeJS.ProcessEnv);
    expect(caps.dailyUsd).toBe(25);
    expect(caps.monthlyUsd).toBe(250);
    expect(caps.off).toBe(false);
  });

  test("env overrides win; garbage falls back to defaults", () => {
    const caps = spendCaps({
      ANTHROPIC_DAILY_SPEND_CAP_USD: "5",
      ANTHROPIC_MONTHLY_SPEND_CAP_USD: "nonsense",
    } as unknown as NodeJS.ProcessEnv);
    expect(caps.dailyUsd).toBe(5);
    expect(caps.monthlyUsd).toBe(250);
  });

  test("a zero/negative cap is refused (would block everything) — default wins", () => {
    const caps = spendCaps({
      ANTHROPIC_DAILY_SPEND_CAP_USD: "0",
    } as unknown as NodeJS.ProcessEnv);
    expect(caps.dailyUsd).toBe(25);
  });

  test("kill-switch env recognized", () => {
    expect(spendCaps({ ANTHROPIC_SPEND_CAP_OFF: "1" } as unknown as NodeJS.ProcessEnv).off).toBe(
      true,
    );
  });
});

describe("assertUnderCaps (the gate)", () => {
  const caps = { dailyUsd: 25, monthlyUsd: 250, off: false };

  test("under both caps → passes", () => {
    expect(() => assertUnderCaps({ dayUsd: 24.99, monthUsd: 249.99 }, caps)).not.toThrow();
  });

  test("daily breach throws a NAMED loud error with the override path", () => {
    let err: unknown;
    try {
      assertUnderCaps({ dayUsd: 25, monthUsd: 30 }, caps);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(SpendCapError);
    expect((err as Error).message).toContain("daily");
    expect((err as Error).message).toContain("ANTHROPIC_DAILY_SPEND_CAP_USD");
  });

  test("monthly breach throws even when the day is quiet", () => {
    expect(() => assertUnderCaps({ dayUsd: 1, monthUsd: 250 }, caps)).toThrow(SpendCapError);
  });

  test("null window (spend query failed) passes — fail-open by design", () => {
    expect(() => assertUnderCaps(null, caps)).not.toThrow();
  });

  test("kill-switch bypasses even a breach", () => {
    expect(() =>
      assertUnderCaps({ dayUsd: 999, monthUsd: 9999 }, { ...caps, off: true }),
    ).not.toThrow();
  });
});
