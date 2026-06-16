import { describe, expect, it } from "bun:test";
import {
  renderGroundedReport,
  assembledReportToModel,
  type GroundedReportModel,
} from "./grounded-report";
import type { AssembledReport } from "./activation/snapshot";
import type { ReportDelta } from "./activation/types";

function report(over: Partial<AssembledReport> = {}): AssembledReport {
  return {
    in_scope: true,
    zip: "33931",
    primaryPlace: "Fort Myers Beach",
    countyName: "Lee",
    freshness_token: "SWFL-7421-v6-20260613",
    metrics: [
      {
        key: "housing.median_sale_price",
        label: "Median sale price",
        value: 412000,
        unit: "",
        direction: "neutral",
        display: "$412,000",
      },
      {
        key: "housing.median_dom",
        label: "Days on market",
        value: 45,
        unit: " days",
        direction: "lower_is_better",
        display: "45",
      },
      {
        key: "env.flood_aal_usd",
        label: "Flood avg annual loss",
        value: 30074,
        unit: "",
        direction: "lower_is_better",
        display: "$30,074 / yr",
      },
    ],
    lines: [
      {
        brain_id: "city-pulse-swfl",
        grain: "city",
        is_true_zip: false,
        label: "Fort Myers Beach-area",
        text: "**Fort Myers Beach-area** — a new beachfront mixed-use approval cleared review.\n\n_Freshness:_ `SWFL-7421-v6-20260613`",
        source_url: "https://example.com/pulse",
        source_citation: "City pulse",
      },
    ],
    coverage_caveats: [],
    snapshot: {
      zip: "33931",
      freshness_token: "SWFL-7421-v6-20260613",
      captured_at: "2026-06-13T00:00:00.000Z",
      metrics: [],
      lines: [],
    },
    ...over,
  };
}

const CHANGE_DELTA: ReportDelta = {
  zip: "33931",
  has_change: true,
  freshness_moved: true,
  freshness_token_prev: "SWFL-7421-v5-20260610",
  freshness_token_current: "SWFL-7421-v6-20260613",
  metric_changes: [
    {
      key: "housing.median_sale_price",
      label: "Median sale price",
      from: 400000,
      to: 412000,
      delta: 12000,
      direction: "up",
      favorable: null,
      unit: "",
    },
  ],
  signal_changes: [{ brain_id: "city-pulse-swfl", label: "Local city pulse" }],
};

const NO_CHANGE_DELTA: ReportDelta = {
  zip: "33931",
  has_change: false,
  freshness_moved: true,
  freshness_token_prev: "SWFL-7421-v5-20260610",
  freshness_token_current: "SWFL-7421-v6-20260613",
  metric_changes: [],
  signal_changes: [],
};

function model(over: Partial<GroundedReportModel> = {}): GroundedReportModel {
  return { ...assembledReportToModel(report()), ...over };
}

describe("renderGroundedReport — convergence spine", () => {
  // NOTE: behavior-preservation ("the refactor didn't change email output") is proven by
  // render-golden.test.ts, which diffs the post-spine output against frozen PRE-spine bytes.
  // Asserting renderGroundedReport === reportToEmailHtml here would be circular (the wrapper
  // now delegates into the spine). The tests below cover the spine's OWN behavior instead.

  it("delta=null renders no [ DELTA ] content (no change block, no re-verified)", async () => {
    const html = await renderGroundedReport(model({ delta: null }), { skin: "email" });
    expect(html).not.toContain("What changed");
    expect(html).not.toContain("Re-verified");
    // The literal placeholder must never survive to a customer.
    expect(html).not.toContain("[ DELTA ]");
  });

  it("delta.has_change=false renders 'Re-verified', never a fabricated change", async () => {
    const html = await renderGroundedReport(model({ delta: NO_CHANGE_DELTA }), { skin: "email" });
    expect(html).toContain("Re-verified");
    expect(html).not.toContain("What changed");
  });

  it("delta.has_change=true renders the real change block from model fields", async () => {
    const html = await renderGroundedReport(model({ delta: CHANGE_DELTA }), { skin: "email" });
    expect(html).toContain("What changed");
    expect(html).toContain("400,000");
    expect(html).toContain("412,000");
    expect(html).toContain("Local city pulse");
  });

  it("maps the activation ZIP into a kind:zip scope", () => {
    const m = assembledReportToModel(report());
    expect(m.scope).toEqual({ kind: "zip", value: "33931", grain: "zip" });
  });

  it("pdf skin renders (Task-4 stub: email shell until doc-report lands) without throwing", async () => {
    const html = await renderGroundedReport(model(), { skin: "pdf" });
    expect(html).toContain("33931");
    expect(html).toContain("SWFL-7421-v6-20260613");
  });
});
