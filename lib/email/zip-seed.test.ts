import { describe, test, expect, mock, beforeEach } from "bun:test";

/**
 * ZIP email prebuild tests (spec: 2026-07-03-zip-email-reskin-design.md).
 *
 * zip-seed COMPOSES a doc from two seams — the ranked-signal pool
 * (loadRankedZipSignals, the SAME builder the ZIP webpage uses) and the lifecycle
 * digest. We mock those seams and assert the composition:
 *  - metric-card blocks in ranked order, each restating held value/rank/movement/bar
 *  - a held percentile → a bar; a null percentile → NO bar (never a fabricated width)
 *  - the shape cutout's ?fill= is the URL-encoded gradient (omitted when no flood)
 *  - NEUTRAL skeleton style (never SWFL's own navy/teal)
 *  - commentary prose carries NO digits (figures ride blocks, not prose)
 *  - out-of-scope / zero signals → null (caller opens unseeded)
 */

import type { RankedZipSignals } from "../zip-report/load-ranked-signals";
import type { RankedSignal } from "../zip-report/signal-rank";
import type { MarketFigure } from "./market-context";

function sig(over: Partial<RankedSignal>): RankedSignal {
  return {
    key: "median_sale_price",
    label: "Median Home Value",
    display: "$421K",
    sub: "90-day median sale price",
    percentile: 62,
    rankPos: 12,
    rankOf: 57,
    movementPct: -2.1,
    movementText: "↓ 2.1% YoY",
    covered: true,
    score: 0.5,
    why: "#12 of 57 SWFL ZIPs",
    ...over,
  };
}

// Mutable fixtures the mocks read — reset per test.
let signalsFixture: RankedZipSignals | null;
let lifecycleFixture: MarketFigure | null;
let helperCalls: { zip: string; opts: unknown }[] = [];

mock.module("../zip-report/load-ranked-signals", () => ({
  loadRankedZipSignals: (zip: string, opts: unknown) => {
    helperCalls.push({ zip, opts });
    return Promise.resolve(signalsFixture);
  },
}));

mock.module("./market-context", () => ({
  loadLifecycleDigest: () => Promise.resolve(lifecycleFixture),
}));

const { buildZipSeedDoc } = await import("./zip-seed");

beforeEach(() => {
  helperCalls = [];
  signalsFixture = {
    ranked: [
      sig({
        key: "flood_aal",
        label: "Annual Flood Loss",
        display: "$4.2K",
        percentile: 96,
        rankPos: 3,
        rankOf: 57,
        movementPct: null,
        movementText: undefined,
        sub: "Flood insurance avg/home per year",
      }),
      sig({
        key: "median_sale_price",
        label: "Median Home Value",
        display: "$421K",
        percentile: 62,
        rankPos: 12,
        rankOf: 57,
        movementText: "↓ 2.1% YoY",
      }),
      sig({
        key: "permits_90d",
        label: "New Permits (90 Days)",
        display: "18",
        percentile: null,
        rankPos: undefined,
        rankOf: undefined,
        movementPct: null,
        movementText: undefined,
        sub: "Lee County building permits",
      }),
    ],
    hasFlood: true,
    fillColor: "rgb(51,82,94)",
    place: "Cape Coral",
    shapeFound: true,
    sources: [{ label: "Zillow ZHVI", url: "https://zillow.com" }],
  };
  lifecycleFixture = {
    key: "lifecycle",
    label: "Listing lifecycle (last 30 days)",
    value: "41 price cuts, 28 new listings, 12 sales",
    source: "SWFL Data Gulf",
    as_of: "07/02/2026",
  } as MarketFigure;
});

