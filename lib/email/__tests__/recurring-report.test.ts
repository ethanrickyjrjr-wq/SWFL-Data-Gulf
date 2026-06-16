import { describe, test } from "bun:test";
import assert from "node:assert/strict";
import { buildReportModel, reportSubject, renderRecurringHtml } from "../recurring-report.ts";
import type { ScheduleRow } from "../scheduler.ts";
import type { AssembledReport, ReportLine } from "../activation/snapshot.ts";
import type { GroundedReportModel } from "../grounded-report.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRow(over: Partial<ScheduleRow> = {}): ScheduleRow {
  return {
    id: 1,
    user_id: "u1",
    project_id: null,
    status: "active",
    cadence: "weekly",
    day_of_week: 1,
    day_of_month: null,
    send_hour_et: 7,
    audience_slug: "buyers",
    template_id: "report",
    next_run_at: null,
    last_run_at: null,
    scope_kind: "zip",
    scope_value: "33904",
    topic: null,
    ...over,
  };
}

function makeReport(over: Partial<AssembledReport> = {}): AssembledReport {
  return {
    in_scope: true,
    zip: "33904",
    primaryPlace: "Cape Coral",
    countyName: "Lee",
    freshness_token: "SWFL-7421-v5-20260616",
    metrics: [
      {
        key: "housing.median_sale_price",
        label: "Median sale price",
        value: 412000,
        unit: "",
        direction: "neutral",
        display: "$412,000",
      },
    ],
    lines: [],
    coverage_caveats: [],
    snapshot: {
      zip: "33904",
      freshness_token: "SWFL-7421-v5-20260616",
      captured_at: "2026-06-16T00:00:00.000Z",
      metrics: [],
      lines: [],
    },
    ...over,
  };
}

const aLine: ReportLine = {
  brain_id: "city-pulse",
  grain: "zip",
  is_true_zip: true,
  label: "Daily city pulse",
  text: "Activity steady this week.",
  source_url: "https://x",
  source_citation: "city-pulse",
};

// ---------------------------------------------------------------------------
// buildReportModel — fresh grounded assembly for a "report" schedule
// ---------------------------------------------------------------------------

describe("buildReportModel", () => {
  test("a ZIP-scoped report row assembles a FRESH GroundedReportModel from the row's ZIP", async () => {
    let scopeSeen: { zip: string } | null = null;
    const model = await buildReportModel(makeRow(), {
      assembleReport: async (scope) => {
        scopeSeen = scope;
        return makeReport();
      },
      log: () => {},
    });

    assert.ok(model, "a model is produced");
    assert.deepEqual(scopeSeen, { zip: "33904" }, "assembled fresh from the row's ZIP scope");
    assert.equal(model!.scope.kind, "zip");
    assert.equal(model!.scope.value, "33904");
    // The freshness token rides verbatim from the live brain assembly (NOT a static sample).
    assert.equal(model!.freshness_token, "SWFL-7421-v5-20260616");
    // Recurring sends carry no stored prior snapshot → no manufactured delta block.
    assert.equal(model!.delta, null);
  });

  test("a non-ZIP report scope (place/county) falls back to null and NEVER assembles", async () => {
    const logs: string[] = [];
    let assembled = false;
    const model = await buildReportModel(
      makeRow({ scope_kind: "place", scope_value: "cape coral" }),
      {
        assembleReport: async () => {
          assembled = true;
          return makeReport();
        },
        log: (l) => logs.push(l),
      },
    );

    assert.equal(model, null, "non-ZIP report → global digest fallback (never invent below grain)");
    assert.equal(assembled, false, "a non-ZIP report never even attempts the ZIP assembler");
    assert.ok(
      logs.some((l) => l.includes("fallback")),
      "the fallback is logged",
    );
  });

  test("a missing/blank scope_value falls back to null", async () => {
    const model = await buildReportModel(makeRow({ scope_value: "  " }), {
      assembleReport: async () => makeReport(),
      log: () => {},
    });
    assert.equal(model, null);
  });

  test("an out-of-footprint ZIP (in_scope:false) falls back to null", async () => {
    const model = await buildReportModel(makeRow({ scope_value: "90210" }), {
      assembleReport: async () =>
        makeReport({
          in_scope: false,
          zip: "90210",
          primaryPlace: null,
          countyName: null,
          freshness_token: null,
          metrics: [],
          lines: [],
        }),
      log: () => {},
    });
    assert.equal(model, null, "an out-of-scope ZIP is not a grounded report");
  });

  test("an in-scope ZIP with ZERO metrics AND zero lines falls back to null (no empty report)", async () => {
    const model = await buildReportModel(makeRow(), {
      assembleReport: async () => makeReport({ metrics: [], lines: [] }),
      log: () => {},
    });
    assert.equal(model, null);
  });

  test("an in-scope ZIP with a dossier line but no metrics still assembles (grounded content present)", async () => {
    const model = await buildReportModel(makeRow(), {
      assembleReport: async () => makeReport({ metrics: [], lines: [aLine] }),
      log: () => {},
    });
    assert.ok(model, "a line alone is grounded content — render it");
  });
});

