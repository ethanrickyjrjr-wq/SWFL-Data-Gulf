import { test, expect } from "bun:test";
import { generateMetadata } from "./page";

/**
 * Pins the fix for the title-doubling bug (2026-09-02): `generateMetadata`
 * used to bake "— SWFL Data Gulf" into its `title` field (both the success
 * path reading `brains/housing-swfl.md` and the catch-branch fallback), and
 * root layout.tsx's `title.template` ("%s — SWFL Data Gulf") appended it
 * again, doubling the rendered <title>. Reads the real committed brain file
 * — no mocking, no network — same as the page itself does at request time.
 */
test("title stays bare — no site suffix baked in", async () => {
  const m = await generateMetadata();
  expect(typeof m.title).toBe("string");
  expect(m.title as string).not.toMatch(/SWFL Data Gulf/);
  expect(m.description).toBeDefined();
});
