// lib/project/this-week.test.ts
import { describe, expect, test } from "bun:test";
import {
  DAY_OF_WEEK,
  missingSides,
  staleQueueDids,
  weekDids,
  weekIsCurrent,
  type ThisWeekState,
} from "./this-week";

const week: ThisWeekState = {
  week_of: "2026-06-29",
  generated_at: "2026-06-29T12:00:00.000Z",
  email: { did: "d1", state: "pending" },
  social: [
    { day: "mon", did: "d2", theme: "Market Monday", caption: "c", hashtags: [], state: "pending" },
  ],
};

describe("weekIsCurrent (once-per-week guard)", () => {
  test("true only when week_of matches the given Monday", () => {
    expect(weekIsCurrent(week, "2026-06-29")).toBe(true);
    expect(weekIsCurrent(week, "2026-07-06")).toBe(false);
  });
  test("false for null/undefined", () => {
    expect(weekIsCurrent(null, "2026-06-29")).toBe(false);
    expect(weekIsCurrent(undefined, "2026-06-29")).toBe(false);
  });
});

describe("missingSides (partial-failure retry)", () => {
  test("nothing generated yet → both missing", () => {
    expect(missingSides(null)).toEqual({ email: true, social: true });
  });
  test("full week → nothing missing", () => {
    expect(missingSides(week)).toEqual({ email: false, social: false });
  });
  test("email failed (null) → only email missing", () => {
    expect(missingSides({ ...week, email: null })).toEqual({ email: true, social: false });
  });
  test("social failed (empty) → only social missing", () => {
    expect(missingSides({ ...week, social: [] })).toEqual({ email: false, social: true });
  });
});

describe("weekDids (materials-library exclusion set)", () => {
  test("collects the email did and every social did", () => {
    expect(weekDids(week)).toEqual(["d1", "d2"]);
  });
  test("email null → socials only", () => {
    expect(weekDids({ ...week, email: null })).toEqual(["d2"]);
  });
  test("null/undefined week → empty", () => {
    expect(weekDids(null)).toEqual([]);
    expect(weekDids(undefined)).toEqual([]);
  });
});

describe("staleQueueDids (rollover trash set)", () => {
  test("pending and skipped are trashable; approved and scheduled graduate", () => {
    const mixed: ThisWeekState = {
      ...week,
      email: { did: "d1", state: "approved" },
      social: [
        { ...week.social[0]!, did: "d2", state: "pending" },
        { ...week.social[0]!, did: "d3", state: "skipped" },
        { ...week.social[0]!, did: "d4", state: "scheduled" },
      ],
    };
    expect(staleQueueDids(mixed)).toEqual(["d2", "d3"]);
  });
  test("pending email is trashable too", () => {
    expect(staleQueueDids(week)).toEqual(["d1", "d2"]);
  });
  test("null week → empty", () => {
    expect(staleQueueDids(null)).toEqual([]);
  });
});

describe("DAY_OF_WEEK", () => {
  test("maps mon..fri to 1..5 (Sun=0 convention)", () => {
    expect(DAY_OF_WEEK).toEqual({ mon: 1, tue: 2, wed: 3, thu: 4, fri: 5 });
  });
});