// ---------------------------------------------------------------------------
// reportSubject — customer-clean subject derived from the model (no LLM)
// ---------------------------------------------------------------------------

describe("reportSubject", () => {
  test("uses the place name when present", () => {
    const m = { primaryPlace: "Cape Coral", zip: "33904" } as unknown as GroundedReportModel;
    assert.equal(reportSubject(m), "Cape Coral — your area report");
  });

  test("falls back to the ZIP when no place name", () => {
    const m = { primaryPlace: null, zip: "33904" } as unknown as GroundedReportModel;
    assert.equal(reportSubject(m), "ZIP 33904 — your area report");
  });
});

// ---------------------------------------------------------------------------
// renderRecurringHtml — the routing guard (the load-bearing correctness point)
// ---------------------------------------------------------------------------

describe("renderRecurringHtml", () => {
  test("routes a model to the grounded renderer (report → renderGroundedReport)", async () => {
    let grounded = false;
    let tmpl = false;
    const html = await renderRecurringHtml(
      { slug: "report", body: "", model: { zip: "33904" } as unknown as GroundedReportModel },
      {
        renderGrounded: async () => {
          grounded = true;
          return "<grounded/>";
        },
        renderTemplate: async () => {
          tmpl = true;
          return "<tmpl/>";
        },
        defaultSlug: "hero",
      },
    );
    assert.equal(html, "<grounded/>");
    assert.equal(grounded, true);
    assert.equal(tmpl, false, "a grounded model never touches the plain template lane");
  });

  test("a 'report' row WITHOUT a model renders the DEFAULT template, never the body-less report shell", async () => {
    // This is the bug Task 3 guards: Phase 1 removed the report template's [ BODY TEXT ]
    // slot. A 'report' schedule that fell back to the digest must NOT render through the
    // report shell (it would emit an empty masthead+footer) — it uses the default slug.
    let usedSlug: string | null = null;
    const html = await renderRecurringHtml(
      { slug: "report", body: "digest body", model: null },
      {
        renderGrounded: async () => "<grounded/>",
        renderTemplate: async (slug, body) => {
          usedSlug = slug;
          return `<tmpl slug="${slug}">${body}</tmpl>`;
        },
        defaultSlug: "hero",
      },
    );
    assert.equal(usedSlug, "hero", "report-without-model falls back to the default template");
    assert.ok(html.includes("digest body"), "the fallback body is rendered, not dropped");
  });

  test("a plain template renders via renderTemplate with its own slug + body + chart (unchanged)", async () => {
    let seen: { slug: string; body: string; chart?: string } | null = null;
    await renderRecurringHtml(
      { slug: "hero", body: "b", chart: "c", model: null },
      {
        renderGrounded: async () => "<grounded/>",
        renderTemplate: async (slug, body, chart) => {
          seen = { slug, body, chart };
          return "x";
        },
        defaultSlug: "hero",
      },
    );
    assert.deepEqual(seen, { slug: "hero", body: "b", chart: "c" });
  });
});