describe("buildZipSeedDoc", () => {
  test("known ZIP → ranked metric-card doc, header first / footer last", async () => {
    const doc = await buildZipSeedDoc("33914");
    expect(doc).not.toBeNull();
    const types = doc!.blocks.map((b) => b.type);
    expect(types[0]).toBe("header");
    expect(types.at(-1)).toBe("footer");
    expect(types).toContain("image");
    expect(types).toContain("hero");
    expect(types.filter((t) => t === "metric-card").length).toBe(3);
    // the helper is asked for the income-only census policy
    expect(helperCalls[0]).toEqual({ zip: "33914", opts: { censusPolicy: "income-only" } });
  });

  test("metric-cards mirror rankSignals order, restating held values verbatim", async () => {
    const doc = await buildZipSeedDoc("33914");
    const cards = doc!.blocks
      .filter((b) => b.type === "metric-card")
      .map((b) => b.props as Record<string, unknown>);
    expect(cards.map((c) => c.metricValue)).toEqual(["$4.2K", "$421K", "18"]);
    expect(cards.map((c) => c.metricLabel)).toEqual([
      "Annual Flood Loss",
      "Median Home Value",
      "New Permits (90 Days)",
    ]);
    // #1 flood: percentile → bar, rank text, no movement
    expect(cards[0].barPct).toBe(96);
    expect(cards[0].rankText).toBe("#3 of 57 SWFL ZIPs");
    expect(cards[0].movementText).toBeUndefined();
    // #2 value: movement restated verbatim
    expect(cards[1].movementText).toBe("↓ 2.1% YoY");
    // #3 permits: null percentile → NO bar (never a fabricated midpoint)
    expect(cards[2].barPct).toBeUndefined();
    expect(cards[2].rankText).toBeUndefined();
  });

  test("shape cutout carries the URL-encoded gradient fill", async () => {
    const doc = await buildZipSeedDoc("33914");
    const img = doc!.blocks.find((b) => b.type === "image")!.props as { url: string };
    expect(img.url).toBe(
      `https://www.swfldatagulf.com/api/zip-shape/33914?fill=${encodeURIComponent("rgb(51,82,94)")}`,
    );
  });

  test("no flood AAL → ?fill= omitted (route paints its own neutral fallback)", async () => {
    signalsFixture!.hasFlood = false;
    const doc = await buildZipSeedDoc("33914");
    const img = doc!.blocks.find((b) => b.type === "image")!.props as { url: string };
    expect(img.url).toBe("https://www.swfldatagulf.com/api/zip-shape/33914");
    expect(img.url).not.toContain("fill=");
  });

  test("NEUTRAL skeleton style — never SWFL's own navy/teal", async () => {
    const doc = await buildZipSeedDoc("33914");
    const gs = JSON.stringify(doc!.globalStyle);
    expect(gs).not.toContain("#0f1d24");
    expect(gs).not.toContain("#3DC9C0");
    expect(doc!.globalStyle.primaryColor).toBe("#1F2937");
  });

  test("commentary prose carries NO digits", async () => {
    const doc = await buildZipSeedDoc("33914");
    // the commentary text block sits before the sources text block
    const texts = doc!.blocks.filter((b) => b.type === "text");
    const commentary = texts[0].props as { body: string };
    expect(commentary.body).not.toMatch(/\d/);
    expect(commentary.body.toLowerCase()).toContain("cape coral");
  });

  test("shape not found → no image block, identity hero full width", async () => {
    signalsFixture!.shapeFound = false;
    const doc = await buildZipSeedDoc("33914");
    expect(doc!.blocks.some((b) => b.type === "image")).toBe(false);
    const hero = doc!.blocks.find((b) => b.type === "hero")!;
    expect(hero.layout?.w).toBe(12);
  });

  test("lifecycle present → signal block; absent → none", async () => {
    const withLc = await buildZipSeedDoc("33914");
    expect(withLc!.blocks.some((b) => b.type === "signal")).toBe(true);
    lifecycleFixture = null;
    const noLc = await buildZipSeedDoc("33914");
    expect(noLc!.blocks.some((b) => b.type === "signal")).toBe(false);
  });

  test("out-of-scope ZIP (helper null) or zero signals → null", async () => {
    signalsFixture = null;
    expect(await buildZipSeedDoc("33914")).toBeNull();
    signalsFixture = {
      ranked: [],
      hasFlood: false,
      fillColor: "#2a3942",
      place: "Cape Coral",
      shapeFound: true,
      sources: [],
    };
    expect(await buildZipSeedDoc("33914")).toBeNull();
  });

  test("malformed ZIP → null without calling the helper", async () => {
    expect(await buildZipSeedDoc("abc")).toBeNull();
    expect(await buildZipSeedDoc("1234")).toBeNull();
    expect(helperCalls.length).toBe(0);
  });
});
