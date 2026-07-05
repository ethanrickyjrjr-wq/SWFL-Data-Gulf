import { describe, expect, test } from "bun:test";
import { buildSuggestUrl, buildRetrieveUrl, parseSuggestions, parseRetrieve } from "./search-box";

describe("buildSuggestUrl", () => {
  test("hits /suggest with q, session_token, US filter, and the type list", () => {
    const url = new URL(buildSuggestUrl("123 Main St", "sess-1", "tok"));
    expect(url.origin + url.pathname).toBe("https://api.mapbox.com/search/searchbox/v1/suggest");
    expect(url.searchParams.get("q")).toBe("123 Main St");
    expect(url.searchParams.get("session_token")).toBe("sess-1");
    expect(url.searchParams.get("access_token")).toBe("tok");
    expect(url.searchParams.get("country")).toBe("US");
    expect(url.searchParams.get("types")).toBe("address,postcode,place,locality,neighborhood");
    expect(url.searchParams.get("limit")).toBe("6");
  });

  test("caps q at the API's 256-char limit", () => {
    const url = new URL(buildSuggestUrl("x".repeat(300), "s", "t"));
    expect(url.searchParams.get("q")!.length).toBe(256);
  });
});

describe("buildRetrieveUrl", () => {
  test("hits /retrieve/{id} with the SAME session token", () => {
    const url = new URL(buildRetrieveUrl("abc123", "sess-1", "tok"));
    expect(url.pathname).toBe("/search/searchbox/v1/retrieve/abc123");
    expect(url.searchParams.get("session_token")).toBe("sess-1");
    expect(url.searchParams.get("access_token")).toBe("tok");
  });
});

describe("parseSuggestions", () => {
  test("maps suggestions to id/name/placeFormatted, skipping malformed rows", () => {
    const out = parseSuggestions({
      suggestions: [
        {
          mapbox_id: "id1",
          name: "123 Main St",
          place_formatted: "Cape Coral, Florida 33904, United States",
        },
        { name: "no-id row" },
      ],
    });
    expect(out).toEqual([
      {
        mapboxId: "id1",
        name: "123 Main St",
        placeFormatted: "Cape Coral, Florida 33904, United States",
      },
    ]);
  });

  test("empty/garbage input → []", () => {
    expect(parseSuggestions(null)).toEqual([]);
    expect(parseSuggestions({})).toEqual([]);
    expect(parseSuggestions({ suggestions: "nope" })).toEqual([]);
  });
});

describe("parseRetrieve", () => {
  test("pulls full_address + postcode from the feature's context", () => {
    const out = parseRetrieve({
      features: [
        {
          properties: {
            name: "123 Main St",
            full_address: "123 Main St, Cape Coral, Florida 33904, United States",
            context: { postcode: { name: "33904" } },
          },
        },
      ],
    });
    expect(out).toEqual({
      name: "123 Main St, Cape Coral, Florida 33904, United States",
      zip: "33904",
    });
  });

  test("no postcode (city pick) → zip null; no feature → null", () => {
    expect(
      parseRetrieve({ features: [{ properties: { name: "Cape Coral", context: {} } }] }),
    ).toEqual({
      name: "Cape Coral",
      zip: null,
    });
    expect(parseRetrieve({ features: [] })).toBeNull();
    expect(parseRetrieve(null)).toBeNull();
  });

  test("ZIP+4 postcode truncates to 5", () => {
    const out = parseRetrieve({
      features: [{ properties: { name: "x", context: { postcode: { name: "33904-1234" } } } }],
    });
    expect(out?.zip).toBe("33904");
  });
});
