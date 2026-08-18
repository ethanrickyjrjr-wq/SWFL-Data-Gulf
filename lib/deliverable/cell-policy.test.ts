// lib/deliverable/cell-policy.test.ts
//
// THE FLEET TEST FOR BUYER-FACING CELL POLICY (operator decree 08/18/2026, twice in one
// day): "why the fuck do we want HOA costs on there? We don't want to detour any potential
// buyers before arriving" — and, on discovering the ruling had only been implemented on
// under-contract while new-listing still rendered the fee: "THIS IS ALL A FUCKING LIE."
//
// The failure class this file kills: a content ruling implemented on ONE recipe and never
// walked to the other sixteen. The registry (cell-policy.ts) is the ONE root a ruling lands
// in; the chrome backstop (buildLifecycleEmail) makes a banned cell physically unable to
// render on ANY lifecycle email; this file proves both — and Gate 18 in
// .claude/hooks/check-prepush-gate.mjs runs it on every push that touches a recipe.
//
// Each test is named after the failure mode it targets (RULE 3.5 TDD).

import { describe, expect, test } from "bun:test";

import { BUYER_FACING_BANNED_CELLS, bannedCellRule, stripBannedCells } from "./cell-policy";
import { buildLifecycleEmail } from "@/lib/email/lifecycle-chrome";
import { DEFAULT_GLOBAL_STYLE, createBlock } from "@/lib/email/doc/default-docs";
import type { EmailDoc, StatItem } from "@/lib/email/doc/types";
import type { ListingFacts } from "@/lib/email/listing-scrape";

import { openHouseSpecs } from "./recipes/open-house";
import { underContractSpecs } from "./recipes/under-contract";
import { teaserSpecs } from "./recipes/coming-soon";
import { compsSpecs } from "./recipes/market-comps";

/** A fully-loaded facts object — the HOA fee IS held. Holding a fact and rendering a cell
 *  are different questions; that split is the whole policy. */
const LOADED_FACTS: ListingFacts = {
  address: "12281 McGregor Palms Dr, Fort Myers, FL 33908",
  photos: [],
  sourceUrl: "https://example.com/listing",
  price: "$689,000",
  beds: "3",
  baths: "2",
  sqft: "2,130",
  yearBuilt: "1988",
  hoaFee: 225,
  daysOnMarket: 12,
} as ListingFacts;

const statLabels = (doc: EmailDoc): string[] =>
  doc.blocks
    .filter((b) => b.type === "stats")
    .flatMap((b) => ((b.props as { stats?: StatItem[] }).stats ?? []).map((s) => s.label));

describe("cell-policy matcher — the cost family is banned, the value family never is", () => {
  test("FAILURE MODE: a cost cell label slips past the matcher", () => {
    for (const label of [
      "HOA/mo",
      "HOA fee",
      "Taxes/yr",
      "Property Tax",
      "Insurance/mo",
      "CDD",
      "Dues/mo",
      "Carrying cost",
    ]) {
      expect(bannedCellRule(label)?.id).toBeDefined();
    }
  });

  test("FAILURE MODE: the matcher over-reaches and bans a value cell", () => {
    for (const label of [
      "$/Sq Ft",
      "Beds",
      "Baths",
      "Sq Ft",
      "DOM",
      "Built",
      "Type",
      "Asking",
      "Sold For",
      "Lot",
    ]) {
      expect(bannedCellRule(label)).toBeNull();
    }
  });

  test("every rule carries its decree — a ban nobody can trace is a ban that gets re-litigated", () => {
    for (const rule of BUYER_FACING_BANNED_CELLS) {
      expect(rule.decree.length).toBeGreaterThan(20);
      expect(rule.decree).toContain("2026");
    }
  });

  test("stripBannedCells drops only the banned cells and preserves order", () => {
    const items: StatItem[] = [
      { label: "Beds", value: "3" },
      { label: "HOA/mo", value: "$225" },
      { label: "$/Sq Ft", value: "$323" },
    ];
    expect(stripBannedCells(items).map((s) => s.label)).toEqual(["Beds", "$/Sq Ft"]);
  });
});

describe("chrome backstop — a banned cell physically cannot render on a lifecycle email", () => {
  const chrome = (specs: StatItem[], middleStats?: StatItem[]) => ({
    ribbon: "New Listing",
    photo: null,
    heroValue: "$689,000",
    heroLabel: "12281 McGregor Palms Dr",
    specs,
    ...(middleStats
      ? {
          middle: [
            {
              block: {
                id: createBlock("stats").id,
                type: "stats" as const,
                props: { stats: middleStats },
              },
            },
          ],
        }
      : {}),
    ctaLabel: "See the Home",
  });

  test("FAILURE MODE: a recipe hands the chrome an HOA cell in the spec strip and it renders", () => {
    const doc = buildLifecycleEmail(
      { globalStyle: DEFAULT_GLOBAL_STYLE, blocks: [] },
      chrome([
        { label: "Beds", value: "3" },
        { label: "HOA/mo", value: "$225" },
      ]),
    );
    const labels = statLabels(doc);
    expect(labels).toContain("Beds");
    expect(labels).not.toContain("HOA/mo");
  });

  test("FAILURE MODE: a cost cell rides in through a recipe's own MIDDLE stats block", () => {
    const doc = buildLifecycleEmail(
      { globalStyle: DEFAULT_GLOBAL_STYLE, blocks: [] },
      chrome(
        [{ label: "Beds", value: "3" }],
        [
          { label: "Taxes/yr", value: "$4,100" },
          { label: "Built", value: "1988" },
        ],
      ),
    );
    const labels = statLabels(doc);
    expect(labels).not.toContain("Taxes/yr");
    expect(labels).toContain("Built");
  });

  test("FAILURE MODE: the policy empties a stats block and an empty box ships", () => {
    const doc = buildLifecycleEmail(
      { globalStyle: DEFAULT_GLOBAL_STYLE, blocks: [] },
      chrome([{ label: "HOA/mo", value: "$225" }]),
    );
    const emptyStats = doc.blocks.filter(
      (b) => b.type === "stats" && ((b.props as { stats?: StatItem[] }).stats ?? []).length === 0,
    );
    expect(emptyStats).toHaveLength(0);
  });
});

describe("fleet sweep — no exported spec builder emits a banned cell even when the fee is held", () => {
  test("open-house, under-contract, coming-soon, market-comps", () => {
    const strips: Record<string, StatItem[]> = {
      "open-house": openHouseSpecs(LOADED_FACTS),
      "under-contract": underContractSpecs(LOADED_FACTS),
      "coming-soon": teaserSpecs(LOADED_FACTS),
      "market-comps": compsSpecs(LOADED_FACTS, []),
    };
    for (const [recipe, items] of Object.entries(strips)) {
      for (const item of items) {
        expect(
          bannedCellRule(item.label),
          `${recipe} emits banned cell "${item.label}" — the ruling lives in cell-policy.ts, not in recipes`,
        ).toBeNull();
      }
    }
    // new-listing and back-on-market carry their own in-recipe no-HOA tests (08/18/2026,
    // commit 24d06a7f) and their files are claimed by a parallel session today — the chrome
    // backstop above covers them at render time regardless.
  });
});
