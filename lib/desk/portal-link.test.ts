import { describe, expect, test } from "bun:test";
import { zillowAddressUrl } from "./portal-link";

describe("zillowAddressUrl", () => {
  test("round-trips the live-verified address (no ZIP)", () => {
    expect(zillowAddressUrl("4836 SW 29th Ave", "Cape Coral")).toBe(
      "https://www.zillow.com/homes/4836-SW-29th-Ave-Cape-Coral,-FL_rb/",
    );
  });

  test("appends a 5-digit ZIP when held (live-verified form)", () => {
    expect(zillowAddressUrl("4836 SW 29th Ave", "Cape Coral", "33914")).toBe(
      "https://www.zillow.com/homes/4836-SW-29th-Ave-Cape-Coral,-FL-33914_rb/",
    );
  });

  test("strips unit punctuation — a literal # would truncate the URL path", () => {
    expect(zillowAddressUrl("605 Galleon Dr #B", "Naples")).toBe(
      "https://www.zillow.com/homes/605-Galleon-Dr-B-Naples,-FL_rb/",
    );
  });

  test("collapses whitespace runs and trims", () => {
    expect(zillowAddressUrl("  19794   Thsts ", "Naples")).toBe(
      "https://www.zillow.com/homes/19794-Thsts-Naples,-FL_rb/",
    );
  });

  test("multi-word city hyphenates", () => {
    expect(zillowAddressUrl("1337 Bradford Rd", "Fort Myers")).toBe(
      "https://www.zillow.com/homes/1337-Bradford-Rd-Fort-Myers,-FL_rb/",
    );
  });

  test("missing street or city -> undefined (row renders plain, like today)", () => {
    expect(zillowAddressUrl(null, "Naples")).toBeUndefined();
    expect(zillowAddressUrl("605 Galleon Dr", null)).toBeUndefined();
    expect(zillowAddressUrl(undefined, undefined)).toBeUndefined();
    expect(zillowAddressUrl("   ", "Naples")).toBeUndefined();
    expect(zillowAddressUrl("#", "Naples")).toBeUndefined();
  });

  test("malformed ZIP is ignored, not appended", () => {
    expect(zillowAddressUrl("605 Galleon Dr", "Naples", "339")).toBe(
      "https://www.zillow.com/homes/605-Galleon-Dr-Naples,-FL_rb/",
    );
  });
});
