import { describe, test } from "bun:test";
import assert from "node:assert/strict";
import { buildHeroTokens } from "./hero-tokens.mts";
import type { DigestPayload, ZipMetricSnapshot } from "./types.ts";
import { renderEmailTemplate } from "@/lib/email/templates/render-template";

const COUNTY: ZipMetricSnapshot = {
  median_sale_price: 412000,
  dom: 62,
  months_of_supply: 3.4,
  avg_sale_to_list: 0.962,
  sold_above_list_pct: null,
  inventory: 4847,
  sale_count_period: 1200,
};

function makeDigest(over: Partial<DigestPayload> = {}): DigestPayload {
  return {
    date: "2026-06-16",
    freshness_manifest: {
      master: { token: "SWFL-7421-v6-20260616", as_of: "2026-06-16" },
      housing_swfl: { token: "housing-swfl-disk", as_of: "2026-06-16", period_begin: "2026-03-01" },
      city_pulse: { token: "city-pulse-daily", as_of: "2026-06-16" },
      lee_cre: null,
      source_env: "live",
    },
    top_line: "Southwest Florida housing held firm in April as coastal demand absorbed new supply.",
    zip_metrics: {},
    county_metrics: COUNTY,
    city_voices: [
      {
        topic: "development",
        title: "Estero mixed-use breaks ground",
        city: "Estero",
        source_url: "",
      },
      {
        topic: "transactions",
        title: "Cape Coral retail strip trades",
        city: "Cape Coral",
        source_url: "",
      },
    ],
    top_story: {
      title: "Estero mixed-use breaks ground",
      slug: "city-pulse-swfl",
      topic: "development",
    },
    ...over,
  };
}

describe("buildHeroTokens — real values only, never invented", () => {
  test("maps real county metrics into the hero value + 3 stats", () => {
    const t = buildHeroTokens(makeDigest());
    assert.equal(t.HERO_VALUE, "$412K", "median 412000 → $412K");
    assert.equal(
      t.HERO_LABEL.includes("Southwest Florida"),
      true,
      "grain-honest: SWFL, not Lee County",
    );
    assert.equal(t.STAT1_VALUE, "62 days");
    assert.equal(t.STAT1_LABEL, "Median DOM");
    assert.equal(t.STAT3_VALUE, "96.2%", "avg_sale_to_list 0.962 → 96.2%");
  });

  test("HERO_PROSE is the master top_line verbatim (no synthesis)", () => {
    const t = buildHeroTokens(makeDigest());
    assert.equal(
      t.HERO_PROSE.includes("coastal demand absorbed new supply"),
      true,
      "prose rides from master's top_line, not invented",
    );
  });

  test("NO FABRICATION: a null metric renders an em-dash, never an invented number", () => {
    const t = buildHeroTokens(
      makeDigest({
        county_metrics: { ...COUNTY, median_sale_price: null, dom: null, avg_sale_to_list: null },
      }),
    );
    assert.equal(t.HERO_VALUE, "—", "null median → em-dash, never a number");
    assert.equal(t.STAT1_VALUE, "—", "null DOM → em-dash");
    assert.equal(t.STAT3_VALUE, "—", "null sale/list → em-dash");
    // The known fabricated mockup literals must NEVER appear from null data.
    assert.equal(JSON.stringify(t).includes("412"), false);
    assert.equal(JSON.stringify(t).includes("Fort Myers Beach (33931)"), false);
  });

  test("SIGNAL_TITLE = top_story, else first city voice, else a neutral line", () => {
    assert.equal(buildHeroTokens(makeDigest()).SIGNAL_TITLE, "Estero mixed-use breaks ground");
    const noStory = buildHeroTokens(makeDigest({ top_story: null }));
    assert.equal(
      noStory.SIGNAL_TITLE,
      "Estero mixed-use breaks ground",
      "falls back to first city voice",
    );
    const empty = buildHeroTokens(makeDigest({ top_story: null, city_voices: [] }));
    assert.equal(empty.SIGNAL_TITLE.length > 0, true, "neutral, non-empty signal title");
    assert.equal(empty.SIGNAL_TITLE.includes("412"), false, "never a fabricated number");
  });

  test("every token is a non-empty string (renderEmailTemplate throws on unfilled {{}})", () => {
    const t = buildHeroTokens(makeDigest({ top_story: null, city_voices: [], top_line: "" }));
    for (const [k, v] of Object.entries(t)) {
      assert.equal(typeof v, "string", `${k} is a string`);
      assert.equal(v.length > 0, true, `${k} is non-empty (no unfilled token)`);
    }
  });
});

// The full template + tokens together: the email-hero mockup is now data-driven and
// the hardcoded fabricated numbers are GONE.
const MOCKUP_LITERALS = [
  "Fort Myers Beach (33931)", // fabricated signal
  "4,847", // fabricated active listings
  "+8 days vs Q1", // fabricated QoQ delta (no prior period exists)
  "+12.3% YoY",
  "Holding strong",
  "post-Ian reconstruction pipeline", // fabricated prose
  "Lee County Single-Family", // wrong grain (county_metrics is SWFL-wide)
  "Southwest Florida Market Map", // removed static map alt
  "Active Listings", // replaced by Months of Supply
];

describe("email-hero renders data-driven — fabricated mockup literals are gone", () => {
  test("real tokens fill the hero; none of the hardcoded mockup literals survive", async () => {
    const html = await renderEmailTemplate("hero", buildHeroTokens(makeDigest()), {});
    // real, derived values present
    assert.ok(html.includes("$412K"), "real median");
    assert.ok(html.includes("62 days"), "real DOM");
    assert.ok(html.includes("96.2%"), "real sale/list");
    assert.ok(html.includes("Estero mixed-use breaks ground"), "real top_story signal");
    assert.ok(html.includes("Median Sale Price · Southwest Florida"), "honest SWFL grain");
    // every fabricated mockup literal is gone
    for (const lit of MOCKUP_LITERALS) {
      assert.equal(html.includes(lit), false, `fabricated literal removed: ${lit}`);
    }
    // no unfilled tokens (would throw, but assert anyway)
    assert.equal(/\{\{[A-Z_]+\}\}/.test(html), false, "no unfilled {{TOKEN}}");
  });

  test("a NULL-data digest renders em-dashes, never an invented number, and does not throw", async () => {
    const nullDigest = makeDigest({
      county_metrics: {
        median_sale_price: null,
        dom: null,
        months_of_supply: null,
        avg_sale_to_list: null,
        sold_above_list_pct: null,
        inventory: null,
        sale_count_period: null,
      },
      top_story: null,
      city_voices: [],
      top_line: "",
    });
    const html = await renderEmailTemplate("hero", buildHeroTokens(nullDigest), {});
    assert.ok(html.includes("—"), "em-dash for held-nothing metrics");
    assert.equal(html.includes("412"), false, "no carried-over mockup number");
    assert.equal(/\{\{[A-Z_]+\}\}/.test(html), false, "no unfilled {{TOKEN}}");
  });
});
