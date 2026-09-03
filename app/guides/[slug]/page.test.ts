import { test, expect } from "bun:test";
import { generateMetadata } from "./page";
import { GUIDES } from "@/lib/guides/registry";

/**
 * Pins the fix for the title-doubling bug (2026-09-02): `generateMetadata`
 * used to bake "— SWFL Data Gulf" into its `title` field, and root
 * layout.tsx's `title.template` ("%s — SWFL Data Gulf") appended it again,
 * doubling the rendered <title>. `title` must stay bare; `openGraph.title`
 * (not templated) is unaffected and keeps its own bare value here too.
 */
test("every guide's title stays bare — no site suffix baked in", async () => {
  expect(GUIDES.length).toBeGreaterThan(0);
  for (const guide of GUIDES) {
    const m = await generateMetadata({ params: Promise.resolve({ slug: guide.slug }) });
    expect(m.title).toBe(guide.title);
    expect(m.title).not.toMatch(/SWFL Data Gulf/);
  }
});

test("unknown slug returns empty metadata, not a fabricated title", async () => {
  const m = await generateMetadata({ params: Promise.resolve({ slug: "not-a-real-guide" }) });
  expect(m.title).toBeUndefined();
});
