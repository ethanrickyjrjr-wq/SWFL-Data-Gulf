// lib/landing/home-spine.static.test.ts
//
// Source-level pins for the one-bar homepage (spec 2026-07-12). The one-input
// invariant is compositional: HeroBar renders exactly one <input> (its own
// render test), Hero contains none (pinned here), and the page imports no
// other input-bearing component (pinned here). This is the regression that
// caused the rebuild — it must not return silently.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("homepage spine (static pins)", () => {
  const page = read("app/page.tsx");

  test("the demo theater is gone", () => {
    expect(page).not.toContain("CampaignReveal");
    expect(page).not.toContain("buildCampaignDemo");
    expect(page).not.toContain("HeroCampaign");
  });

  test("no second input-bearing component is imported", () => {
    expect(page).not.toContain("WeeklyReadCapture");
    expect(page).not.toContain("Waitlist");
  });

  test("WeeklyReadCapture's header does not claim to replace anything live while unmounted", () => {
    // This file is confirmed unmounted (assertion above) — its own header
    // comment must not claim present-tense that it "replaces" a dead-end
    // waitlist, which would be stale/misleading now that nothing renders it.
    // Deletion is also a valid disposition for this file (operator call) —
    // don't fail the suite if it's gone, only if it's stale-and-present.
    const rel = "components/landing/WeeklyReadCapture.tsx";
    if (!existsSync(join(process.cwd(), rel))) return;
    const normalized = read(rel).replace(/\*/g, " ").replace(/\s+/g, " ");
    expect(normalized).not.toContain("replaces the dead-end waitlist");
  });

  test("the spine is bar → map → doors → guides → pricing → faq", () => {
    const order = [
      "<HeroBar",
      "<Hero ",
      "<SiteDoors",
      "<GuidesStrip",
      "<PricingStrip",
      "<ObjectionFaq",
    ].map((tag) => page.indexOf(tag));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  test("the map section has no input of its own", () => {
    const hero = read("components/landing/Hero.tsx");
    expect(hero).not.toContain("<input");
    expect(hero).not.toContain("search-bar");
  });

  test("doors are Desk + Insiders only — Guides is a full section now", () => {
    const doors = read("components/landing/SiteDoors.tsx");
    expect(doors).toContain("/desk");
    expect(doors).toContain("/insiders");
    expect(doors).not.toContain("/guides");
  });

  test("stats-bar figures are tappable facts (FactChip seam, not a new system)", () => {
    const hero = read("components/landing/Hero.tsx");
    expect(hero).toContain("FactChip");
    expect(hero).toContain("useHighlighterContext");
    // Rail rows must NOT get chips — they are already buttons (nested-button hazard).
    expect(hero.slice(hero.indexOf("rail-top-list"), hero.indexOf("rail-footer"))).not.toContain(
      "FactChip",
    );
  });

  test("the deleted theater stays deleted", () => {
    for (const gone of [
      "components/landing/CampaignReveal.tsx",
      "components/landing/HeroCampaign.tsx",
      "lib/landing/campaign-demo.ts",
    ]) {
      expect(existsSync(join(process.cwd(), gone))).toBe(false);
    }
    expect(read("components/landing/home-explorer.css")).not.toContain(".cr-");
  });
});
