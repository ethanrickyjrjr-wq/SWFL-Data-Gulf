import { test, expect } from "bun:test";
import { fileURLToPath } from "node:url";

test("live tier-divergence reader preserves prior-month YoY values including zero and null", async () => {
  // Isolate the cached Supabase client and environment from every other source test.
  const script = `
    import { env } from "./refinery/config/env.mts";
    import { tierDivergenceZipLatestSource } from "./refinery/sources/tier-divergence-zip-latest-source.mts";
    const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch() {
      return Response.json(Array.from({ length: 85 }, (_, i) => ({
        zip_code: String(33900 + i), latest_period: "2026-07-31",
        top_tier_yoy_prior_month_pct: i === 0 ? 0 : i === 1 ? null : 2.5,
        bottom_tier_yoy_prior_month_pct: i === 0 ? -1.5 : null
      })));
    }});
    env.supabaseUrl = server.url.toString();
    env.supabaseKey = "test-only";
    process.env.REFINERY_SOURCE = "live";
    try {
      const rows = await tierDivergenceZipLatestSource.fetch();
      console.log(JSON.stringify(rows.slice(0, 3).map(r => r.normalized)));
    } finally { server.stop(true); }
  `;
  const child = Bun.spawn([process.execPath, "--eval", script], {
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(stderr).toBe("");
  expect(exitCode).toBe(0);
  const rows = JSON.parse(stdout);
  expect(rows[0].top_tier_yoy_prior_month_pct).toBe(0);
  expect(rows[0].bottom_tier_yoy_prior_month_pct).toBe(-1.5);
  expect(rows[1].top_tier_yoy_prior_month_pct).toBeNull();
  expect(rows[2].top_tier_yoy_prior_month_pct).toBe(2.5);
});
