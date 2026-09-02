import { test, expect } from "bun:test";
import { generateMetadata } from "./page";

/**
 * Pins the fix for the title-doubling bug (2026-09-02): `generateMetadata`
 * used to bake "— SWFL Data Gulf" into its `title` field (both the success
 * path reading a real `brains/<slug>.md` file and the catch-branch
 * displayName fallback), and root layout.tsx's `title.template`
 * ("%s — SWFL Data Gulf") appended it again, doubling the rendered <title>.
 * Reads a real committed brain file — no mocking, no network.
 */
test("resolved brain's title stays bare — no site suffix baked in", async () => {
  const m = await generateMetadata({ params: Promise.resolve({ slug: "housing-swfl" }) });
  expect(typeof m.title).toBe("string");
  expect(m.title as string).not.toMatch(/SWFL Data Gulf/);
});

test("unresolved slug falls back to a bare displayName, no site suffix", async () => {
  const m = await generateMetadata({ params: Promise.resolve({ slug: "not-a-real-brain-xyz" }) });
  expect(m.title).toBe("Not A Real Brain Xyz");
  expect(m.title).not.toMatch(/SWFL Data Gulf/);
});
