// lib/social/listing-carousel.test.ts
//
// Every test is named after the failure mode it targets in
// _ASSISTANT/2026-08-03-social-carousel-apify-HANDOFF.md §5 (RULE 3.5 TDD gate),
// mirrored into docs/superpowers/specs/2026-08-03-social-photo-carousel-design.md.
//
// The two fixture values that actually bite are VERBATIM from Apify run
// lxiDH7wcIbMRIGwWK (08/03/2026, 2601 SW 37th Ter, Cape Coral):
// `half_baths: "<NA>"` and a DUPLICATED url inside `alt_photos`. Photo urls
// themselves are synthetic — the shape is what matters, not the CDN path.

import { describe, test, expect } from "bun:test";
import {
  MAX_CAROUSEL_PHOTOS,
  CAPTION_GRAPHEME_CAP,
  parsePhotoList,
  selectCarouselPhotos,
  formatBaths,
  formatSpecs,
  buildCarouselCards,
  buildCarouselCaption,
  type ListingRecord,
} from "./listing-carousel";
import { graphemeCount } from "./post-now-validate";

const P = (n: number) => `https://ap.rdcpix.com/photo-${n}.webp?w=1080&q=75`;

const SUBJECT: ListingRecord = {
  street: "2601 SW 37th Ter",
  city: "Cape Coral",
  state: "FL",
  zip_code: "33914",
  status: "FOR_SALE",
  list_price: 385000,
  beds: 3,
  full_baths: 2,
  half_baths: "<NA>",
  sqft: 1983,
  year_built: 1992,
  price_per_sqft: 194,
  property_url: "https://www.realtor.com/realestateandhomes-detail/2601-SW-37th-Ter_M54462-18886",
  primary_photo: P(1),
  alt_photos: [P(1), P(2), P(3), P(4), P(4), P(5), P(6)].join(", "),
};

// ── F-CAP · >4 images is a HARD ERROR from postToBluesky. Never reach it. ──────
describe("F-CAP · the lexicon's 4-image ceiling is enforced BEFORE the adapter", () => {
  test("a 40-photo gallery yields exactly 4 cards, never 40", () => {
    const many = Array.from({ length: 40 }, (_, i) => P(i)).join(", ");
    expect(selectCarouselPhotos({ ...SUBJECT, alt_photos: many })).toHaveLength(4);
    expect(buildCarouselCards({ ...SUBJECT, alt_photos: many })).toHaveLength(MAX_CAROUSEL_PHOTOS);
  });

  test("MAX_CAROUSEL_PHOTOS is the lexicon cap — 4, not a number someone liked", () => {
    expect(MAX_CAROUSEL_PHOTOS).toBe(4);
  });

  test("a duplicate url in the vendor gallery never burns a slot twice", () => {
    // The real record repeats one url. Four DISTINCT photos, or the carousel
    // shows the same room twice and reads as broken.
    const picked = selectCarouselPhotos(SUBJECT);
    expect(new Set(picked).size).toBe(picked.length);
  });

  test("the cover slide is the primary photo — exterior first, per the handoff", () => {
    expect(selectCarouselPhotos(SUBJECT)[0]).toBe(P(1));
    expect(buildCarouselCards(SUBJECT)[0].role).toBe("cover");
  });

  test("slides after the cover are interior variety, not the cover repeated", () => {
    const cards = buildCarouselCards(SUBJECT);
    expect(cards.slice(1).every((c) => c.role === "interior")).toBe(true);
    expect(cards.map((c) => c.photoUrl)).toEqual([P(1), P(2), P(3), P(4)]);
  });
});

// ── F-EMPTY · 2 of 5 store actors tested were junk. Empty is NORMAL. ──────────
describe("F-EMPTY · an empty/garbage run aborts the post, never publishes a blank card", () => {
  test("no photos at all → zero cards (the caller aborts; it does not post)", () => {
    expect(buildCarouselCards({ ...SUBJECT, primary_photo: null, alt_photos: null })).toEqual([]);
  });

  test("<NA> and empty-string galleries are not photos", () => {
    expect(parsePhotoList("<NA>")).toEqual([]);
    expect(parsePhotoList("")).toEqual([]);
    expect(parsePhotoList(null)).toEqual([]);
    expect(parsePhotoList(undefined)).toEqual([]);
  });

  test("non-http junk never reaches an image fetch", () => {
    expect(parsePhotoList(`javascript:alert(1), ${P(9)}`)).toEqual([P(9)]);
  });

  test("an array-shaped gallery still works (vendor shape drift is not a crash)", () => {
    expect(parsePhotoList([P(1), P(2)])).toEqual([P(1), P(2)]);
  });

  test("a totally empty record yields no cards and does not throw", () => {
    expect(buildCarouselCards({})).toEqual([]);
  });
});

