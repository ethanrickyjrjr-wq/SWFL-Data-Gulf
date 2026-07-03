// lib/email/weekly-read/cadence.test.ts
import { describe, expect, it } from "bun:test";
import { afterSend, jitterDays, onEvent, shouldSend } from "./cadence";

const NOW = new Date("2026-07-03T12:00:00Z");

describe("shouldSend", () => {
  it("active + never sent (null) is due", () => {
    expect(shouldSend({ status: "active", next_send_at: null }, NOW)).toBe(true);
  });
  it("active + past schedule is due", () => {
    expect(shouldSend({ status: "active", next_send_at: "2026-07-01T00:00:00Z" }, NOW)).toBe(true);
  });
  it("active + future schedule is not due", () => {
    expect(shouldSend({ status: "active", next_send_at: "2026-07-09T00:00:00Z" }, NOW)).toBe(false);
  });
  it("terminal statuses never send, even when due", () => {
    expect(shouldSend({ status: "unsubscribed", next_send_at: null }, NOW)).toBe(false);
    expect(shouldSend({ status: "bounced", next_send_at: null }, NOW)).toBe(false);
  });
});

describe("afterSend", () => {
  it("schedules 6–8 days out, deterministically per subscriber", () => {
    const a = afterSend("sub-aaaa", NOW);
    const b = afterSend("sub-aaaa", NOW);
    expect(a.next_send_at).toBe(b.next_send_at);
    const days = (new Date(a.next_send_at).getTime() - NOW.getTime()) / 86_400_000;
    expect(days).toBeGreaterThanOrEqual(6);
    expect(days).toBeLessThanOrEqual(8);
  });
  it("different subscribers can land on different days (jitter)", () => {
    const days = new Set(
      ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"].map(
        (id) => (new Date(afterSend(id, NOW).next_send_at).getTime() - NOW.getTime()) / 86_400_000,
      ),
    );
    expect(days.size).toBeGreaterThan(1);
  });
});

describe("jitterDays", () => {
  it("stays within [min, max]", () => {
    for (const id of ["a", "bb", "ccc", "dddd-eeee"]) {
      const d = jitterDays(id, 6, 8);
      expect(d).toBeGreaterThanOrEqual(6);
      expect(d).toBeLessThanOrEqual(8);
    }
  });
});

describe("onEvent", () => {
  it("bounce → bounced; unsubscribe/complaint → unsubscribed", () => {
    expect(onEvent("active", "bounced")).toBe("bounced");
    expect(onEvent("active", "unsubscribed")).toBe("unsubscribed");
    expect(onEvent("active", "complained")).toBe("unsubscribed");
  });
  it("terminal statuses are never changed (null)", () => {
    expect(onEvent("unsubscribed", "bounced")).toBeNull();
    expect(onEvent("bounced", "complained")).toBeNull();
  });
});
