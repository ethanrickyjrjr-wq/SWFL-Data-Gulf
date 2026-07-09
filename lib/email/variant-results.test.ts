// lib/email/variant-results.test.ts
import { describe, expect, it } from "bun:test";
import { cohortIndex } from "./variant-cohort";
import { variantResults } from "./variant-results";

function contactsFor(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `contact-${i}`);
}

describe("variantResults", () => {
  it("computes sent/opened/clicked per cohort from contactIds + events", () => {
    const contactIds = contactsFor(10);
    const events = [
      { variant: "0", event: "opened" },
      { variant: "0", event: "clicked" },
      { variant: "1", event: "opened" },
    ];
    const out = variantResults({
      contactIds,
      variantCount: 2,
      labels: { subjects: ["Subject A", "Subject B"] },
      events,
    });
    expect(out.cohorts).toHaveLength(2);
    const total = out.cohorts.reduce((a, c) => a + c.sent, 0);
    expect(total).toBe(10);
    expect(out.cohorts[0].label).toBe("Subject A");
  });

  it("skips a zero-recipient cohort entirely — never a fake 0% result", () => {
    // variantCount=3 but only 2 real cohorts get any contact (tiny audience, high N).
    const out = variantResults({
      contactIds: ["contact-0", "contact-1"],
      variantCount: 3,
      labels: { subjects: ["A", "B", "C"] },
      events: [],
    });
    expect(out.cohorts.every((c) => c.sent > 0)).toBe(true);
    expect(out.cohorts.length).toBeLessThan(3);
  });

  it("below the minimum sample, readyToCallWinner is false and winner is null", () => {
    const out = variantResults({
      contactIds: contactsFor(20), // < 50/cohort at N=2
      variantCount: 2,
      labels: { subjects: ["A", "B"] },
      events: [],
    });
    expect(out.readyToCallWinner).toBe(false);
    expect(out.winner).toBeNull();
  });

  it("gates exactly at the 49 vs 50 recipients-per-cohort boundary", () => {
    // Build EXACT cohort sizes via cohortIndex itself (deterministic, not random)
    // rather than assuming a specific pool size lands evenly.
    const pool = Array.from({ length: 3000 }, (_, i) => `pool-${i}`);
    const forCohort = (want: number, n: number) =>
      pool.filter((id) => cohortIndex(id, 2) === want).slice(0, n);

    const at49 = variantResults({
      contactIds: [...forCohort(0, 49), ...forCohort(1, 49)],
      variantCount: 2,
      labels: { subjects: ["A", "B"] },
      events: [],
    });
    expect(at49.cohorts.every((c) => c.sent === 49)).toBe(true);
    expect(at49.readyToCallWinner).toBe(false); // below the 50 floor — gate OFF

    const at50 = variantResults({
      contactIds: [...forCohort(0, 50), ...forCohort(1, 50)],
      variantCount: 2,
      labels: { subjects: ["A", "B"] },
      events: [],
    });
    expect(at50.cohorts.every((c) => c.sent === 50)).toBe(true);
    expect(at50.readyToCallWinner).toBe(true); // at the 50 floor — gate ON
    expect(at50.winner).toBeNull(); // gate on ≠ a winner found — zero clicks here, different reason
  });

  it("at/above the minimum sample with a real click-rate gap, declares a significant winner", () => {
    // 60 recipients per cohort (>= MIN_SAMPLE); cohort 1 clicks at 40%, cohort 0 at 5%.
    const contactIds = contactsFor(120);
    // Deterministic, unambiguous gap: force exact click counts per cohort rather
    // than a random draw (a random pass/fail rate would make this test flaky).
    const forced = contactIds.map((id, i) => ({
      variant: String(cohortIndex(id, 2)),
      event: "clicked",
      i,
    }));
    const byVariant = {
      "0": forced.filter((f) => f.variant === "0"),
      "1": forced.filter((f) => f.variant === "1"),
    };
    const clickedEvents = [
      ...byVariant["0"].slice(0, Math.floor(byVariant["0"].length * 0.05)),
      ...byVariant["1"].slice(0, Math.floor(byVariant["1"].length * 0.4)),
    ].map((f) => ({ variant: f.variant, event: "clicked" }));
    const out = variantResults({
      contactIds,
      variantCount: 2,
      labels: { subjects: ["A", "B"] },
      events: clickedEvents,
    });
    expect(out.readyToCallWinner).toBe(true);
    expect(out.winner).not.toBeNull();
    expect(out.winner?.variant).toBe(1);
  });

  it("a close race at the sample floor does NOT declare a winner", () => {
    const contactIds = contactsFor(120);
    const events = contactIds
      .slice(0, 10) // a handful of clicks, evenly implied — not a real gap
      .map((id) => ({ variant: String(cohortIndex(id, 2)), event: "clicked" }));
    const out = variantResults({
      contactIds,
      variantCount: 2,
      labels: { subjects: ["A", "B"] },
      events,
    });
    expect(out.winner).toBeNull();
  });
});
