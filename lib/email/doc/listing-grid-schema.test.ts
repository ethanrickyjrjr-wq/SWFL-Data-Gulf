import { describe, expect, test } from "bun:test";
import { EmailDocSchema } from "./schema";
import { createBlock, DEFAULT_GLOBAL_STYLE } from "./default-docs";

const card = {
  photoUrl: "https://ap.rdcpix.com/abc/x.jpg",
  linkUrl: "https://www.realtor.com/realestateandhomes-detail/1442-Byron-Rd_Fort-Myers_FL_33919_M1",
  price: "$259,900",
  addressLine1: "1442 Byron Rd",
  addressLine2: "Fort Myers, FL 33919",
};

/** Validate ONE listing-grid block through the real exported surface. `BlockSchema`
 *  is module-internal on purpose, so a block-level test goes through the doc the app
 *  actually validates — never through an export widened just for a test. */
const parseGrid = (props: unknown) =>
  EmailDocSchema.safeParse({
    globalStyle: DEFAULT_GLOBAL_STYLE,
    blocks: [{ id: "b1", type: "listing-grid", props }],
  });

describe("listing-grid schema", () => {
  test("accepts a real 4-card grid", () => {
    expect(
      parseGrid({
        title: "New construction homes",
        subtitle: "Fort Myers",
        cards: [card, card, card, card],
      }).success,
    ).toBe(true);
  });

  test("accepts an EMPTY grid — a palette-added block is an open slot, not a hollow card", () => {
    expect(parseGrid({ cards: [] }).success).toBe(true);
  });

  test("rejects more than 6 cards", () => {
    expect(parseGrid({ cards: [card, card, card, card, card, card, card] }).success).toBe(false);
  });

  test("rejects a card with no photoUrl — a dead card must never validate", () => {
    const { photoUrl: _drop, ...noPhoto } = card;
    expect(parseGrid({ cards: [noPhoto] }).success).toBe(false);
  });

  test("rejects a card with no linkUrl", () => {
    const { linkUrl: _drop, ...noLink } = card;
    expect(parseGrid({ cards: [noLink] }).success).toBe(false);
  });

  test("createBlock mints an empty grid", () => {
    const block = createBlock("listing-grid");
    expect(block.type).toBe("listing-grid");
    expect((block.props as { cards: unknown[] }).cards).toEqual([]);
  });
});
