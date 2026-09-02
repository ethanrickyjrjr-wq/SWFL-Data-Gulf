import { test, expect } from "bun:test";
import { projectTitle } from "./page";

/**
 * Pins the fix for the title-doubling bug (2026-09-02): `generateMetadata`
 * used to bake "— SWFL Data Gulf" into its `title` field, and root
 * layout.tsx's `title.template` ("%s — SWFL Data Gulf") appended it again,
 * doubling the rendered <title>. `projectTitle` is the pure, no-I/O piece
 * that decides the bare page title — extracted so this can be pinned without
 * a live Supabase call.
 */
test("projectTitle stays bare — no site suffix baked in", () => {
  expect(projectTitle("Cape Coral Portfolio")).toBe("Cape Coral Portfolio");
  expect(projectTitle("Cape Coral Portfolio")).not.toMatch(/SWFL Data Gulf/);
});

test("projectTitle falls back to 'Project' for missing/empty titles", () => {
  expect(projectTitle(null)).toBe("Project");
  expect(projectTitle(undefined)).toBe("Project");
  expect(projectTitle("")).toBe("Project");
});
