import { describe, expect, it } from "bun:test";
import { computeReportDelta, fingerprintText, DELTABLE_SIGNAL_BRAINS } from "./delta";
import type { ActivationSnapshot, SnapshotMetric, SnapshotLine } from "./types";

function metric(
  over: Partial<SnapshotMetric> & Pick<SnapshotMetric, "key" | "value">,
): SnapshotMetric {
  return { label: over.key, ...over };
}

function line(
  over: Partial<SnapshotLine> & Pick<SnapshotLine, "brain_id" | "fingerprint">,
): SnapshotLine {
  return { grain: "zip", is_true_zip: true, label: over.brain_id, ...over };
}

function snap(over: Partial<ActivationSnapshot> = {}): ActivationSnapshot {
  return {
    zip: "33931",
    freshness_token: "SWFL-7421-v5-20260610",
    captured_at: "2026-06-10T12:00:00.000Z",
    metrics: [],
    lines: [],
    ...over,
  };
}

describe("fingerprintText", () => {
  it("strips the freshness token so a daily token bump is NOT a change", () => {
    const a = fingerprintText("Median price $400,000. Freshness: `SWFL-7421-v5-20260610`");
    const b = fingerprintText("Median price $400,000. Freshness: `SWFL-7421-v6-20260613`");
    expect(a).toBe(b);
  });

  it("strips bare dates and normalizes whitespace/case", () => {
    const a = fingerprintText("Updated  2026-06-10\nMedian   PRICE");
    const b = fingerprintText("updated 2026-06-13 median price");
    expect(a).toBe(b);
  });

  it("preserves substantive differences", () => {
    expect(fingerprintText("price $400,000")).not.toBe(fingerprintText("price $410,000"));
  });
});

describe("computeReportDelta — metric moves", () => {
  it("reports a numeric rise with delta + direction + favorability", () => {
    const prev = snap({
      metrics: [
        metric({
          key: "housing.median_sale_price",
          label: "Median sale price",
          value: 400000,
          direction: "higher_is_better",
        }),
      ],
    });
    const current = snap({
      freshness_token: "SWFL-7421-v6-20260613",
      metrics: [
        metric({
          key: "housing.median_sale_price",
          label: "Median sale price",
          value: 412000,
          direction: "higher_is_better",
        }),
      ],
    });
    const d = computeReportDelta(prev, current);
    expect(d.has_change).toBe(true);
    expect(d.metric_changes).toHaveLength(1);
    const m = d.metric_changes[0];
    expect(m.from).toBe(400000);
    expect(m.to).toBe(412000);
    expect(m.delta).toBe(12000);
    expect(m.direction).toBe("up");
    expect(m.favorable).toBe(true);
  });

  it("marks a rise unfavorable when lower_is_better (e.g. days on market)", () => {
    const prev = snap({
      metrics: [metric({ key: "housing.dom", value: 30, direction: "lower_is_better" })],
    });
    const current = snap({
      metrics: [metric({ key: "housing.dom", value: 45, direction: "lower_is_better" })],
    });
    const m = computeReportDelta(prev, current).metric_changes[0];
    expect(m.direction).toBe("up");
    expect(m.favorable).toBe(false);
  });

  it("flags appeared / disappeared without a fabricated delta", () => {
    const appeared = computeReportDelta(
      snap({ metrics: [metric({ key: "k", value: null })] }),
      snap({ metrics: [metric({ key: "k", value: 7 })] }),
    ).metric_changes[0];
    expect(appeared.direction).toBe("appeared");
    expect(appeared.delta).toBeNull();

    const gone = computeReportDelta(
      snap({ metrics: [metric({ key: "k", value: 7 })] }),
      snap({ metrics: [metric({ key: "k", value: null })] }),
    ).metric_changes[0];
    expect(gone.direction).toBe("disappeared");
  });

  it("ignores a metric that vanished from the current assembly (can't claim it)", () => {
    const prev = snap({
      metrics: [metric({ key: "gone", value: 1 }), metric({ key: "kept", value: 2 })],
    });
    const current = snap({ metrics: [metric({ key: "kept", value: 2 })] });
    expect(computeReportDelta(prev, current).metric_changes).toHaveLength(0);
  });
});

