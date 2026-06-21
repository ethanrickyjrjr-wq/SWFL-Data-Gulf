import { test, expect } from "bun:test";
import { buildGroundingContext, type GroundingBlock } from "./grounding";
import { resolveMethod } from "../../refinery/lib/methodology-registry.mts";
import type { Dossier } from "../fetch-brain";

function fakeDossier(token: string, withZips = false): Dossier {
  return {
    freshness_token: token,
    conclusion: "Housing is cooling.",
    direction: "bearish",
    magnitude: 0.4,
    confidence: 0.7,
    confidence_dispersion: 0.1,
    joint_integrity: 0.9,
    upstream_count: 3,
    drivers: [],
    key_metrics: [
      {
        metric: "median_price",
        value: "$525,000",
        direction: "falling",
        label: "Median price",
        variable_type: "extensive",
        units: "USD",
        source: {
          url: "https://x",
          fetched_at: "2026-06-01",
          tier: 2,
          citation: "Redfin",
        },
      },
    ],
    detail_tables: withZips
      ? [
          {
            id: "housing_by_zip",
            title: "By ZIP",
            grain: "zip",
            columns: [
              {
                id: "median",
                label: "Median",
                display_format: "currency",
              },
            ],
            rows: [
              { key: "34102", label: "Naples", cells: { median: 1850000 } },
              { key: "33904", label: "Cape Coral", cells: { median: 410000 } },
            ],
            source: {
              url: "https://x",
              fetched_at: "2026-06-01",
              tier: 2,
              citation: "Redfin",
            },
          },
        ]
      : [],
    conditional_claims: [],
    grain_boundary: undefined,
    contradicts: [],
    caveats: [],
  };
}

test("rule 5: the raw freshness token NEVER appears; the as-of date is used instead", () => {
  // REGRESSION: this test previously asserted the token appear EXACTLY ONCE — it was the
  // oracle that LOCKED IN the raw-token leak ("SWFL-7421-v53-20260609" in the screenshot).
  // The report path now uses freshnessDirective(token): the customer-facing as-of DATE,
  // never the internal token (mirrors the already-proven conversation path).
  const blocks: GroundingBlock[] = [
    { label: "Naples housing", dossier: fakeDossier("SWFL-7421-v5-20260607") },
  ];
  const ctx = buildGroundingContext({
    rules: "RULES",
    gazetteer: "GEO",
    blocks,
  });
  // The raw internal token must NEVER leak into customer-facing prompt prose.
  expect(ctx).not.toContain("SWFL-7421-v5-20260607");
  // It is rendered as the clean as-of date (asOfFromToken → MM/DD/YYYY).
  expect(ctx).toContain("06/07/2026");
});

test("CHARTS directive: a drawn chart is described from its OWN figures, never refused or invented", () => {
  const blocks: GroundingBlock[] = [{ label: "x", dossier: fakeDossier("SWFL-7421-v5-20260607") }];
  // A chart IS on screen → its real figures ride in a labeled block the model must cite.
  const chartFigures =
    "SWFL Home Values (ZHVI) — the chart now on screen.\n- Naples: $600,000 (2026-02) to $610,000 (2026-04).";
  const withChart = buildGroundingContext({
    rules: "RULES",
    gazetteer: "GEO",
    blocks,
    chartShown: chartFigures,
  });
  // The real figures are injected as a cite-only block (anti-fabrication: the model was
  // hallucinating home-value numbers when given only the title).
  expect(withChart).toContain("=== CHART ON SCREEN");
  expect(withChart).toContain(chartFigures);
  expect(withChart).toContain("ON SCREEN");
  expect(withChart).toContain("outside this report's scope"); // present as a FORBIDDEN phrase
  expect(withChart).toContain("NEVER invent"); // the moat guard for a drawn chart
  // No chart available → still forbids the flat refusal AND the build-it-yourself punt.
  const noChart = buildGroundingContext({ rules: "RULES", gazetteer: "GEO", blocks });
  expect(noChart).toContain("CHARTS");
  expect(noChart).toContain("Excel");
  expect(noChart).toContain("NEVER flatly refuse");
  expect(noChart).not.toContain("=== CHART ON SCREEN");
});

