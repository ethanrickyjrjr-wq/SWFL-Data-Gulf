// lib/deliverable/recipes/review-reply.test.ts
//
// R11 · THE REVIEW REPLY. These pin the four things that were actually WRONG at some
// point during this build — not the things that were easy to assert. Each test name
// says which failure it exists to prevent.
//
// The network halves (the lake read, the Sonnet call, the PNG host) are proven live
// and traced in the build report; what is pinned HERE is every pure decision the
// builder makes, because those are the ones a future edit can silently break.

import { describe, expect, test, mock, afterAll } from "bun:test";
import {
  cell,
  factLines,
  resolveArea,
  selectFigures,
  trendChartSpec,
  unanchoredNumbers,
  type ReviewFigures,
  type TrendPoint,
} from "./review-reply";
import { chartMagnitudeFromSpec, parseHeroFigure } from "@/lib/deliverable/chart-coherence";
import type { MarketFigure } from "@/lib/email/market-context";
import type { RecipeBuildContext } from "./index";

const fig = (key: string, label: string, value: string, source: string): MarketFigure => ({
  key,
  label,
  value,
  source,
  as_of: "05/31/2026",
});

const LAKE_FEED: MarketFigure[] = [
  fig("home_value", "Median home value — Fort Myers (33905)", "$285,794", "Zillow ZHVI"),
  fig("home_value_yoy", "Home value, year over year", "−6.8%", "Zillow ZHVI"),
  fig("rent", "Typical asking rent", "$1,980/mo", "Zillow ZORI"),
  fig("active", "Active listings in 33905", "482", "SWFL Data Gulf"),
  fig("county_dom", "Lee County median days on market", "67", "Redfin"),
  fig("median_list", "Median list price", "$299,900", "SWFL Data Gulf"),
];

const FIGURES: ReviewFigures = selectFigures(LAKE_FEED);

// ── Task 6: buildReviewReply's own narrator never carries FAVORABLE_FRAMING_POLICY ──
//
// mock.module is process-global (no per-file isolation) — snapshot + restore, the same
// pattern used in shared.test.ts / agent-launch.test.ts / under-contract.test.ts. This
// file otherwise drives PURE functions only (see the file header) — READ_SYSTEM is a
// private, unexported constant, and `authorAreaRead` (the function that sends it) is
// unexported too, so the ONLY way to reach the real system prompt is through the
// exported builder, `buildReviewReply`. That builder also reads the lake
// (`loadMarketFigures`) and a raw Supabase view (`loadZipTrend`) before it ever calls
// the model, so both are stubbed here purely to reach the narrator offline — neither
// is asserted on, and stubbing `createServiceRoleClientUntyped` to throw reproduces
// the exact "no creds" empty-tolerant path `loadZipTrend` is documented to degrade on
// (review-reply.ts: "no creds, no rows, any query error → [] and no chart"), so the
// chart — and `chartSpecToEmailImage`, the PNG host — never fires either.
const realMarketContext = await import("@/lib/email/market-context");
const realServiceRole = await import("@/utils/supabase/service-role");
const realAnthropicRR = await import("@/refinery/agents/anthropic.mts");
const marketContextOrig = { ...realMarketContext };
const serviceRoleOrig = { ...realServiceRole };
const anthropicOrigRR = { ...realAnthropicRR };
afterAll(() => {
  mock.module("@/lib/email/market-context", () => marketContextOrig);
  mock.module("@/utils/supabase/service-role", () => serviceRoleOrig);
  mock.module("@/refinery/agents/anthropic.mts", () => anthropicOrigRR);
});

let rrSystemSeen = "";
mock.module("@/lib/email/market-context", () => ({
  ...marketContextOrig,
  loadMarketFigures: async () => LAKE_FEED,
}));
mock.module("@/utils/supabase/service-role", () => ({
  ...serviceRoleOrig,
  createServiceRoleClientUntyped: () => {
    throw new Error("no creds in test");
  },
}));
mock.module("@/refinery/agents/anthropic.mts", () => ({
  getAnthropic: () => ({
    messages: {
      create: async (args: { system: string }) => {
        rrSystemSeen = args.system;
        return {
          content: [{ type: "text", text: "Values here are holding steady this month." }],
        };
      },
    },
  }),
}));

