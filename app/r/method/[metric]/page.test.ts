import { test, expect } from "bun:test";
import { generateMetadata } from "./page";
import { METHODOLOGY_LITERALS } from "@/refinery/lib/methodology-registry.mts";

/**
 * Pins the fix for the title-doubling bug (2026-09-02): `generateMetadata`
 * used to bake "— SWFL Data Gulf" into its `title` field (both the resolved
 * and unresolved-metric branches), and root layout.tsx's `title.template`
 * ("%s — SWFL Data Gulf") appended it again, doubling the rendered <title>.
 */
test("resolved metric's title stays bare — no site suffix baked in", async () => {
  const [metric] = Object.keys(METHODOLOGY_LITERALS);
  expect(metric).toBeDefined();
  const m = await generateMetadata({ params: Promise.resolve({ metric }) });
  expect(m.title).toContain("how it is computed");
  expect(m.title).not.toMatch(/SWFL Data Gulf/);
});

test("unresolved metric falls back to bare 'Methodology'", async () => {
  const m = await generateMetadata({ params: Promise.resolve({ metric: "not_a_real_metric" }) });
  expect(m.title).toBe("Methodology");
});
