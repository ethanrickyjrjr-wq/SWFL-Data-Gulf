// lib/deliverable/recipes/cell-catalog.test.ts
//
// The catalog is where the HOA incident becomes structurally impossible: every
// catalog LABEL is checked clean against cell-policy at authoring level, BEFORE the
// chrome's render-time backstop. And every configured recipe may only reference
// keys that exist here — a typo'd cell key fails CI, not a reader.
import { describe, expect, test } from "bun:test";
import { bannedCellRule } from "@/lib/deliverable/cell-policy";
import { CELL_CATALOG, resolveCells } from "./cell-catalog";
import { CONFIGURED_RECIPES } from "./config";
import type { ListingFacts } from "@/lib/email/listing-scrape";

const FACTS = {
  beds: "3",
  baths: "2",
  sqft: "1450",
  price: "$399,000",
  lotSize: "0.19 ac",
  propertyType: "Single Family Residence",
  address: "326 Shore Dr, Fort Myers Beach, FL 33931",
  photos: [],
} as unknown as ListingFacts;

describe("CELL_CATALOG", () => {
  test("every catalog label is clean against cell-policy (a banned label cannot even be authored)", () => {
    for (const def of Object.values(CELL_CATALOG)) {
      expect(bannedCellRule(def.label)).toBeNull();
    }
  });

  test("resolveCells maps keys in order with the shared spec() shape", () => {
    const cells = resolveCells(["beds", "baths", "sqft", "price-per-sqft", "lot", "type"], FACTS);
    expect(cells.map((c) => c.label)).toEqual(["Beds", "Baths", "Sq Ft", "$/Sq Ft", "Lot", "Type"]);
    expect(cells[0].value).toBe("3");
    expect(cells[2].value).toBe("1,450");
    expect(cells[4].value).toBe("0.19 ac"); // the unit is ALREADY in the value — never appended
  });

  test("a missing fact is an OPEN SLOT (spec()'s empty value), never a zero", () => {
    const empty = resolveCells(["beds", "lot"], { photos: [] } as unknown as ListingFacts);
    expect(empty[0].value).toBe("");
    expect(empty[0].label).toBe("Beds");
  });

  test("no configured recipe references a key outside the catalog", () => {
    for (const { key, config } of CONFIGURED_RECIPES()) {
      for (const k of config.specs) {
        expect(CELL_CATALOG[k], `${key} references unknown cell "${k}"`).toBeDefined();
      }
    }
  });
});
