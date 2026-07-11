import { describe, expect, test } from "bun:test";
import assert from "node:assert/strict";
import {
  detectPartialScans,
  flagCarryoverDays,
  isPlausibleCut,
  latestDelta,
  makeTakeaway,
  mdY,
  mD,
  rankMovers,
  rebaseFromFirst,
  directionOf,
} from "./mappers";

describe("mdY / mD", () => {
  test("ISO date → MM/DD/YYYY", () => {
    expect(mdY("2026-07-10")).toBe("07/10/2026");
    expect(mdY("2026-07-10T14:22:00Z")).toBe("07/10/2026");
  });
  test("garbage/null → undefined", () => {
    expect(mdY(undefined)).toBeUndefined();
    expect(mdY("not-a-date")).toBeUndefined();
  });
  test("short label", () => {
    expect(mD("2026-07-08")).toBe("07/08");
  });
});

describe("detectPartialScans", () => {
  // Real window from data_lake.listing_pulse_daily (verified 07/11/2026):
  // 07/07 was an incomplete sweep (31 events), neighbors ran ~1k–2k.
  test("flags the real 07/07 partial scan, not normal days", () => {
    const totals = [1139, 31, 2073, 1279, 945];
    expect(detectPartialScans(totals)).toEqual([false, true, false, false, false]);
  });
  test("too little history → nothing flagged", () => {
    expect(detectPartialScans([31, 1139, 2073])).toEqual([false, false, false]);
  });
  test("uniform days → nothing flagged", () => {
    expect(detectPartialScans([900, 1000, 1100, 950, 1050])).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
  });
});

describe("flagCarryoverDays", () => {
  test("flags only the day right after a partial scan (real 07/07→07/08 window)", () => {
    const totals = [1139, 31, 2073, 1279, 945];
    const partials = detectPartialScans(totals);
    expect(flagCarryoverDays(partials)).toEqual([false, false, true, false, false]);
  });
  test("first day can never carry over (no prior day); the day after a partial day does", () => {
    expect(flagCarryoverDays([true, false])).toEqual([false, true]);
  });
  test("no partial days → nothing flagged", () => {
    expect(flagCarryoverDays([false, false, false])).toEqual([false, false, false]);
  });
});

describe("latestDelta", () => {
  test("delta is vs. previous AVAILABLE reading, with its period carried", () => {
    const out = latestDelta([
      { period: "2026-07-01", value: 6.9 },
      { period: "2026-07-09", value: 6.8 },
    ]);
    expect(out?.latest).toBe(6.8);
    expect(out?.prevPeriod).toBe("2026-07-01");
    expect(out?.delta).toBeCloseTo(-0.1);
    expect(out?.direction).toBe("down");
  });
  test("single reading → no delta, direction flat", () => {
    const out = latestDelta([{ period: "2026-07-09", value: 6.8 }]);
    expect(out?.delta).toBeNull();
    expect(out?.direction).toBe("flat");
  });
  test("empty → null", () => {
    expect(latestDelta([])).toBeNull();
  });
  test("unsorted input is sorted by period", () => {
    const out = latestDelta([
      { period: "2026-07-09", value: 410000 },
      { period: "2026-07-08", value: 400000 },
    ]);
    expect(out?.latest).toBe(410000);
    expect(out?.deltaPct).toBeCloseTo(2.5);
  });
});

describe("rebaseFromFirst", () => {
  test("day-0 = 0%, later points are % from base", () => {
    const out = rebaseFromFirst([
      { period: "2026-06-20", value: 400000 },
      { period: "2026-07-01", value: 420000 },
    ]);
    expect(out[0].value).toBe(0);
    expect(out[1].value).toBeCloseTo(5);
  });
  test("zero base → empty (never divide by zero)", () => {
    expect(rebaseFromFirst([{ period: "2026-06-20", value: 0 }])).toEqual([]);
  });
});

describe("isPlausibleCut — outlier clamp", () => {
  test("the observed $222M bad row is rejected", () => {
    expect(isPlausibleCut({ reducedAmount: 222_000_000, listPrice: 350_000 })).toBe(false);
  });
  test("a real luxury cut passes", () => {
    expect(isPlausibleCut({ reducedAmount: 500_000, listPrice: 9_500_000 })).toBe(true);
  });
  test("cut >= 60% of original ask is rejected", () => {
    expect(isPlausibleCut({ reducedAmount: 600_000, listPrice: 400_000 })).toBe(false);
  });
  test("null / zero fields never pass", () => {
    expect(isPlausibleCut({ reducedAmount: null, listPrice: 500_000 })).toBe(false);
    expect(isPlausibleCut({ reducedAmount: 0, listPrice: 500_000 })).toBe(false);
    expect(isPlausibleCut({ reducedAmount: 10_000, listPrice: null })).toBe(false);
  });
});

describe("rankMovers", () => {
  const rows = [
    {
      zip_code: "33914",
      county: "Lee",
      active_listing_count: 900,
      price_reduced_share: 0.21,
      new_listing_share: 0.06,
    },
    {
      zip_code: "34102",
      county: "Collier",
      active_listing_count: 400,
      price_reduced_share: 0.12,
      new_listing_share: 0.11,
    },
    {
      zip_code: "33935",
      county: "Hendry",
      active_listing_count: 12,
      price_reduced_share: 0.5,
      new_listing_share: 0.4,
    },
    {
      zip_code: null,
      county: null,
      active_listing_count: 29402,
      price_reduced_share: 0.157,
      new_listing_share: 0.08,
    },
  ];
  test("tiny ZIPs and rollup rows are excluded; sorted desc", () => {
    const out = rankMovers(rows, "price_reduced_share", 5);
    expect(out.map((r) => r.zip_code)).toEqual(["33914", "34102"]);
  });
  test("ranks by the requested key", () => {
    const out = rankMovers(rows, "new_listing_share", 1);
    expect(out[0].zip_code).toBe("34102");
  });
});

describe("directionOf", () => {
  test("sign → direction", () => {
    expect(directionOf(3)).toBe("up");
    expect(directionOf(-1)).toBe("down");
    expect(directionOf(0)).toBe("flat");
    expect(directionOf(null)).toBe("flat");
  });
});

describe("makeTakeaway", () => {
  test("SWFL-scoped region figure — answer-first with as-of + brand", () => {
    const t = makeTakeaway(
      {
        label: "Median asking price",
        display: "$345,000",
        asOf: "07/10/2026",
        sourceLabel: "SWFL Data Gulf",
      },
      "Southwest Florida",
    );
    assert.equal(
      t,
      "Median asking price in Southwest Florida is $345,000 as of 07/10/2026, per SWFL Data Gulf.",
    );
  });

  test("no scope for a national figure (mortgage) — no false region label", () => {
    const t = makeTakeaway({
      label: "30-yr fixed mortgage",
      display: "6.49%",
      asOf: "07/10/2026",
      sourceLabel: "Freddie Mac",
    });
    assert.equal(t, "30-yr fixed mortgage is 6.49% as of 07/10/2026, per Freddie Mac.");
  });

  test("empty display yields empty string (empty-tolerant)", () => {
    assert.equal(
      makeTakeaway(
        { label: "x", display: "", asOf: "07/10/2026", sourceLabel: "s" },
        "Southwest Florida",
      ),
      "",
    );
  });

  test("omits as-of clause when absent", () => {
    const t = makeTakeaway(
      { label: "Active listings", display: "29,413", sourceLabel: "SWFL Data Gulf" },
      "Southwest Florida",
    );
    assert.equal(t, "Active listings in Southwest Florida is 29,413, per SWFL Data Gulf.");
  });
});
