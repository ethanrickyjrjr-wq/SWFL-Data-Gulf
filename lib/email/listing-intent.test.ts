import { test, expect } from "bun:test";
import { isListingIntent } from "./listing-intent";

const HICKORY =
  "https://www.beach-homes.com/florida/bonita-springs/27804-hickory-blvd-bonita-springs-fl-34134-lhrmls-03646837";

test("true: 'just got this listing… describe it' with a URL (the real prompt)", () => {
  expect(
    isListingIntent(
      `JUST GOT THIS LISTING. BUILD ME AN EMAIL FOR MY CLIENTS DESCRIBING IT AND SHOW A CHART OF SIMILAR HOME SALE PRICES ${HICKORY}`,
    ),
  ).toBe(true);
});

test("true: 'feature this property' with a URL", () => {
  expect(isListingIntent("feature this property for my buyers https://site.com/listing/123")).toBe(
    true,
  );
});

test("false: a market newsletter ask, even with a brand URL", () => {
  expect(
    isListingIntent("Build my monthly market update on home prices https://mygulfrealty.com"),
  ).toBe(false);
});

test("false: listing words but NO url (no specific page to scrape)", () => {
  expect(isListingIntent("write something about this listing")).toBe(false);
});
