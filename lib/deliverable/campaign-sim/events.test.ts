// lib/deliverable/campaign-sim/events.test.ts
//
// The ONE piece of deterministic logic in the campaign simulator: the event
// journal → ListingFacts reducer. Everything else in the sim is I/O (resolve,
// build, render, send); this is the part that can be wrong in silence.
//
// The named failure mode these tests exist for (spec §Failure modes #5):
// `ListingFacts.priceReduction` is the SIZE OF THE CUT, not the previous price.
// price-reduced.ts derives previous = current + cut. Feed it a previous price in
// that field and the email announces a "reduction" to a number ABOVE the ask —
// a lie about someone's house, rendered in 48px accent type.

import { describe, expect, test } from "bun:test";
import { applyEventsToFacts, closeInForce, type CampaignEvent } from "./events";
import type { ListingFacts } from "@/lib/email/listing-scrape";

const SUBJECT: ListingFacts = {
  address: "8348 Southwindbay Cir, Fort Myers, FL 33908",
  city: "Fort Myers",
  state: "FL",
  zip: "33908",
  price: "$659,000",
  beds: "3",
  baths: "2",
  sqft: "1978",
  photos: ["https://example.test/photo.jpg"],
  sourceUrl: "https://www.swfldatagulf.com",
};

const CUT: CampaignEvent = { kind: "price-cut", fromStage: 4, cutUsd: 24_000 };
const SOLD: CampaignEvent = {
  kind: "sold",
  fromStage: 6,
  closeUsd: 628_500,
  closedOn: "2026-07-20",
};
const JOURNAL = [CUT, SOLD];

const digits = (s?: string): number => Number((s ?? "").replace(/[^\d.]/g, ""));

describe("applyEventsToFacts", () => {
  test("leaves facts untouched before the cut stage", () => {
    const out = applyEventsToFacts(SUBJECT, JOURNAL, 0);
    expect(out.price).toBe("$659,000");
    expect(out.isPriceReduced).toBeUndefined();
    expect(out.priceReduction).toBeUndefined();
  });

  test("still untouched on the stage immediately before the cut", () => {
    const out = applyEventsToFacts(SUBJECT, JOURNAL, 3);
    expect(out.isPriceReduced).toBeUndefined();
  });

  test("priceReduction carries the CUT SIZE, never the previous price", () => {
    const out = applyEventsToFacts(SUBJECT, JOURNAL, 4);
    // The trap: $683,000 (the old ask) in this field would render
    // "Price cut $683,000" over a $635,000 house.
    expect(out.priceReduction).toBe("$24,000");
    expect(out.price).toBe("$635,000");
    expect(out.isPriceReduced).toBe(true);
  });

  test("previous = current + cut holds, so the rendered anchor beats the ask", () => {
    const out = applyEventsToFacts(SUBJECT, JOURNAL, 4);
    const previous = digits(out.price) + digits(out.priceReduction);
    expect(previous).toBe(digits(SUBJECT.price));
    expect(previous).toBeGreaterThan(digits(out.price));
  });

  test("does not double-cut on a later stage", () => {
    const out = applyEventsToFacts(SUBJECT, JOURNAL, 6);
    expect(out.price).toBe("$635,000");
    expect(out.priceReduction).toBe("$24,000");
  });

  test("a listing with no price gets no cut and no zero", () => {
    const priceless: ListingFacts = { ...SUBJECT, price: undefined };
    const out = applyEventsToFacts(priceless, JOURNAL, 4);
    expect(out.price).toBeUndefined();
    expect(out.isPriceReduced).toBeUndefined();
    expect(out.priceReduction).toBeUndefined();
  });

  test("never mutates the facts it was handed", () => {
    const input = { ...SUBJECT };
    applyEventsToFacts(input, JOURNAL, 6);
    expect(input.price).toBe("$659,000");
    expect(input.isPriceReduced).toBeUndefined();
  });

  test("a cut larger than the price is refused, never a negative ask", () => {
    const absurd: CampaignEvent[] = [{ kind: "price-cut", fromStage: 0, cutUsd: 999_000 }];
    const out = applyEventsToFacts(SUBJECT, absurd, 0);
    expect(out.price).toBe("$659,000");
    expect(out.isPriceReduced).toBeUndefined();
  });
});

describe("closeInForce", () => {
  test("no close before the sold stage", () => {
    expect(closeInForce(JOURNAL, 5)).toBeNull();
  });

  test("the close lands on the sold stage, with its recorded date", () => {
    expect(closeInForce(JOURNAL, 6)).toEqual({ price: 628_500, date: "2026-07-20" });
  });

  test("no sold event in the journal means no close, ever", () => {
    expect(closeInForce([CUT], 6)).toBeNull();
  });
});