test("detail_tables rows are inlined so cross-area compare is in-context (R0)", () => {
  const blocks: GroundingBlock[] = [
    {
      label: "Naples housing",
      dossier: fakeDossier("SWFL-7421-v5-20260607", true),
    },
  ];
  const ctx = buildGroundingContext({
    rules: "RULES",
    gazetteer: "GEO",
    blocks,
  });
  expect(ctx).toContain("33904"); // Cape Coral row present even though page is Naples
  expect(ctx).toContain("1850000");
});

test("header badges (Strength/Confidence/Direction) serialize in the SAME shape the report header shows", () => {
  // fakeDossier: direction "bearish", magnitude 0.4, confidence 0.7.
  // page.tsx renders DIRECTION_LABEL[direction] + `${Math.round(scalar*100)}%`,
  // so the grounding MUST carry "Bearish" / "40%" / "70%", never the raw scalars.
  const ctx = buildGroundingContext({
    rules: "RULES",
    gazetteer: "GEO",
    blocks: [{ label: "Naples housing", dossier: fakeDossier("SWFL-7421-v5-20260607") }],
  });
  expect(ctx).toContain("Direction: Bearish");
  expect(ctx).toContain("Strength: 40%");
  expect(ctx).toContain("Confidence: 70%");
  // The raw scalars must NOT leak in (that would re-create the badge/grounding mismatch).
  expect(ctx).not.toContain("Strength: 0.4");
  expect(ctx).not.toContain("Confidence: 0.7");
});

test("multiple blocks are labeled and ordered (reach blocks after primary)", () => {
  const blocks: GroundingBlock[] = [
    { label: "Naples housing", dossier: fakeDossier("SWFL-7421-v5-20260607") },
    {
      label: "Naples flood (env-swfl)",
      dossier: fakeDossier("SWFL-3000-v2-20260607"),
    },
  ];
  const ctx = buildGroundingContext({
    rules: "RULES",
    gazetteer: "GEO",
    blocks,
  });
  expect(ctx.indexOf("Naples housing")).toBeLessThan(ctx.indexOf("Naples flood"));
});

test("floor: prompt forbids a dead-end and forbids guessing components", () => {
  const ctx = buildGroundingContext({
    rules: "RULES",
    gazetteer: "GEO",
    blocks: [{ label: "x", dossier: fakeDossier("t") }],
  });
  // The decline doctrine is gone — never instruct a dead-end.
  expect(ctx).not.toContain("DECLINE");
  expect(ctx.toLowerCase()).not.toContain("decline");
  // ...replaced by the offer-to-find + never-invent floor.
  expect(ctx.toLowerCase()).toContain("offer to find");
  expect(ctx).toContain("NEVER invent");
});

test("upgrade: an injected method entry renders held + need components", () => {
  const ctx = buildGroundingContext({
    rules: "RULES",
    gazetteer: "GEO",
    blocks: [{ label: "x", dossier: fakeDossier("t") }],
    method: resolveMethod("asking_rent_psf_median"),
  });
  expect(ctx).toContain("=== METHOD ===");
  expect(ctx).toContain("We HOLD");
  expect(ctx).toContain("We do NOT hold");
  // The anti-invention allowlist: the held base is named, the need-parts offered.
  expect(ctx).toContain("Property taxes");
});

test("no method entry => no METHOD block (floor path)", () => {
  const ctx = buildGroundingContext({
    rules: "RULES",
    gazetteer: "GEO",
    blocks: [{ label: "x", dossier: fakeDossier("t") }],
  });
  expect(ctx).not.toContain("=== METHOD ===");
});

