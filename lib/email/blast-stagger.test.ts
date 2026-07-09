// lib/email/blast-stagger.test.ts — partition rule for engagement-staggered blasts
// (docs/superpowers/specs/2026-07-09-engagement-staggered-send-design.md §2).
import { describe, expect, it } from "bun:test";
import { partitionByEngagement, WAVE2_DELAY_MS, WAVE2_PACE_MS } from "./blast-stagger";

const c = (id: string) => ({ id, email: `${id}@x.com`, name: null });

describe("partitionByEngagement", () => {
  it("cold start: zero event rows → everyone wave 1 (behavior identical to today)", () => {
    const contacts = [c("a"), c("b")];
    const { wave1, wave2 } = partitionByEngagement(contacts, []);
    expect(wave1).toEqual(contacts);
    expect(wave2).toEqual([]);
  });

  it("dormant (delivered ≥2, never opened/clicked) → wave 2", () => {
    const events = [
      { contact_id: "a", event: "delivered" },
      { contact_id: "a", event: "delivered" },
    ];
    const { wave1, wave2 } = partitionByEngagement([c("a"), c("b")], events);
    expect(wave2.map((x) => x.id)).toEqual(["a"]);
    expect(wave1.map((x) => x.id)).toEqual(["b"]);
  });

  it("engaged (any opened or clicked) → wave 1 even with deep delivered history", () => {
    const events = [
      { contact_id: "a", event: "delivered" },
      { contact_id: "a", event: "delivered" },
      { contact_id: "a", event: "delivered" },
      { contact_id: "a", event: "opened" },
      { contact_id: "b", event: "delivered" },
      { contact_id: "b", event: "delivered" },
      { contact_id: "b", event: "clicked" },
    ];
    const { wave1, wave2 } = partitionByEngagement([c("a"), c("b")], events);
    expect(wave1.map((x) => x.id)).toEqual(["a", "b"]);
    expect(wave2).toEqual([]);
  });

  it("thin history (single delivered, no engagement) → wave 1", () => {
    const events = [{ contact_id: "a", event: "delivered" }];
    const { wave1 } = partitionByEngagement([c("a")], events);
    expect(wave1.map((x) => x.id)).toEqual(["a"]);
  });

  it("bounced → wave 2 regardless of delivered count, even when previously engaged", () => {
    const events = [
      { contact_id: "a", event: "bounced" },
      { contact_id: "b", event: "opened" },
      { contact_id: "b", event: "bounced" },
    ];
    const { wave1, wave2 } = partitionByEngagement([c("a"), c("b"), c("z")], events);
    expect(wave2.map((x) => x.id)).toEqual(["a", "b"]);
    expect(wave1.map((x) => x.id)).toEqual(["z"]);
  });

  it("ignores rows with null contact_id (pre-linkage events) and unknown contacts", () => {
    const events = [
      { contact_id: null, event: "delivered" },
      { contact_id: null, event: "delivered" },
      { contact_id: "stranger", event: "bounced" },
    ];
    const { wave1, wave2 } = partitionByEngagement([c("a")], events);
    expect(wave1.map((x) => x.id)).toEqual(["a"]);
    expect(wave2).toEqual([]);
  });

  it("preserves the caller's contact order inside each wave", () => {
    const events = [
      { contact_id: "b", event: "delivered" },
      { contact_id: "b", event: "delivered" },
      { contact_id: "d", event: "delivered" },
      { contact_id: "d", event: "delivered" },
    ];
    const { wave1, wave2 } = partitionByEngagement([c("a"), c("b"), c("c"), c("d")], events);
    expect(wave1.map((x) => x.id)).toEqual(["a", "c"]);
    expect(wave2.map((x) => x.id)).toEqual(["b", "d"]);
  });
});

describe("stagger constants", () => {
  it("wave-2 delay is 2 hours; pacing stays under Resend's 5 req/s team limit", () => {
    expect(WAVE2_DELAY_MS).toBe(2 * 60 * 60 * 1000);
    expect(1000 / WAVE2_PACE_MS).toBeLessThan(5);
  });
});