describe("Task 6 — buildReviewReply's own narrator never carries FAVORABLE_FRAMING_POLICY", () => {
  // READ_SYSTEM (review-reply.ts) forbids arithmetic and forbids naming a cause not given —
  // it does not carry an absolute no-numbers rule the way agent-launch/sphere-weekly do, but
  // this recipe is one of the three STORY-SIDE builders this feature explicitly does not
  // touch (sphere-weekly / market-pulse / review-reply). Dynamic import AFTER the mocks
  // above, so buildReviewReply's own `getAnthropic` / `loadMarketFigures` /
  // `createServiceRoleClientUntyped` bindings resolve through them.
  test("the honest-read system prompt never contains the framing block", async () => {
    const { FAVORABLE_FRAMING_POLICY } = await import("./shared");
    const { buildReviewReply } = await import("./review-reply");
    const ctx = {
      prompt: "REVIEW — 326 Shore Dr, Fort Myers, FL 33905",
      currentDoc: { globalStyle: {}, blocks: [] },
      facts: null,
      resolved: false,
    } as RecipeBuildContext;
    await buildReviewReply(ctx);
    expect(rrSystemSeen.length).toBeGreaterThan(0); // the model call really fired
    expect(rrSystemSeen).not.toContain(FAVORABLE_FRAMING_POLICY);
  });
});

// ── THE SUBJECT ──────────────────────────────────────────────────────────────
// The Lab door passes NO scope. If the area only resolves from `scope`, this recipe
// is broken in exactly the way the listing recipes were: it silently falls through to
// the free author and ships a grab-bag.

describe("resolveArea — the area comes from the FIELD or the PROMPT", () => {
  test("resolves from the prompt alone, with NO scope (the Lab door)", () => {
    expect(resolveArea("…snapshot email for Cape Coral — the current home-value level")).toEqual({
      zip: "33904",
      label: "Cape Coral (33904)",
    });
  });

  test("resolves a bare ZIP typed over the [[blank]]", () => {
    expect(resolveArea("…snapshot email for 33905 — the current home-value level")?.zip).toBe(
      "33905",
    );
  });

  test("a reader's pasted address: the ZIP wins over the city (the finer grain we hold)", () => {
    // "REVIEW 326 Shore Dr, Fort Myers, FL 33905" — Fort Myers' primary ZIP is NOT
    // 33905, so taking the place name here would answer about a different ZIP than
    // the one the reader literally gave us.
    const area = resolveArea("REVIEW — 326 Shore Dr, Fort Myers, FL 33905");
    expect(area?.zip).toBe("33905");
    expect(area?.label).toBe("Fort Myers (33905)");
  });

  test("an explicit zip scope wins over the prompt", () => {
    expect(resolveArea("…for Cape Coral", "33905")?.zip).toBe("33905");
  });

  test("a street number is NOT a ZIP", () => {
    // The guard is crosswalk MEMBERSHIP, never a bare \d{5} regex: "33905 Palm Beach
    // Blvd, Fort Myers" would otherwise resolve the street number as the area.
    expect(resolveArea("12345 Some Road, Cape Coral")?.zip).toBe("33904");
    expect(resolveArea("a snapshot for 12345")).toBeNull();
  });

  test("no area named anywhere → null (fall through to the generic author, never refuse)", () => {
    expect(resolveArea("build me an email about the market")).toBeNull();
  });
});

// ── THE CELLS ────────────────────────────────────────────────────────────────

describe("selectFigures — the five figures, by KEY", () => {
  test("picks exactly the recipe's five and ignores the rest of the feed", () => {
    expect(FIGURES.level?.value).toBe("$285,794");
    expect(FIGURES.trend?.value).toBe("−6.8%");
    expect(FIGURES.active?.value).toBe("482");
    expect(FIGURES.askingNow?.value).toBe("$299,900");
    // Rent is in the feed and is NOT this deliverable. The "Typical asking rent"
    // grab-bag cell is the exact thing this recipe replaces.
    expect(Object.values(FIGURES).some((f) => f?.key === "rent")).toBe(false);
  });

  test("days on market falls back from ZIP to COUNTY — and keeps the county's own label", () => {
    // 33905 carries no ZIP-level DOM in the live feed. The county median fills the gap
    // (lane 1 → lane 1, finer to coarser) and travels UNDER ITS OWN LABEL, so the email
    // says "Lee County" and never passes a county number off as this ZIP's.
    expect(FIGURES.dom?.value).toBe("67");
    expect(FIGURES.dom?.label).toBe("Lee County median days on market");
  });

  test("a ZIP-level DOM outranks the county one when we hold it", () => {
    const withZipDom = selectFigures([
      ...LAKE_FEED,
      fig("dom", "Average days on market", "41", "SWFL Data Gulf"),
    ]);
    expect(withZipDom.dom?.value).toBe("41");
  });
});

