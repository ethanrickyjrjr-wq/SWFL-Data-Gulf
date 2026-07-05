// lib/social-pulse/load.test.ts
import { test, expect } from "bun:test";
import { loadLatestDigest } from "./load";

test("returns null when the table is empty (page renders the pre-launch state)", async () => {
  const fake = {
    from: () => ({
      select: () => ({
        order: () => ({
          limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
        }),
      }),
    }),
  };
  expect(await loadLatestDigest({ client: fake as never })).toBeNull();
});

test("returns digest + narrative from the latest week row", async () => {
  const row = {
    week: "2026-W27",
    digest: { week: "2026-W27", asOf: "07/05/2026" },
    narrative: "brief",
  };
  const fake = {
    from: () => ({
      select: () => ({
        order: () => ({
          limit: () => ({ maybeSingle: async () => ({ data: row, error: null }) }),
        }),
      }),
    }),
  };
  const out = await loadLatestDigest({ client: fake as never });
  expect(out?.narrative).toBe("brief");
  expect(out?.digest.week).toBe("2026-W27");
});