test("coverage invariant: every header-shown data field is in the grounding", () => {
  // The report header (app/r/[slug]/page.tsx) renders the conclusion, each key
  // metric, the direction label, Strength %, Confidence %, and the freshness
  // token. Each MUST be serialized into the grounding or a highlight on it
  // dead-ends with "not a metric I hold". This locks rendered→answerable: a
  // future header field that isn't serialized fails here (the vocab `--all`
  // gate's spirit, applied to the highlighter surface).
  const d = fakeDossier("SWFL-7421-v5-20260607");
  const ctx = buildGroundingContext({
    rules: "RULES",
    gazetteer: "GEO",
    blocks: [{ label: "Naples housing", dossier: d }],
  });
  expect(ctx).toContain(d.conclusion);
  for (const m of d.key_metrics) {
    // The human label is what the customer sees and what the grounding must
    // carry — NOT the snake_case slug.
    expect(ctx).toContain(m.label);
    expect(ctx).toContain(String(m.value));
  }
  // Header badges, in the header's display shape (fakeDossier: bearish/0.4/0.7).
  expect(ctx).toContain("Direction: Bearish");
  expect(ctx).toContain("Strength: 40%");
  expect(ctx).toContain("Confidence: 70%");
  // Freshness is carried as the clean as-of DATE (rule 5), never the raw token.
  expect(ctx).toContain("06/07/2026");
  expect(ctx).not.toContain("SWFL-7421-v5-20260607");
});

test("jargon guard: key-metric slugs are NEVER serialized into the grounding", () => {
  // The chat once recited "cap_rate_median, vacancy_rate_median, …" because the
  // grounding fed it `m.metric` (the slug). It must carry only `m.label`.
  // fakeDossier: metric slug "median_price", label "Median price".
  const ctx = buildGroundingContext({
    rules: "RULES",
    gazetteer: "GEO",
    blocks: [{ label: "x", dossier: fakeDossier("t") }],
  });
  expect(ctx).toContain("Median price");
  expect(ctx).not.toContain("median_price");
  // The preamble also explicitly forbids leaking internal identifiers / "held in".
  expect(ctx).toContain("CLEAN");
  expect(ctx).toContain("snake_case");
});

test("preamble: concise, no echo of the highlight, no Excel-charting punt", () => {
  const ctx = buildGroundingContext({
    rules: "RULES",
    gazetteer: "GEO",
    blocks: [{ label: "x", dossier: fakeDossier("t") }],
  });
  // No-echo: don't restate what the user highlighted.
  expect(ctx).toContain("do NOT echo back");
  // Concise: keep answers tight.
  expect(ctx).toContain("Keep it tight");
  // Charts: never tell the user to go build it in Excel/Sheets/etc.
  expect(ctx).toContain("CHARTS");
  expect(ctx).toContain("Excel");
  // Platform framing: SWFL-wide analytics engine, not real-estate-only.
  expect(ctx).toContain("ABOUT SWFL DATA GULF");
  expect(ctx).toContain("not one sector");
});

test("preamble carries the focus + natural-voice rules", () => {
  const ctx = buildGroundingContext({
    rules: "RULES",
    gazetteer: "GEO",
    blocks: [{ label: "x", dossier: fakeDossier("t") }],
  });
  // FOCUS: scope to the highlighted place, not the SWFL-wide aggregate.
  expect(ctx).toContain("FOCUS");
  // NATURAL: don't mechanically repeat "27 corridors" every answer.
  expect(ctx).toContain("NATURAL");
  expect(ctx).toContain("27 corridors");
  // BUILD: don't repeat what was already said this session.
  expect(ctx).toContain("BUILD");
});

test("three-lane preamble: replaces the two-shape straitjacket, keeps the hard floor", () => {
  const ctx = buildGroundingContext({
    rules: "RULES",
    gazetteer: "GEO",
    blocks: [{ label: "x", dossier: fakeDossier("t") }],
  });
  // The two-shape straitjacket and the dead plain-text-breaking markdown header
  // are gone (the popup renders plain text; the converse FORMAT_RULE bans markdown).
  expect(ctx).not.toContain("Two shapes only");
  expect(ctx).not.toContain("## Bottom Line");
  // Three explicit lanes, including the general-knowledge "be Claude" permission
  // that rule 7 of RULES_OF_ENGAGEMENT always intended.
  expect(ctx).toContain("LANE 1");
  expect(ctx).toContain("LANE 2");
  expect(ctx).toContain("LANE 3");
  expect(ctx.toLowerCase()).toContain("general knowledge");
  // The anti-invention moat survives the loosening.
  expect(ctx).toContain("HARD FLOOR");
  expect(ctx).toContain("NEVER invent");
  expect(ctx.toLowerCase()).toContain("offer to find");
});
