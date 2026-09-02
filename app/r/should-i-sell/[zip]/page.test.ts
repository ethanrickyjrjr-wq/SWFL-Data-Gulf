import { test, expect } from "bun:test";
import { generateMetadata } from "./page";

/**
 * Pins the fix for the title-doubling bug (2026-09-02): `generateMetadata`
 * used to bake "— SWFL Data Gulf" into its `title` field, and root
 * layout.tsx's `title.template` ("%s — SWFL Data Gulf") appended it again,
 * doubling the rendered <title>. `openGraph.title`/`twitter.title` are NOT
 * templated, so they correctly keep the suffix.
 */
test("title stays bare, openGraph/twitter titles keep the site suffix", async () => {
  const m = await generateMetadata({
    params: Promise.resolve({ zip: "33904" }),
    searchParams: Promise.resolve({}),
  });
  expect(m.title).toBe("Should I sell in Cape Coral 33904?");
  expect(m.title).not.toMatch(/SWFL Data Gulf/);
  expect(m.openGraph?.title).toBe("Should I sell in Cape Coral 33904? — SWFL Data Gulf");
  expect(m.twitter?.title).toBe("Should I sell in Cape Coral 33904? — SWFL Data Gulf");
});

test("out-of-scope/unknown ZIP falls back to the bare 'ZIP {zip}' label", async () => {
  const m = await generateMetadata({
    params: Promise.resolve({ zip: "99999" }),
    searchParams: Promise.resolve({}),
  });
  expect(m.title).toBe("Should I sell in ZIP 99999?");
  expect(m.title).not.toMatch(/SWFL Data Gulf/);
});
