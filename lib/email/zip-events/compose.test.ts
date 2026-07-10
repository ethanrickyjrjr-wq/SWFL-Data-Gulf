// lib/email/zip-events/compose.test.ts
import { describe, expect, test } from "bun:test";
import { renderEmailDocHtml } from "@/lib/email/render-email-doc";
import type { MarketArea } from "./market-areas";
import type { MarketEvent } from "./types";
import {
  baselineSubject,
  composeAlertDoc,
  composeBaselineDoc,
  composeWeeklyDoc,
  INSIDER_EVERY_N_ISSUES,
  shouldIncludeInsider,
  SUBJECT_LEAD_MAX,
  subjectFor,
} from "./compose";

const AREA: MarketArea = {
  area_id: "cape-coral",
  label: "the Cape Coral market",
  county: "12071",
  anchor_place: "Cape Coral",
  zips: ["33904", "33914"],
  needs_review: [],
};

const CUT_BURST: MarketEvent = {
  type: "lifecycle_burst",
  grain: "zip",
  area_id: "cape-coral",
  zip: "33904",
  class: "alert",
  facts: [
    {
      label: "Price cuts this week",
      value: 3,
      unit: "",
      source: "SWFL Data Gulf listing lifecycle",
    },
  ],
};

const PRICE_CROSS: MarketEvent = {
  type: "threshold_cross",
  grain: "zip",
  area_id: "cape-coral",
  zip: "33904",
  class: "alert",
  facts: [
    {
      label: "Median sale price",
      from: 449_000,
      to: 451_000,
      value: 451_000,
      unit: "$",
      source: "SWFL Data Gulf listing lifecycle",
    },
  ],
};

describe("subjectFor — the research-pinned contract", () => {
  test("number + place land inside the first 37 chars (burst)", () => {
    const s = subjectFor([CUT_BURST], "Cape Coral", AREA.label);
    const lead = s.slice(0, SUBJECT_LEAD_MAX);
    expect(lead).toMatch(/3/);
    expect(lead).toMatch(/Cape Coral/);
  });
  test("number + place land inside the first 37 chars (threshold)", () => {
    const s = subjectFor([PRICE_CROSS], "Cape Coral", AREA.label);
    const lead = s.slice(0, SUBJECT_LEAD_MAX);
    expect(lead).toMatch(/451,000/);
    expect(lead).toMatch(/Cape Coral/);
  });
  test("ZIP-grain event names the subscriber's own place, not the area label", () => {
    const s = subjectFor([CUT_BURST], "Cape Coral", "the Southwest Lee market");
    expect(s).toContain("Cape Coral");
    expect(s).not.toContain("Southwest Lee");
  });
  test("area-grain event falls back to the area label", () => {
    const areaEv: MarketEvent = {
      type: "heat_shift",
      grain: "area",
      area_id: "cape-coral",
      class: "weekly",
      facts: [{ label: "Heat rank", from: 5, to: 2, value: 2, unit: "", source: "s" }],
    };
    expect(subjectFor([areaEv], null, AREA.label)).toContain("Cape Coral market");
  });
  test("no internal ids or system nouns ever", () => {
    const s = subjectFor([CUT_BURST], "Cape Coral", AREA.label);
    expect(s).not.toMatch(/area_id|cape-coral|zip-events|threshold|_/);
  });
  test("baseline subject names the place", () => {
    expect(baselineSubject("Cape Coral", AREA.label)).toContain("Cape Coral");
  });
});

describe("composeAlertDoc golden", () => {
  test("renders through the ONE render root with facts, as-of once, sources block", async () => {
    const doc = composeAlertDoc({
      events: [CUT_BURST],
      subscriberZip: "33904",
      subscriberPlace: "Cape Coral",
      area: AREA,
      asOf: "07/10/2026",
    });
    const html = await renderEmailDocHtml(doc);
    expect(html).toContain("Price cuts this week");
    expect((html.match(/07\/10\/2026/g) ?? []).length).toBe(1); // as-of exactly once
    expect(html).toContain("SWFL Data Gulf");
    expect(html).not.toMatch(/cape-coral|area_id/); // customer-clean
  });
});

describe("composeWeeklyDoc", () => {
  test("includes heat leaderboard + insider card when provided, flagged plainly", async () => {
    const doc = composeWeeklyDoc({
      events: [CUT_BURST],
      subscriberZip: "33904",
      subscriberPlace: "Cape Coral",
      area: AREA,
      asOf: "07/10/2026",
      heatRanks: [
        { area_id: "cape-coral", position: 1, score: 0.9 },
        { area_id: "naples", position: 2, score: 0.7 },
      ],
      areaLabelsById: { "cape-coral": "the Cape Coral market", naples: "the Naples market" },
      insider: {
        title: "Flood-exposure detail for 33904",
        rows: [{ label: "AAL per insured property", value: "$1,214" }],
        source: "SWFL Data Gulf flood model",
      },
    });
    const html = await renderEmailDocHtml(doc);
    expect(html).toContain("Cape Coral market");
    expect(html).toContain("usually part of the paid tier");
    expect(html).toContain("Flood-exposure detail");
  });

  test("no insider card when null", async () => {
    const doc = composeWeeklyDoc({
      events: [CUT_BURST],
      subscriberZip: "33904",
      subscriberPlace: "Cape Coral",
      area: AREA,
      asOf: "07/10/2026",
      heatRanks: [],
      areaLabelsById: {},
      insider: null,
    });
    const html = await renderEmailDocHtml(doc);
    expect(html).not.toContain("usually part of the paid tier");
  });
});

describe("composeBaselineDoc", () => {
  test("welcome snapshot: held metrics + heat position, nulls never rendered", async () => {
    const doc = composeBaselineDoc({
      subscriberZip: "33904",
      subscriberPlace: "Cape Coral",
      area: AREA,
      asOf: "07/10/2026",
      snapshot: {
        zip: "33904",
        as_of: "2026-07-10",
        metrics: {
          median_sale_price: 405_000,
          median_dom: 41,
          actives: 220,
          sold_count_30d: null,
          sale_to_list_ratio: null,
        },
        rank_position: 4,
        heat: {
          absorption_rate_pct: null,
          sale_to_list_ratio: null,
          price_momentum_pct: null,
          sold_momentum_pct: null,
        },
      },
      heatPosition: 2,
      recentEvents: [],
    });
    const html = await renderEmailDocHtml(doc);
    expect(html).toContain("405,000");
    expect(html).toContain("41");
    expect(html).not.toContain("Homes sold"); // null metric NOT rendered — never zero-filled
  });
});

describe("shouldIncludeInsider", () => {
  test(`every ${INSIDER_EVERY_N_ISSUES}th issue`, () => {
    expect(shouldIncludeInsider(INSIDER_EVERY_N_ISSUES - 1)).toBe(true);
    expect(shouldIncludeInsider(0)).toBe(false);
  });
});
