import { test, expect } from "bun:test";
import { TOPIC_TO_SLUG, INTENTIONALLY_UNROUTED } from "./reach";
import { BRAIN_CATALOG } from "@/refinery/packs/catalog.mts";

/**
 * REACH-COVERAGE GUARD — the anti-recurrence backstop for "the data exists but
 * no question can reach it."
 *
 * Why this file exists (2026-07-09): 26 of 39 catalogued brains had no rule in
 * `TOPIC_TO_SLUG`, so chat grounding and the chart producer could never route
 * to them — crime/safety, unemployment, rent yield, condo SIRS, hurricane
 * history, mortgage rates, traffic — while every build/freshness dashboard
 * stayed green. The catalog joint already had this guard (`catalog.test.mts` +
 * `KNOWN_INCOMPLETE`); the routing joint had nothing. This is that guard:
 * cataloguing a brain without deciding its routing is now a test failure, not
 * a silent dead zone. Shrink `INTENTIONALLY_UNROUTED` as rules are added;
 * never grow it without a written reason.
 */

const catalogIds = new Set(BRAIN_CATALOG.map((e) => e.id));
const routedSlugs = new Set(TOPIC_TO_SLUG.map((r) => r.slug));

test("every catalogued brain is routed in TOPIC_TO_SLUG or intentionally unrouted with a reason", () => {
  for (const id of catalogIds) {
    const routed = routedSlugs.has(id);
    const excused = Object.hasOwn(INTENTIONALLY_UNROUTED, id);
    expect(
      routed || excused,
      `"${id}" is in BRAIN_CATALOG but has no TOPIC_TO_SLUG rule and no INTENTIONALLY_UNROUTED reason — decide its routing`,
    ).toBe(true);
    expect(
      !(routed && excused),
      `"${id}" is BOTH routed and INTENTIONALLY_UNROUTED — remove the stale excuse`,
    ).toBe(true);
  }
});

test("every INTENTIONALLY_UNROUTED entry carries a real reason", () => {
  for (const [id, reason] of Object.entries(INTENTIONALLY_UNROUTED)) {
    expect(reason.trim().length, `"${id}" has an empty unrouted reason`).toBeGreaterThan(10);
  }
});

test("no zombie excuses: every INTENTIONALLY_UNROUTED id exists in the catalog", () => {
  for (const id of Object.keys(INTENTIONALLY_UNROUTED)) {
    expect(catalogIds.has(id), `INTENTIONALLY_UNROUTED has "${id}" but the catalog does not`).toBe(
      true,
    );
  }
});

// `ALLOWED` fail-closes uncatalogued slugs at runtime, so a rule for one is an
// inert no-op — a fix that fixes nothing. Fail loud at test time instead.
test("every TOPIC_TO_SLUG rule targets a catalogued brain", () => {
  for (const { slug } of TOPIC_TO_SLUG) {
    expect(
      catalogIds.has(slug),
      `TOPIC_TO_SLUG routes to "${slug}" which is not in BRAIN_CATALOG — the rule is a silent no-op`,
    ).toBe(true);
  }
});
