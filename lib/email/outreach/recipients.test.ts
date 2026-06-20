import { describe, expect, test } from "bun:test";
import { normalizeEmail, buildRecipientRow } from "./recipients";
import type { ComposedMessage } from "./campaign";

const ready: ComposedMessage = {
  email: "  Owner@Acme.COM ",
  name: "Acme Realty",
  zip: "33931",
  domain: "acme.com",
  status: "ready",
  brandSource: "favicon",
  brandConfidence: 0.82,
  usedHouseBrand: false,
  primary: "#00aa77",
  arrivalUrl: "https://www.swfldatagulf.com/welcome?x=1",
  subject: "s",
  html: "<p>hi</p>",
};

describe("normalizeEmail", () => {
  test("trims + lowercases", () => {
    expect(normalizeEmail("  Owner@Acme.COM ")).toBe("owner@acme.com");
  });
});

describe("buildRecipientRow", () => {
  test("maps a ready scraped-brand message (email normalized)", () => {
    expect(buildRecipientRow("cold-outreach", ready)).toEqual({
      campaign_id: "cold-outreach",
      email: "owner@acme.com",
      name: "Acme Realty",
      domain: "acme.com",
      zip: "33931",
      brand: { primary: "#00aa77", used_house_brand: false },
      brand_source: "favicon",
      brand_confidence: 0.82,
      arrival_url: "https://www.swfldatagulf.com/welcome?x=1",
    });
  });

  test("house-brand / no primary → null brand jsonb", () => {
    const house: ComposedMessage = {
      ...ready,
      email: "x@y.com",
      usedHouseBrand: true,
      primary: null,
      brandSource: "house",
      brandConfidence: 0,
    };
    const row = buildRecipientRow("c", house);
    expect(row.brand).toBeNull();
    expect(row.brand_source).toBe("house");
    expect(row.email).toBe("x@y.com");
  });

  test("missing optional fields → null, not undefined", () => {
    const bare: ComposedMessage = {
      email: "a@b.com",
      status: "ready",
      brandSource: "house",
      brandConfidence: 0,
      usedHouseBrand: true,
      primary: null,
      arrivalUrl: "",
      subject: "s",
      html: "<p>x</p>",
    };
    const row = buildRecipientRow("c", bare);
    expect(row.name).toBeNull();
    expect(row.domain).toBeNull();
    expect(row.zip).toBeNull();
    expect(row.arrival_url).toBeNull();
  });
});