describe("cell — the open-slot contract", () => {
  test("sourced → the figure's value, restated VERBATIM", () => {
    expect(cell(FIGURES.trend, "…")).toEqual({
      value: "−6.8%",
      label: "Home value, year over year",
    });
  });

  test("unsourced → an EMPTY value and the LABEL IS THE INSTRUCTION. Never a zero.", () => {
    const c = cell(null, "Days on market — type it in");
    expect(c.value).toBe(""); // StatsBlock's emailRender drops it; the canvas offers it
    expect(c.value).not.toBe("0");
    expect(c.label).toBe("Days on market — type it in");
  });
});

// ── THE HERO HAS NO OPEN-SLOT ESCAPE ─────────────────────────────────────────
// BlockRenderer hands `emailRender` to stats / text / image — and NOT to hero. So an
// unsourced hero cannot vanish from a send the way an unsourced stat cell does: its
// label would be MAILED, over no number. That is a naked label, the one hard block in
// this product. buildReviewReply therefore refuses to build without a home value and
// falls through to the generic author (degrade, never refuse).

describe("no home value → no home-value review", () => {
  test("the hero block genuinely cannot self-suppress (this is why the guard exists)", async () => {
    const { renderEmailDocHtml } = await import("@/lib/email/render-email-doc");
    const { DEFAULT_GLOBAL_STYLE } = await import("@/lib/email/doc/default-docs");
    // The shape an earlier draft of this builder would have shipped: empty hero value,
    // instruction in the label, trusting `emailRender` to drop it. It does not.
    const html = await renderEmailDocHtml({
      globalStyle: DEFAULT_GLOBAL_STYLE,
      blocks: [
        {
          id: "h1",
          type: "hero",
          props: { kicker: "Your Home-Value Review", value: "", label: "add the figure" },
        },
      ],
    });
    // The naked label reaches the recipient. Pinning the hazard so nobody "simplifies"
    // the guard away on the assumption that the open-slot contract covers the hero.
    expect(html).toContain("add the figure");
  });

  test("selectFigures reports the miss, so the builder can refuse", () => {
    // 33979 is real: it carries an active-listing row and NO zhvi_zip_latest row, so a
    // reader's own ZIP reaches this branch. Everything else can be an open slot; the
    // headline number cannot.
    const noLevel = selectFigures([
      fig("active", "Active listings in 33979", "1", "SWFL Data Gulf"),
    ]);
    expect(noLevel.level).toBeNull();
    expect(noLevel.active?.value).toBe("1");
  });
});

// ── THE CHART ────────────────────────────────────────────────────────────────

const POINTS: TrendPoint[] = [
  { month: "2026-03", home_value: 287907 },
  { month: "2026-04", home_value: 287125 },
  { month: "2026-05", home_value: 285794 },
];

describe("trendChartSpec — a chart about the SUBJECT, with axes", () => {
  test("plots THIS area's own series, not SWFL's three metros", () => {
    const spec = trendChartSpec(POINTS, "Fort Myers (33905)")!;
    expect(spec.title).toBe("Home value trend — Fort Myers (33905)");
    expect(spec.rows).toEqual([
      ["2026-03", 287907],
      ["2026-04", 287125],
      ["2026-05", 285794],
    ]);
    expect(spec.source?.citation).toBe("Zillow Home Value Index (ZHVI)");
  });

  test("frame is line-band — the area frame ships with NO axis labels", () => {
    // Not cosmetics. chart_type "area" routes to bklitTrendSvg, which draws no y-ticks
    // and no month labels (its own header says the axis text is "a follow-up, not this
    // pass"). The emailed chart was a bare line over a gradient. lineBandSvg draws
    // gridlines, unit-formatted y-ticks and month labels. A chart nobody can read is
    // not a chart. If someone "simplifies" this back to zhvi-area, this test says why.
    expect(trendChartSpec(POINTS, "x")!.frameId).toBe("line-band");
  });

  test("asOf is the month END of the newest covered month (the honest vintage)", () => {
    expect(trendChartSpec(POINTS, "x")!.asOf).toBe("2026-05-31");
  });

  test("under 3 months → NO chart (two points is a fact wearing a chart costume)", () => {
    expect(trendChartSpec(POINTS.slice(0, 2), "x")).toBeNull();
    expect(trendChartSpec([], "x")).toBeNull();
  });

  test("the hero and the chart cohere — they are the same series", () => {
    const spec = trendChartSpec(POINTS, "x")!;
    const magnitude = chartMagnitudeFromSpec(spec);
    expect(magnitude?.unit).toBe("currency");
    expect(parseHeroFigure(FIGURES.level!.value)!.value).toBe(285794);
    expect(magnitude!.values).toContain(285794);
  });
});

