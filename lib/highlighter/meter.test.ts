import { test, expect } from "bun:test";
import { isoWeek, capEnabled } from "./meter";

test("isoWeek formats as YYYY-Www", () => {
  expect(isoWeek(new Date("2026-06-07T00:00:00Z"))).toMatch(/^2026-W\d{2}$/);
});

test("capEnabled is false when the env var is unset", () => {
  delete process.env.HIGHLIGHTER_FREE_WEEKLY_CAP;
  expect(capEnabled()).toBe(false);
});
