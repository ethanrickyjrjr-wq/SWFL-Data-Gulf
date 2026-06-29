import { test, expect } from "bun:test";
import { mergeFacts, htmlToText, parseLlmFacts } from "./listing-scrape";
import type { ListingFacts } from "./listing-scrape";

test("mergeFacts: primary wins per field, secondary fills gaps, photos union", () => {
  const a: ListingFacts = { price: "$1", beds: "3", photos: ["p1"], sourceUrl: "u" };
  const b: ListingFacts = {
    price: "$2",
    baths: "2",
    sqft: "1000",
    photos: ["p2", "p1"],
    sourceUrl: "u2",
  };
  const m = mergeFacts(a, b);
  expect(m.price).toBe("$1"); // primary (deterministic) wins on conflict
  expect(m.beds).toBe("3");
  expect(m.baths).toBe("2"); // gap filled from secondary
  expect(m.sqft).toBe("1000");
  expect(m.photos).toEqual(["p1", "p2"]); // union, primary first, deduped
  expect(m.sourceUrl).toBe("u"); // primary's citation
});

test("htmlToText strips scripts/styles/tags but keeps visible prose", () => {
  const t = htmlToText(
    "<html><head><style>.x{color:red}</style></head><body><h1>Title</h1><script>var junk=1</script><p>There are homes with views.</p></body></html>",
  );
  expect(t).toContain("Title");
  expect(t).toContain("There are homes with views.");
  expect(t).not.toContain("junk");
  expect(t).not.toContain("color:red");
});

test("parseLlmFacts keeps known fields, coerces to strings, ignores junk", () => {
  const json = `{"price":"$2,500,000","beds":4,"baths":3,"sqft":2800,"city":"Naples","state":"FL","remarks":"Lovely home","junk":"x"}`;
  const f = parseLlmFacts(json, "u");
  expect(f.price).toBe("$2,500,000");
  expect(f.beds).toBe("4");
  expect(f.baths).toBe("3");
  expect(f.sqft).toBe("2800");
  expect(f.city).toBe("Naples");
  expect(f.remarks).toBe("Lovely home");
  expect((f as Record<string, unknown>).junk).toBeUndefined();
  expect(f.sourceUrl).toBe("u");
});

test("parseLlmFacts returns empty facts on non-JSON (never throws)", () => {
  const f = parseLlmFacts("the model said no", "u");
  expect(f.price).toBeUndefined();
  expect(f.photos).toEqual([]);
  expect(f.sourceUrl).toBe("u");
});
