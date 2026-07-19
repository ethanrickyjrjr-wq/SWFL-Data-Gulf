import { describe, expect, it } from "bun:test";
import {
  parseCitedSpans,
  valueAppearsInCitations,
  valueAppearsInText,
  fillExternalPoint,
  parseBlockedDomains,
  type CitedSpan,
} from "./gap-fill";

describe("valueAppearsInText — shared verbatim-digit moat check", () => {
  const doc = "Our Q2 absorption came in at 42,000 sqft and Tampa office vacancy is 13.5%.";
  it("matches a value present verbatim (ignoring separators/symbols)", () => {
    expect(valueAppearsInText(13.5, doc)).toBe(true);
    expect(valueAppearsInText(42000, doc)).toBe(true); // "42,000" → digits "42000"
  });
  it("rejects a value not in the text and trivially-short numbers", () => {
    expect(valueAppearsInText(99, doc)).toBe(false);
    expect(valueAppearsInText(5, doc)).toBe(false); // "13.5%" is not a 5
  });
  it("single digit: verifies only as a figure ($-prefixed / %-suffixed), numerically", () => {
    expect(valueAppearsInText(5, "cap rates held at 5.0% this quarter")).toBe(true);
    expect(valueAppearsInText(5, "listed at $5 per sqft NNN")).toBe(true);
    expect(valueAppearsInText(5, "rents rose 5 percent year over year")).toBe(true);
    // Incidental standalone digits are NOT verification evidence.
    expect(valueAppearsInText(5, "see Page 5 of the appendix")).toBe(false);
    expect(valueAppearsInText(5, "updated July 5, 2026")).toBe(false);
    expect(valueAppearsInText(5, "unit 5 of 12 sold")).toBe(false);
    // Numeric comparison, not digit comparison.
    expect(valueAppearsInText(5, "grew 5.5% yoy")).toBe(false);
    expect(valueAppearsInText(5, "a $50 fee")).toBe(false);
  });
});

describe("parseBlockedDomains — self-heal around vendor crawler blocks", () => {
  it("extracts the blocked domains named in a 400 message", () => {
    const msg =
      "The following domains are not accessible to our user agent: ['realtor.com', 'naplesnews.com']. Read more...";
    expect(parseBlockedDomains(msg)).toEqual(["realtor.com", "naplesnews.com"]);
  });
  it("returns [] for an unrelated error", () => {
    expect(parseBlockedDomains("rate limited")).toEqual([]);
  });
});

describe("parseCitedSpans", () => {
  it("pulls {url, cited_text} from text-block citations", () => {
    const content = [
      {
        type: "text",
        text: "Office rents hit $30.88/sqft.",
        citations: [
          { url: "https://gulfshorebusiness.com/x", cited_text: "asking rents reached $30.88 per square foot" }, // prettier-ignore
        ],
      },
    ];
    const { spans, searchError } = parseCitedSpans(content);
    expect(searchError).toBeNull();
    expect(spans).toEqual([
      { url: "https://gulfshorebusiness.com/x", cited_text: "asking rents reached $30.88 per square foot" }, // prettier-ignore
    ]);
  });

  it("detects a web_search_tool_result_error (HTTP 200 body)", () => {
    const content = [
      { type: "web_search_tool_result", content: { type: "web_search_tool_result_error", error_code: "too_many_requests" } }, // prettier-ignore
    ];
    const { spans, searchError } = parseCitedSpans(content);
    expect(spans).toEqual([]);
    expect(searchError).toBe("too_many_requests");
  });
});

describe("valueAppearsInCitations — THE MOAT for gap-filled numbers", () => {
  const spans: CitedSpan[] = [
    { url: "https://gulfshorebusiness.com/x", cited_text: "asking rents reached $30.88 per square foot, a 31% increase" }, // prettier-ignore
  ];

  it("accepts a value whose digits appear verbatim in a cited span", () => {
    expect(valueAppearsInCitations(30.88, spans)?.url).toBe("https://gulfshorebusiness.com/x");
    expect(valueAppearsInCitations(31, spans)).not.toBeNull(); // "31%"
  });

  it("REJECTS a value that is NOT in any cited span (no fabrication)", () => {
    // 42.5 never appears in the fetched bytes → dropped, even if the model 'said' it.
    expect(valueAppearsInCitations(42.5, spans)).toBeNull();
  });

  it("rejects trivially-short numbers that could match incidentally", () => {
    expect(valueAppearsInCitations(3, spans)).toBeNull(); // <2 digits → not gap-fillable
  });
});

describe("fillExternalPoint — end to end with an injected search", () => {
  const goodContent = [
    {
      type: "text",
      text: "Tampa office vacancy is elevated.\nANSWER: 18.4%",
      citations: [{ url: "https://colliers.com/tampa", cited_text: "Tampa office vacancy stood at 18.4% in Q1" }], // prettier-ignore
    },
  ];

  it("returns a verified point when the model's value is in the citations", async () => {
    const point = await fillExternalPoint(
      { label: "Tampa office vacancy", search_query: "Tampa office vacancy rate 2026" },
      { search: async () => goodContent },
    );
    expect(point).toEqual({
      label: "Tampa office vacancy",
      value: 18.4,
      url: "https://colliers.com/tampa",
      cited_text: "Tampa office vacancy stood at 18.4% in Q1",
    });
  });

  it("drops the point when the stated value is NOT cited (fabrication guard)", async () => {
    const fabricated = [
      {
        type: "text",
        text: "ANSWER: 9.9%",
        citations: [{ url: "https://colliers.com/tampa", cited_text: "Tampa office vacancy stood at 18.4% in Q1" }], // prettier-ignore
      },
    ];
    expect(
      await fillExternalPoint(
        { label: "Tampa office vacancy", search_query: "x" },
        { search: async () => fabricated },
      ),
    ).toBeNull();
  });

  it("drops the point when the model answers UNKNOWN", async () => {
    const unknown = [{ type: "text", text: "ANSWER: UNKNOWN", citations: [{ url: "https://x.gov", cited_text: "no figure" }] }]; // prettier-ignore
    expect(
      await fillExternalPoint({ label: "x", search_query: "y" }, { search: async () => unknown }),
    ).toBeNull();
  });

  it("never throws when the search call fails", async () => {
    expect(
      await fillExternalPoint(
        { label: "x", search_query: "y" },
        {
          search: async () => {
            throw new Error("network down");
          },
        },
      ),
    ).toBeNull();
  });
});
