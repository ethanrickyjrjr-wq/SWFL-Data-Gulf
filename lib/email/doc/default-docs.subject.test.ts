// Capture-or-blank (spec 2026-07-16-seed-capture-or-blank-design.md): every
// template declares what its right content depends on. The field is required at
// the type level; this test guards runtime drift (a JSON-ish edit shipping an
// invalid string) and pins the classification of the load-bearing groups.
import { describe, expect, it } from "bun:test";
import { SEED_DOCS } from "./default-docs";

const SUBJECTS = new Set(["address", "area", "none"]);

describe("SeedDoc.subject classification", () => {
  it("every template declares a valid subject", () => {
    for (const s of SEED_DOCS) {
      expect(SUBJECTS.has(s.subject), `${s.id} subject=${String(s.subject)}`).toBe(true);
    }
  });

  it("listing-shaped templates need an address", () => {
    for (const id of [
      "just-sold",
      "just-sold-grid",
      "new-listing",
      "listing-feature",
      "open-house",
      "price-reduced",
      "skeleton-listing-showcase",
    ]) {
      expect(SEED_DOCS.find((s) => s.id === id)?.subject, id).toBe("address");
    }
  });

  it("market-shaped templates need an area", () => {
    for (const id of [
      "market-spotlight",
      "market-letter",
      "luxury-market-report",
      "weekly-pulse",
      "neighborhood-report",
      "investment-brief",
      "rate-watch",
      "monthly-digest",
      "year-in-review",
      "trend-snapshot",
      "listing-digest",
    ]) {
      expect(SEED_DOCS.find((s) => s.id === id)?.subject, id).toBe("area");
    }
  });

  it("style and relational templates need nothing beyond brand/region", () => {
    for (const id of [
      "welcome",
      "minimal",
      "agent-spotlight",
      "skeleton-clean-white",
      "skeleton-dark-pro",
      "skeleton-agent-feature",
      "stay-in-touch",
      "editorial-letter",
      "magazine-issue",
    ]) {
      expect(SEED_DOCS.find((s) => s.id === id)?.subject, id).toBe("none");
    }
  });
});
