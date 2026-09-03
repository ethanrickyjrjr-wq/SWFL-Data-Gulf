import { test, expect } from "bun:test";
import { chartTitle } from "./page";

/**
 * Pins the fix for the title-doubling bug (2026-09-02): `generateMetadata`
 * used to bake "— SWFL Data Gulf" into its `title` metadata field, and root
 * layout.tsx's `title.template` ("%s — SWFL Data Gulf") appended it again,
 * doubling the rendered <title>. `chartTitle` is the pure, no-I/O piece that
 * decides the bare page title — extracted so this can be pinned without a
 * live Supabase call (generateMetadata's DB read throws outside an
 * environment with SUPABASE_URL/SUPABASE_SERVICE_KEY set).
 */
test("chartTitle stays bare — no site suffix baked in", () => {
  expect(chartTitle({ title: "Median Sale Price — Cape Coral" } as never)).toBe(
    "Median Sale Price — Cape Coral",
  );
  expect(chartTitle({ title: "Median Sale Price — Cape Coral" } as never)).not.toMatch(
    /SWFL Data Gulf/,
  );
});

test("chartTitle falls back to 'Saved Chart' for a missing/null chart_block", () => {
  expect(chartTitle(null)).toBe("Saved Chart");
  expect(chartTitle(undefined)).toBe("Saved Chart");
});
