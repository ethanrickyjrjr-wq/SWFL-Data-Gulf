// lib/project/user-data-feed.test.ts
// Guard: spec §5 — provenance travels with the binding. Every emitted block
// names its origin; a figure NEVER renders without "stated by the user".
import { describe, expect, test } from "bun:test";
import { formatUserData } from "./user-data-feed";
import type { ProjectItem } from "./items";

const figure: ProjectItem = {
  id: "f1",
  added_at: "2026-08-03T00:00:00Z",
  origin: "web",
  kind: "user_figure",
  label: "Avg days to close",
  value: "21",
  unit: "days",
  as_of: "08/03/2026",
  stated_by: "user",
};

describe("formatUserData", () => {
  test("figure block carries label, value, unit, and stated-by provenance", () => {
    const out = formatUserData([figure], []);
    expect(out).toContain("Avg days to close");
    expect(out).toContain("21 days");
    expect(out).toContain("stated by the user");
    expect(out).toContain("as of 08/03/2026");
  });
  test("listing block names its origin (user-brought) and import date", () => {
    const out = formatUserData(
      [],
      [
        {
          address: "1 A St, Fort Myers, FL 33901",
          price: 450000,
          beds: 3,
          baths: 2.5,
          sqft: 1978,
          status: "Active",
          county: "Lee",
          updated_at: "2026-08-03T12:00:00Z",
        },
      ],
    );
    expect(out).toContain("1 A St");
    expect(out).toContain("450000");
    expect(out).toContain("brought by the user");
  });
  test("empty inputs → empty string", () => {
    expect(formatUserData([], [])).toBe("");
  });
});
