// lib/billing/effective-tier.test.ts
import { describe, expect, test } from "bun:test";
import { pickEffectiveTier } from "./effective-tier";

const NOW = new Date("2026-07-16T12:00:00Z");
const activePass = { tier: "starter", expires_at: "2026-09-01T00:00:00Z" };
const expiredPass = { tier: "starter", expires_at: "2026-07-01T00:00:00Z" };

describe("pickEffectiveTier", () => {
  test("no sub, no pass → free", () => expect(pickEffectiveTier(null, null, NOW)).toBe("free"));
  test("active pass upgrades free", () =>
    expect(pickEffectiveTier(null, activePass, NOW)).toBe("starter"));
  test("expired pass does nothing", () =>
    expect(pickEffectiveTier(null, expiredPass, NOW)).toBe("free"));
  test("real paid sub wins over pass (never downgrade a payer)", () =>
    expect(pickEffectiveTier("growth", activePass, NOW)).toBe("growth"));
  test("free-tier sub row + active pass → pass tier", () =>
    expect(pickEffectiveTier("free", activePass, NOW)).toBe("starter"));
});
