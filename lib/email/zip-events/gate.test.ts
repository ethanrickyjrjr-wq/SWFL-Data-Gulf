// lib/email/zip-events/gate.test.ts
import { describe, expect, test } from "bun:test";
import type { MarketArea } from "./market-areas";
import type { MarketEvent } from "./types";
import { alertAbsorbsRoundup, pickDailyAlert, selectWeeklyContent } from "./gate";

const AREA: MarketArea = {
  area_id: "cape-coral",
  label: "the Cape Coral market",
  county: "12071",
  anchor_place: "Cape Coral",
  zips: ["33904", "33914"],
  needs_review: [],
};

function ev(over: Partial<MarketEvent>): MarketEvent {
  return {
    type: "threshold_cross",
    grain: "zip",
    area_id: "cape-coral",
    zip: "33904",
    class: "weekly",
    facts: [{ label: "x", value: 1, unit: "", source: "s" }],
    ...over,
  };
}

describe("selectWeeklyContent — fill ladder", () => {
  test("subject-ZIP events lead; sibling-area events fill", () => {
    const subject = ev({ zip: "33904" });
    const sibling = ev({ zip: "33914" });
    const sel = selectWeeklyContent("33904", AREA, [sibling, subject]);
    expect(sel.send).toBe(true);
    expect(sel.used[0]).toBe(subject); // subject ZIP first — identity preserved
    expect(sel.fill_grains).toContain("zip");
  });

  test("quiet ZIP fills from area/city/county grains", () => {
    const news = ev({ type: "nearby_news", grain: "area", zip: undefined });
    const county = ev({ grain: "county", zip: undefined });
    const sel = selectWeeklyContent("33904", AREA, [news, county]);
    expect(sel.send).toBe(true);
    expect(sel.fill_grains).toEqual(expect.arrayContaining(["area", "county"]));
  });

  test("flat week = NO send with reported skip, never a padded email", () => {
    const sel = selectWeeklyContent("33904", AREA, []);
    expect(sel.send).toBe(false);
    expect(sel.skip_reason).toBe("flat_week");
    expect(sel.used).toEqual([]);
  });

  test("events from another area never leak in", () => {
    const foreign = ev({ area_id: "naples", zip: "34102" });
    expect(selectWeeklyContent("33904", AREA, [foreign]).send).toBe(false);
  });

  test("baseline-class events never ride a weekly", () => {
    const sel = selectWeeklyContent("33904", AREA, [ev({ class: "baseline" })]);
    expect(sel.send).toBe(false);
  });
});

describe("pickDailyAlert", () => {
  test("returns only alert-class events for the subscriber's area", () => {
    const a = ev({ class: "alert" });
    const w = ev({ class: "weekly" });
    const foreign = ev({ class: "alert", area_id: "naples" });
    expect(pickDailyAlert([a, w, foreign], "33904", AREA)).toEqual([a]);
  });
  test("baseline class never rides an alert", () => {
    expect(pickDailyAlert([ev({ class: "baseline" })], "33904", AREA)).toEqual([]);
  });
});

describe("alertAbsorbsRoundup", () => {
  test("alert within the window absorbs; outside does not; null never absorbs", () => {
    expect(alertAbsorbsRoundup("2026-07-10T02:00:00Z", "2026-07-10T13:00:00Z")).toBe(true);
    expect(alertAbsorbsRoundup("2026-07-08T02:00:00Z", "2026-07-10T13:00:00Z")).toBe(false);
    expect(alertAbsorbsRoundup(null, "2026-07-10T13:00:00Z")).toBe(false);
  });
});
