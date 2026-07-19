// lib/should-i-sell/soh-portability.test.ts
import { describe, expect, test } from "bun:test";
import {
  SOH_PORT_CAP,
  SOH_ANNUAL_CAP_FRACTION,
  PORT_WINDOW_YEARS,
  SOH_SOURCES,
  SOH_PROJECTION_TAG,
  SOH_PROJECTION_BASIS,
  SOH_PROJECTION_FALSIFIER,
  sohBenefit,
  portableAmount,
  portForNextHome,
  projectSoh,
} from "./soh-portability";

describe("constants match the cited statute", () => {
  test("values + sources", () => {
    expect(SOH_PORT_CAP).toBe(500_000);
    expect(SOH_ANNUAL_CAP_FRACTION).toBe(0.03);
    expect(PORT_WINDOW_YEARS).toBe(3);
    expect(SOH_SOURCES.statute.url).toContain("leg.state.fl.us");
    expect(SOH_SOURCES.dorGuide.url).toContain("floridarevenue.com");
    expect(SOH_PROJECTION_TAG).toBe("[INFERENCE]");
    expect(SOH_PROJECTION_BASIS).toContain("3%");
    expect(SOH_PROJECTION_FALSIFIER.length).toBeGreaterThan(0);
  });
});

describe("sohBenefit", () => {
  test("gap and clamp", () => {
    expect(sohBenefit(400_000, 250_000)).toBe(150_000);
    expect(sohBenefit(250_000, 400_000)).toBe(0); // assessed never exceeds just → clamp
    expect(sohBenefit(0, 0)).toBe(0);
  });
});

describe("portableAmount", () => {
  test("caps at $500k", () => {
    expect(portableAmount(150_000)).toBe(150_000);
    expect(portableAmount(600_000)).toBe(500_000);
    expect(portableAmount(-5)).toBe(0);
  });
});

describe("portForNextHome — s. 193.155(8)(a)/(b) exactly", () => {
  test("upsize: full gap ports", () => {
    const r = portForNextHome({ oldJv: 400_000, oldAv: 250_000, nextHomePrice: 500_000 })!;
    expect(r.downsized).toBe(false);
    expect(r.portedReduction).toBe(150_000);
    expect(r.newAssessed).toBe(350_000);
  });
  test("upsize: gap over cap clips to $500k", () => {
    const r = portForNextHome({ oldJv: 900_000, oldAv: 300_000, nextHomePrice: 1_000_000 })!;
    expect(r.portedReduction).toBe(500_000);
    expect(r.newAssessed).toBe(500_000);
  });
  test("equal just value is the (a) branch (>=)", () => {
    const r = portForNextHome({ oldJv: 400_000, oldAv: 250_000, nextHomePrice: 400_000 })!;
    expect(r.downsized).toBe(false);
    expect(r.newAssessed).toBe(250_000);
  });
  test("downsize: proportional", () => {
    const r = portForNextHome({ oldJv: 400_000, oldAv: 250_000, nextHomePrice: 300_000 })!;
    expect(r.downsized).toBe(true);
    expect(r.newAssessed).toBe(187_500); // 300k/400k × 250k
    expect(r.portedReduction).toBe(112_500);
  });
  test("downsize: cap raises assessed so the difference equals $500k", () => {
    const r = portForNextHome({ oldJv: 3_000_000, oldAv: 1_000_000, nextHomePrice: 2_000_000 })!;
    expect(r.newAssessed).toBe(1_500_000); // 2M/3M×1M=666,667 → diff 1,333,333 > 500k → 2M−500k
    expect(r.portedReduction).toBe(500_000);
  });
  test("non-positive inputs → null", () => {
    expect(portForNextHome({ oldJv: 0, oldAv: 0, nextHomePrice: 300_000 })).toBeNull();
    expect(portForNextHome({ oldJv: 400_000, oldAv: 250_000, nextHomePrice: 0 })).toBeNull();
  });
});

describe("projectSoh — linear proration mirroring spread-calc", () => {
  test("12 months", () => {
    const r = projectSoh({ jv: 400_000, av: 250_000, yoyFraction: 0.05, months: 12 });
    expect(r.projectedJv).toBe(420_000);
    expect(r.projectedAv).toBe(257_500); // 250k × 1.03 ceiling case
    expect(r.projectedBenefit).toBe(162_500);
    expect(r.projectedPortable).toBe(162_500);
    expect(r.excessOverCap).toBe(0);
  });
  test("6 months prorates", () => {
    const r = projectSoh({ jv: 400_000, av: 250_000, yoyFraction: 0.05, months: 6 });
    expect(r.projectedJv).toBeCloseTo(410_000, 6); // 400k × (1 + 0.05×0.5)
    expect(r.projectedAv).toBeCloseTo(253_750, 6); // 250k × (1 + 0.03×0.5)
  });
  test("falling market: assessed never exceeds just", () => {
    const r = projectSoh({ jv: 260_000, av: 255_000, yoyFraction: -0.1, months: 12 });
    expect(r.projectedJv).toBe(234_000);
    expect(r.projectedAv).toBe(234_000); // clamped to projectedJv
    expect(r.projectedBenefit).toBe(0);
  });
  test("gap crossing the cap reports the excess", () => {
    const r = projectSoh({ jv: 1_500_000, av: 900_000, yoyFraction: 0.2, months: 12 });
    expect(r.projectedJv).toBe(1_800_000);
    expect(r.projectedAv).toBe(927_000);
    expect(r.projectedBenefit).toBe(873_000);
    expect(r.projectedPortable).toBe(500_000);
    expect(r.excessOverCap).toBe(373_000);
  });
});
