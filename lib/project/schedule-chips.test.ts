// lib/project/schedule-chips.test.ts
import { describe, expect, test } from "bun:test";
import { buildScheduleChips } from "./schedule-chips";

const email = (over = {}) => ({
  id: 1,
  project_id: "p1",
  status: "active",
  cadence: "weekly",
  day_of_week: 1,
  day_of_month: null,
  send_hour_et: 7,
  audience_slug: "farm",
  next_run_at: "2026-07-20T11:00:00Z",
  deliverable_id: "d1",
  ...over,
});
const social = (over = {}) => ({
  id: 9,
  project_id: "p1",
  status: "active",
  cadence: "weekly",
  day_of_week: 1,
  day_of_month: null,
  send_hour_et: 10,
  platform: "facebook",
  next_run_at: "2026-07-21T14:00:00Z",
  ...over,
});

describe("buildScheduleChips", () => {
  test("email chip: line, audience, tailor href with did+schedule", () => {
    const { chipsByProject } = buildScheduleChips([email()], []);
    const chip = chipsByProject.get("p1")![0];
    expect(chip.kind).toBe("email");
    expect(chip.line.startsWith("Emails ")).toBe(true);
    expect(chip.audience).toBe("farm");
    expect(chip.href).toBe("/project/p1/email-lab?did=d1&schedule=1");
  });
  test("email chip without deliverable falls back to projectHome", () => {
    const { chipsByProject } = buildScheduleChips([email({ deliverable_id: null })], []);
    expect(chipsByProject.get("p1")![0].href).toBe("/project/p1/email-lab");
  });
  test("social chip: platform line + social href", () => {
    const { chipsByProject } = buildScheduleChips([], [social()]);
    const chip = chipsByProject.get("p1")![0];
    expect(chip.kind).toBe("social");
    expect(chip.line.startsWith("Posts to facebook ")).toBe(true);
    expect(chip.href).toBe("/project/p1/social");
  });
  test("null project_id chips are excluded from the map but counted", () => {
    const s = buildScheduleChips([email({ project_id: null })], []);
    expect(s.chipsByProject.size).toBe(0);
    expect(s.activeCount).toBe(1);
  });
  test("upcoming: active-with-nextAt only, soonest first, limited", () => {
    const s = buildScheduleChips([email(), email({ id: 2, status: "paused" })], [social()], {
      upcomingLimit: 1,
    });
    expect(s.activeCount).toBe(2);
    expect(s.upcoming.length).toBe(1);
    expect(s.upcoming[0].key).toBe("e1");
  });
});