describe("computeReportDelta — signals (real time-grain only)", () => {
  it("reports a changed daily city-pulse line as a signal", () => {
    const prev = snap({ lines: [line({ brain_id: "city-pulse-swfl", fingerprint: "old story" })] });
    const current = snap({
      lines: [line({ brain_id: "city-pulse-swfl", fingerprint: "new story" })],
    });
    const d = computeReportDelta(prev, current);
    expect(d.signal_changes).toEqual([{ brain_id: "city-pulse-swfl", label: "Local city pulse" }]);
    expect(d.has_change).toBe(true);
  });

  it("does NOT emit a signal for a slow-grain brain even if its line changed", () => {
    const prev = snap({ lines: [line({ brain_id: "macro-us", fingerprint: "a" })] });
    const current = snap({ lines: [line({ brain_id: "macro-us", fingerprint: "b" })] });
    expect(computeReportDelta(prev, current).signal_changes).toHaveLength(0);
  });

  it("does not flag a deltable line whose substance is unchanged", () => {
    const prev = snap({ lines: [line({ brain_id: "permits-swfl", fingerprint: "12 permits" })] });
    const current = snap({
      lines: [line({ brain_id: "permits-swfl", fingerprint: "12 permits" })],
    });
    expect(computeReportDelta(prev, current).signal_changes).toHaveLength(0);
  });

  it("claims a TRUE-ZIP line's first appearance as new activity", () => {
    const prev = snap({ lines: [] });
    const current = snap({
      lines: [
        line({ brain_id: "permits-swfl", fingerprint: "first permit read", is_true_zip: true }),
      ],
    });
    const d = computeReportDelta(prev, current);
    expect(d.signal_changes).toHaveLength(1);
    expect(d.signal_changes[0].brain_id).toBe("permits-swfl");
  });

  it("does NOT claim a non-true-zip headline line's appearance (top-8 ranking churn)", () => {
    // selectDossierLines caps ranked headline lines, so a headline line rotating
    // back into the snapshot is selection noise — claiming it would fabricate
    // "new activity" (the contract this file states in computeReportDelta's doc).
    const prev = snap({ lines: [] });
    const current = snap({
      lines: [
        line({
          brain_id: "corridor-pulse-swfl",
          fingerprint: "regional read",
          is_true_zip: false,
          grain: "region",
        }),
      ],
    });
    expect(computeReportDelta(prev, current).signal_changes).toHaveLength(0);
  });

  it("only watches the documented deltable brains", () => {
    expect(DELTABLE_SIGNAL_BRAINS.has("city-pulse-swfl")).toBe(true);
    expect(DELTABLE_SIGNAL_BRAINS.has("housing-swfl")).toBe(false); // numeric, not a signal
  });
});

describe("computeReportDelta — no-change branch (first-class)", () => {
  it("reports has_change=false but freshness_moved=true when only the token advanced", () => {
    const prev = snap({
      freshness_token: "SWFL-7421-v5-20260610",
      metrics: [metric({ key: "k", value: 100 })],
      lines: [line({ brain_id: "city-pulse-swfl", fingerprint: "same" })],
    });
    const current = snap({
      freshness_token: "SWFL-7421-v6-20260613",
      metrics: [metric({ key: "k", value: 100 })],
      lines: [line({ brain_id: "city-pulse-swfl", fingerprint: "same" })],
    });
    const d = computeReportDelta(prev, current);
    expect(d.has_change).toBe(false);
    expect(d.freshness_moved).toBe(true);
    expect(d.freshness_token_current).toBe("SWFL-7421-v6-20260613");
  });

  it("freshness_moved=false when the token did not advance", () => {
    const s = snap();
    expect(computeReportDelta(s, snap()).freshness_moved).toBe(false);
  });
});
