// lib/social-pulse/digest.test.ts
import { test, expect } from "bun:test";
import { computeDigest, medianOf, quantileOf, isoWeekOf } from "./digest";

const p = (
  id: string,
  area: string,
  likes: number | null,
  mediaType = 1,
  caption: string | null = null,
) => ({
  post_id: id,
  shortcode: id,
  permalink: `https://www.instagram.com/p/${id}/`,
  username: "u",
  is_verified: false,
  taken_at: null,
  media_type: mediaType,
  product_type: null,
  caption,
  like_count: likes,
  comment_count: 1,
  view_count: null,
  reshare_count: null,
  matched_term: "t",
  area,
});

test("median and quantile use nearest-rank and tolerate empty input", () => {
  expect(medianOf([1, 2, 3, 4])).toBe(2);
  expect(medianOf([5])).toBe(5);
  expect(medianOf([])).toBe(0);
  expect(quantileOf([10, 20, 30, 40], 0.75)).toBe(30);
});

test("isoWeekOf pins the ISO week", () => {
  expect(isoWeekOf(new Date("2026-07-05T12:00:00Z"))).toBe("2026-W27");
});

test("computeDigest: benchmarks per area + swfl-wide, format split, top posts, hashtag deltas", () => {
  const digest = computeDigest({
    scanId: 7,
    asOf: "07/05/2026",
    week: "2026-W27",
    posts: [
      p("a", "cape-coral", 100, 1, "gulf access canal home"),
      p("b", "cape-coral", 300, 2),
      p("c", "naples", 50, 8),
      p("d", "naples", null), // null likes excluded from math
    ],
    hashtags: [{ name: "capecoral", media_count: 1100 }],
    prevHashtags: [{ name: "capecoral", media_count: 1000 }],
  });
  const swfl = digest.benchmarks.find((b) => b.area === "swfl")!;
  expect(swfl.postCount).toBe(3);
  expect(swfl.medianLikes).toBe(100);
  const cc = digest.benchmarks.find((b) => b.area === "cape-coral")!;
  expect(cc.topQuartileLikes).toBe(300);
  expect(digest.formats.find((f) => f.format === "video")!.medianLikes).toBe(300);
  expect(digest.topPosts.filter((t) => t.area === "cape-coral")[0].likeCount).toBe(300);
  expect(digest.hashtags[0].deltaFromPrev).toBe(100);
  expect(digest.topics.find((t) => t.topic === "waterfront")!.postCount).toBe(1);
});