// ── F-SPEC · a wrong spec BURNED INTO A PUBLIC IMAGE is the irreversible one. ──
describe("F-SPEC · deterministic specs, and a missing field is OMITTED not zeroed", () => {
  test("half_baths '<NA>' is null — never '2.0 ba', never '2.5 ba'", () => {
    expect(formatBaths(2, "<NA>")).toBe("2 ba");
  });

  test("a real half bath composes deterministically to 2.5", () => {
    expect(formatBaths(2, 1)).toBe("2.5 ba");
  });

  test("no bath data at all omits the element rather than rendering 0", () => {
    expect(formatBaths(null, null)).toBeNull();
    expect(formatBaths("<NA>", "<NA>")).toBeNull();
  });

  test("the spec strip never contains a placeholder literal", () => {
    const specs = formatSpecs(SUBJECT).join(" ");
    for (const bad of ["<NA>", "N/A", "undefined", "null", "NaN"]) {
      expect(specs).not.toContain(bad);
    }
  });

  test("specs trace verbatim to the record's real fields", () => {
    expect(formatSpecs(SUBJECT)).toEqual(["3 bd", "2 ba", "1,983 sqft", "Built 1992"]);
  });

  test("a record missing sqft drops that chip instead of printing '0 sqft'", () => {
    const specs = formatSpecs({ ...SUBJECT, sqft: null });
    expect(specs.some((s) => s.includes("sqft"))).toBe(false);
    expect(specs).toContain("3 bd");
  });

  test("price renders as real currency, and is absent when the price is", () => {
    expect(buildCarouselCards(SUBJECT)[0].price).toBe("$385,000");
    expect(buildCarouselCards({ ...SUBJECT, list_price: null })[0].price).toBeUndefined();
  });

  test("every card carries the address — the operator asked for it ON the card", () => {
    for (const card of buildCarouselCards(SUBJECT)) {
      expect(card.address).toBe("2601 SW 37th Ter");
      expect(card.locality).toBe("Cape Coral, FL 33914");
    }
  });

  test("alt text describes the real home, so the post is accessible", () => {
    const [cover] = buildCarouselCards(SUBJECT);
    expect(cover.alt).toContain("2601 SW 37th Ter");
    expect(cover.alt).toContain("Cape Coral");
  });
});

// ── F-EMBED · the link rides in TEXT so the images embed stays the only embed. ─
describe("F-EMBED · the realtor.com link lives in the caption, never as an embed", () => {
  test("the caption carries the property_url verbatim (detectLinkFacets picks it up)", () => {
    expect(buildCarouselCaption(SUBJECT)).toContain(SUBJECT.property_url!);
  });

  test("the caption fits Bluesky's 300-grapheme cap with the url included", () => {
    expect(graphemeCount(buildCarouselCaption(SUBJECT))).toBeLessThanOrEqual(CAPTION_GRAPHEME_CAP);
  });

  test("a very long address/city still yields a caption under the cap", () => {
    const caption = buildCarouselCaption({
      ...SUBJECT,
      street: "12345 Southwest Extraordinarily Long Boulevard Circle Terrace",
      city: "Saint James City By The Bay",
    });
    expect(graphemeCount(caption)).toBeLessThanOrEqual(CAPTION_GRAPHEME_CAP);
    expect(caption).toContain(SUBJECT.property_url!);
  });

  test("no url in the record → caption still valid, just no link", () => {
    const caption = buildCarouselCaption({ ...SUBJECT, property_url: null });
    expect(graphemeCount(caption)).toBeLessThanOrEqual(CAPTION_GRAPHEME_CAP);
    expect(caption).toContain("2601 SW 37th Ter");
  });

  test("the caption states no number that is not in the record", () => {
    const caption = buildCarouselCaption(SUBJECT);
    const numbers = caption.match(/\d[\d,]*/g) ?? [];
    const allowed = new Set([
      "385,000",
      "3",
      "2",
      "1,983",
      "1992",
      "2601",
      "37",
      "33914",
      "54462",
      "18886",
    ]);
    for (const n of numbers) expect(allowed.has(n)).toBe(true);
  });
});