// ── THE PROSE ────────────────────────────────────────────────────────────────
// The model writes prose and NOTHING else. These are the two things it actually did
// wrong on the first live run.

describe("unanchoredNumbers — the number gate", () => {
  const FACTS = factLines(FIGURES, [
    { month: "2024-06", home_value: 332123 },
    { month: "2026-05", home_value: 285794 },
  ]);

  test("a DERIVED number is an invented one — the first live draft wrote this", () => {
    // "$46,000" is $332,123 − $285,794. The model back-solved it from two figures it WAS
    // given, and no source on earth can be named for the result. A number that is merely
    // derivable is not source-faithful.
    expect(unanchoredNumbers("Values fell roughly $46,000 from the $332,123 peak.", FACTS)).toEqual(
      ["$46,000"],
    );
  });

  test("the SIGN lives in the word: '−6.8%' quoted as 'down 6.8%' is faithful, not invented", () => {
    // The strict-sign gate rejected the only natural English for a negative figure and
    // deleted the entire honest read — leaving the email with no read at all. SWFL home
    // values are negative YoY right now, so this fired on every single build.
    expect(unanchoredNumbers("Values in 33905 are down 6.8% year over year.", FACTS)).toEqual([]);
  });

  test("a HYPHENATED year is a calendar reference, not a fabricated number", () => {
    // "mid-2024" tokenizes as "-2024" (the tokenizer reads the hyphen as a minus), which
    // fails a naive ^(19|20)\d{2}$ year test. This dropped a true, fully-sourced paragraph
    // on ~40% of live runs — the read IS the deliverable, so a coin-flip gate is a bug.
    expect(
      unanchoredNumbers("The slide has been running since mid-2024, from $332,123.", FACTS),
    ).toEqual([]);
    expect(unanchoredNumbers("Post-2024 the market cooled.", FACTS)).toEqual([]);
  });

  test("every real figure passes verbatim; a bare year is a calendar reference", () => {
    expect(
      unanchoredNumbers(
        "The median is $285,794, with 482 listed and a Lee County median of 67 days. " +
          "It was $332,123 in June 2024.",
        FACTS,
      ),
    ).toEqual([]);
  });

  test("a plausible-looking fabrication still cannot pass", () => {
    expect(unanchoredNumbers("Inventory is up 14% and 91 homes sold.", FACTS)).toEqual([
      "14%",
      "91",
    ]);
  });
});

describe("factLines — every fact names its own PLACE", () => {
  test("the county DOM carries 'Lee County' into the narrator's facts", () => {
    // This is what stops the model handing a COUNTY median to the ZIP — which it did,
    // verbatim, on the first live run ("buyers taking a median of 67 days" about 33905).
    const lines = factLines(FIGURES, []);
    expect(lines.some((l) => l.startsWith("- Lee County median days on market: 67"))).toBe(true);
  });

  test("each line carries its source and its as-of", () => {
    for (const line of factLines(FIGURES, [])) {
      expect(line).toMatch(/\((Zillow ZHVI|Redfin|SWFL Data Gulf), as of \d{2}\/\d{2}\/\d{4}\)$/);
    }
  });

  test("the chart's endpoints ride along, so the narrator may quote them", () => {
    const lines = factLines(FIGURES, [
      { month: "2024-06", home_value: 332123 },
      { month: "2026-05", home_value: 285794 },
    ]);
    expect(lines[lines.length - 1]).toContain("$332,123");
    expect(lines[lines.length - 1]).toContain("$285,794");
  });

  test("no figures → no facts (never improvise an area)", () => {
    expect(
      factLines({ level: null, trend: null, dom: null, active: null, askingNow: null }, []),
    ).toEqual([]);
  });
});
