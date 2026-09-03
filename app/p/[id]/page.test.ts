import { test, expect } from "bun:test";
import { deliverableTitle } from "./page";

/**
 * Pins the fix for the title-doubling bug (2026-09-02): `generateMetadata`
 * used to bake "— SWFL Data Gulf" into its `title` field, and root
 * layout.tsx's `title.template` ("%s — SWFL Data Gulf") appended it again,
 * doubling the rendered <title>. `deliverableTitle` is the pure, no-I/O piece
 * that decides the bare page title — extracted so this can be pinned without
 * a live Supabase call (generateMetadata's DB read throws outside an
 * environment with SUPABASE_URL/SUPABASE_SERVICE_KEY set). The revoked/
 * trashed branch already used `title: { absolute: "SWFL Data Gulf" } }` to
 * bypass the template correctly — untouched here.
 */
test("deliverableTitle takes the first sentence of exec_summary, stays bare", () => {
  const title = deliverableTitle("Median sale price rose 4% in Cape Coral. Days on market fell.");
  expect(title).toBe("Median sale price rose 4% in Cape Coral");
  expect(title).not.toMatch(/SWFL Data Gulf/);
});

test("deliverableTitle falls back to 'Deliverable' when exec_summary is missing", () => {
  expect(deliverableTitle(null)).toBe("Deliverable");
  expect(deliverableTitle(undefined)).toBe("Deliverable");
});
