// Pexels client contracts — response mapping + empty-tolerance. The live API
// call is operator-verified (no paid/live calls in tests; keyless → []).
import { test, expect, describe, afterEach } from "bun:test";
import { mapPexelsResponse, searchPexels, type PexelsPhoto } from "./pexels";

// Shape verified against the live Pexels API docs (pexels.com/api, fetched via
// crawl4ai 07/02/2026 during the spec's research pass).
const FIXTURE = {
  page: 1,
  per_page: 2,
  photos: [
    {
      id: 2880507,
      width: 4000,
      height: 6000,
      url: "https://www.pexels.com/photo/2880507/",
      photographer: "Deden Dicky Ramdhani",
      photographer_url: "https://www.pexels.com/@drdeden88",
      alt: "Brown wooden house near body of water",
      src: {
        original: "https://images.pexels.com/photos/2880507/x.jpg",
        large2x:
          "https://images.pexels.com/photos/2880507/x.jpg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
        large: "https://images.pexels.com/photos/2880507/x.jpg?auto=compress&h=650",
      },
    },
  ],
};

describe("mapPexelsResponse", () => {
  test("normalizes photos — large2x preferred, attribution carried", () => {
    const photos = mapPexelsResponse(FIXTURE);
    expect(photos.length).toBe(1);
    const p: PexelsPhoto = photos[0];
    expect(p.url).toContain("dpr=2"); // large2x (retina) preferred
    expect(p.width).toBe(4000);
    expect(p.alt).toBe("Brown wooden house near body of water");
    expect(p.photographer).toBe("Deden Dicky Ramdhani");
    expect(p.pexelsUrl).toBe("https://www.pexels.com/photo/2880507/");
  });

  test("garbage shapes map to [] (never throws)", () => {
    expect(mapPexelsResponse(null)).toEqual([]);
    expect(mapPexelsResponse({})).toEqual([]);
    expect(mapPexelsResponse({ photos: [{}] })).toEqual([]); // no src.url → dropped
  });
});

describe("searchPexels — empty-tolerant", () => {
  const saved = process.env.PEXELS_API_KEY;
  afterEach(() => {
    if (saved === undefined) delete process.env.PEXELS_API_KEY;
    else process.env.PEXELS_API_KEY = saved;
  });

  test("no key configured → [] without any network call", async () => {
    delete process.env.PEXELS_API_KEY;
    expect(await searchPexels("waterfront home")).toEqual([]);
  });

  test("blank query → []", async () => {
    process.env.PEXELS_API_KEY = "test-key";
    expect(await searchPexels("   ")).toEqual([]);
  });
});
