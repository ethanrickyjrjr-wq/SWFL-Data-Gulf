import { describe, expect, test } from "bun:test";
import {
  deriveAlerts,
  HERO_MOVE_ALERT_FRACTION,
  MORTGAGE_MOVE_ALERT_PTS,
  PRICE_CUT_SHARE_ALERT_PCT,
  PULSE_FLIP_MIN_CUTS,
} from "./alerts";
import type { DeskData, DeskDatum, PulseDay } from "./types";

const SRC = "SWFL Data Gulf";

function datum(over: Partial<DeskDatum>): DeskDatum {
  return { label: "x", value: 0, display: "0", sourceLabel: SRC, asOf: "07/11/2026", ...over };
}

function pulseDay(over: Partial<PulseDay>): PulseDay {
  return {
    day: "2026-07-10",
    label: "07/10",
    newListings: 50,
    priceCuts: 20,
    priceIncreases: 0,
    returned: 0,
    departures: 0,
    sold: 0,
    withdrawn: 0,
    total: 70,
    partial: false,
    carryoverAfterPartial: false,
    ...over,
  };
}

function base(over: Partial<Pick<DeskData, "kpis" | "gauges" | "pulse" | "hero">> = {}) {
  return {
    kpis: [] as DeskDatum[],
    gauges: { marketTemp: null, priceReduced: null },
    pulse: null,
    hero: null,
    ...over,
  };
}

describe("price-cut share rule", () => {
  test("fires at the threshold, holds below, carries provenance", () => {
    const at = datum({ value: PRICE_CUT_SHARE_ALERT_PCT, display: "20.0%" });
    const fired = deriveAlerts(base({ gauges: { marketTemp: null, priceReduced: at } }));
    expect(fired).toHaveLength(1);
    expect(fired[0].sourceLabel).toBe(SRC);
    expect(fired[0].asOf).toBe("07/11/2026");

    const below = datum({ value: PRICE_CUT_SHARE_ALERT_PCT - 0.1 });
    expect(deriveAlerts(base({ gauges: { marketTemp: null, priceReduced: below } }))).toHaveLength(
      0,
    );
  });
});

describe("mortgage rule", () => {
  test("fires on a ≥ threshold move of the national KPI only", () => {
    const kpi = datum({
      label: "30-yr fixed mortgage",
      national: true,
      value: 6.5,
      display: "6.50%",
      delta: MORTGAGE_MOVE_ALERT_PTS,
      deltaDisplay: "0.10 pts",
      direction: "up",
    });
    expect(deriveAlerts(base({ kpis: [kpi] }))).toHaveLength(1);
    expect(
      deriveAlerts(base({ kpis: [{ ...kpi, delta: MORTGAGE_MOVE_ALERT_PTS - 0.01 }] })),
    ).toHaveLength(0);
    // A non-national KPI with a big delta never trips the mortgage rule.
    expect(deriveAlerts(base({ kpis: [{ ...kpi, national: undefined }] }))).toHaveLength(0);
  });
});

describe("pulse flip rule", () => {
  test("fires when cuts outpace new on a complete day", () => {
    const pulse = {
      days: [pulseDay({ priceCuts: 30, newListings: 20 })],
      asOf: "07/10/2026",
      sourceLabel: SRC,
    };
    const fired = deriveAlerts(base({ pulse }));
    expect(fired).toHaveLength(1);
    expect(fired[0].detail).toContain("30 cuts");
  });

  test("suppressed on partial + carryover days and under the noise floor", () => {
    const flip = { priceCuts: 30, newListings: 20 };
    expect(
      deriveAlerts(
        base({ pulse: { days: [pulseDay({ ...flip, partial: true })], sourceLabel: SRC } }),
      ),
    ).toHaveLength(0);
    expect(
      deriveAlerts(
        base({
          pulse: { days: [pulseDay({ ...flip, carryoverAfterPartial: true })], sourceLabel: SRC },
        }),
      ),
    ).toHaveLength(0);
    expect(
      deriveAlerts(
        base({
          pulse: {
            days: [pulseDay({ priceCuts: PULSE_FLIP_MIN_CUTS - 1, newListings: 2 })],
            sourceLabel: SRC,
          },
        }),
      ),
    ).toHaveLength(0);
  });
});

describe("hero move rule", () => {
  test("fires at ≥ 5% vs prior reading, holds below", () => {
    const prev = 400_000;
    const delta = prev * HERO_MOVE_ALERT_FRACTION;
    const city = (d: number) => ({
      key: "cape_coral",
      label: "Cape Coral",
      color: "#3DC9C0",
      latest: datum({
        label: "Cape Coral median sale price",
        value: prev + d,
        display: "$x",
        delta: d,
        deltaDisplay: "$20,000",
        direction: "up" as const,
      }),
      points: [],
    });
    expect(
      deriveAlerts(base({ hero: { cities: [city(delta)], sourceLabel: SRC, windowNote: "" } })),
    ).toHaveLength(1);
    expect(
      deriveAlerts(base({ hero: { cities: [city(delta - 1)], sourceLabel: SRC, windowNote: "" } })),
    ).toHaveLength(0);
  });
});
