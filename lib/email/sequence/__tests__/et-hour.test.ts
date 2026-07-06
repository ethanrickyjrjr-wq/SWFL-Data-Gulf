import { describe, expect, test } from "bun:test";
import { etHour } from "@/lib/email/sequence/et-hour";

describe("etHour", () => {
  test("UTC afternoon → ET morning (EDT, UTC-4)", () => {
    expect(etHour(new Date("2026-07-06T13:00:00Z"))).toBe(9);
  });
  test("EST winter (UTC-5)", () => {
    expect(etHour(new Date("2026-01-06T13:00:00Z"))).toBe(8);
  });
});
