// lib/project/schedule-calendar.test.ts
import { describe, expect, test } from "bun:test";
import { expandScheduleMonth, etDateISO } from "./schedule-calendar";
import type { EmailScheduleRow, SocialScheduleRow } from "./schedule-chips";

const email = (over: Partial<EmailScheduleRow>): EmailScheduleRow => ({
  id: 1,
  project_id: "p1",
  status: "active",
  cadence: "weekly",
  day_of_week: 1, // Monday
  day_of_month: null,
  send_hour_et: 8,
  audience_slug: "sphere",
  next_run_at: null,
  deliverable_id: null,
  ...over,
});
const social = (over: Partial<SocialScheduleRow>): SocialScheduleRow => ({
  id: 9,
  project_id: "p1",
  status: "active",
  cadence: "monthly",
  day_of_week: null,
  day_of_month: 15,
  send_hour_et: 9,
  platform: "instagram",
  next_run_at: null,
  ...over,
});

describe("expandScheduleMonth", () => {
  test("weekly Monday lands on every Monday of July 2026 (ET)", () => {
    const days = expandScheduleMonth([email({})], [], { year: 2026, month0: 6 });
    // July 2026 Mondays: 6, 13, 20, 27
    expect([...days.keys()].sort()).toEqual([
      "2026-07-06",
      "2026-07-13",
      "2026-07-20",
      "2026-07-27",
    ]);
    expect(days.get("2026-07-06")).toEqual([{ chipKey: "e1", kind: "email" }]);
  });

  test("monthly day 15 yields exactly one mark; paused schedules are excluded", () => {
    const days = expandScheduleMonth([email({ status: "paused" })], [social({})], {
      year: 2026,
      month0: 6,
    });
    expect([...days.keys()]).toEqual(["2026-07-15"]);
    expect(days.get("2026-07-15")).toEqual([{ chipKey: "s9", kind: "social" }]);
  });

  test("monthly day 31 in a 30-day month yields nothing (no invented occurrence)", () => {
    const days = expandScheduleMonth([], [social({ day_of_month: 31 })], {
      year: 2026,
      month0: 5, // June
    });
    expect(days.size).toBe(0);
  });

  test("once uses next_run_at directly, only when it falls in the target month", () => {
    const inMonth = email({ id: 2, cadence: "once", next_run_at: "2026-07-20T12:00:00.000Z" });
    const outMonth = email({ id: 3, cadence: "once", next_run_at: "2026-08-02T12:00:00.000Z" });
    const days = expandScheduleMonth([inMonth, outMonth], [], { year: 2026, month0: 6 });
    expect([...days.keys()]).toEqual(["2026-07-20"]);
    expect(days.get("2026-07-20")).toEqual([{ chipKey: "e2", kind: "email" }]);
  });

  test("daily across the November 2026 DST fall-back covers every calendar day once", () => {
    const days = expandScheduleMonth([email({ cadence: "daily", day_of_week: null })], [], {
      year: 2026,
      month0: 10,
    });
    expect(days.size).toBe(30); // November has 30 days; DST day never doubles or drops
  });

  test("etDateISO renders the ET calendar date of a UTC instant", () => {
    // 2026-07-07T02:30Z is still 07/06 22:30 in ET (EDT, UTC-4)
    expect(etDateISO(new Date("2026-07-07T02:30:00.000Z"))).toBe("2026-07-06");
  });
});
