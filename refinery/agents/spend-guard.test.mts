// refinery/agents/spend-guard.test.mts — the hard spend cap at the ONE client seam.
import { describe, expect, test } from "bun:test";
import {
  assertUnderCaps,
  computeCostUsd,
  spendCaps,
  SpendCapError,
  wrapMessageSurface,
} from "./anthropic.mts";

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

describe("computeCostUsd — model rates", () => {
  test("claude-fable-5 prices at $10/$50 per MTok (a missing row would log the flagship at $0, invisible to the caps)", () => {
    expect(
      computeCostUsd("claude-fable-5", { input_tokens: 1_000_000, output_tokens: 100_000 }),
    ).toBeCloseTo(15.0, 6);
  });

  test("fable cache tokens price at 10% read / 1.25x write of the input rate", () => {
    expect(
      computeCostUsd("claude-fable-5", {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_input_tokens: 1_000_000,
        cache_creation_input_tokens: 1_000_000,
      }),
    ).toBeCloseTo(1.0 + 12.5, 6);
  });

  test("unknown model logs $0 — never invents a rate", () => {
    expect(
      computeCostUsd("claude-imaginary-9", { input_tokens: 1_000_000, output_tokens: 0 }),
    ).toBe(0);
  });
});

describe("wrapMessageSurface (the ONE proxy both surfaces — messages and beta.messages — share)", () => {
  class FakeSurface {
    calls: string[] = [];
    async create(params: { model: string }) {
      this.calls.push(`create:${params.model}`);
      return { model: params.model, usage: { input_tokens: 1, output_tokens: 1 } };
    }
    stream(params: { model: string }) {
      this.calls.push(`stream:${params.model}`);
      return {
        finalMessage: async () => ({
          model: params.model,
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
      };
    }
    other() {
      return "prototype-method-intact";
    }
  }

  test("create/stream pass through; prototype methods survive the proxy (spread would drop them)", async () => {
    const fake = new FakeSurface();
    const wrapped = wrapMessageSurface(fake, "insiders_author") as unknown as FakeSurface;
    const res = await wrapped.create({ model: "claude-fable-5" });
    expect(res.model).toBe("claude-fable-5");
    const s = wrapped.stream({ model: "claude-fable-5" });
    expect((await s.finalMessage()).model).toBe("claude-fable-5");
    expect(wrapped.other()).toBe("prototype-method-intact");
    expect(fake.calls).toEqual(["create:claude-fable-5", "stream:claude-fable-5"]);
  });
});
