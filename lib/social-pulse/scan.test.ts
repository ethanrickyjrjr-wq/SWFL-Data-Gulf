// lib/social-pulse/scan.test.ts
import { test, expect } from "bun:test";
import { runScan, type ScanRowWriter, type PostInsert, type HashtagInsert } from "./scan";
import type { PulseTerm } from "./terms";
import type { PulsePost } from "./types";

const post = (id: string, likes: number): PulsePost => ({
  postId: id,
  shortcode: `sc${id}`,
  permalink: `https://www.instagram.com/p/sc${id}/`,
  username: "u",
  isVerified: false,
  takenAt: null,
  mediaType: 1,
  productType: "feed",
  caption: null,
  likeCount: likes,
  commentCount: 0,
  viewCount: null,
  reshareCount: null,
});

function memWriter() {
  const posts: PostInsert[] = [];
  const hashtags: HashtagInsert[] = [];
  const writer: ScanRowWriter = {
    insertScan: async () => 7,
    finishScan: async () => {},
    insertPosts: async (rows) => void posts.push(...rows),
    insertHashtags: async (rows) => void hashtags.push(...rows),
  };
  return { writer, posts, hashtags };
}

const TERMS: PulseTerm[] = [
  { term: "capecoral", kind: "hashtag", area: "cape-coral" },
  { term: "naplesfl", kind: "hashtag", area: "naples" },
];

test("scans every term, pages up to pagesPerTerm, dedupes cross-term posts, counts requests", async () => {
  const { writer, posts, hashtags } = memWriter();
  const result = await runScan({
    terms: TERMS,
    // page 1 returns a token, page 2 returns none; naplesfl repeats post "a".
    searchPosts: async (term, tok) =>
      tok
        ? { posts: [post(`${term}-p2`, 5)], paginationToken: null }
        : { posts: [post("a", 10), post(`${term}-p1`, 9)], paginationToken: "t1" },
    searchHashtags: async (term) => [{ name: term, mediaCount: 100, formattedMediaCount: "100" }],
    writer,
    pagesPerTerm: 2,
  });
  expect(result.scanId).toBe(7);
  // post "a" kept once (first term wins its area)
  const ids = posts.map((p) => p.post_id);
  expect(ids.filter((i) => i === "a")).toHaveLength(1);
  expect(posts.find((p) => p.post_id === "a")!.area).toBe("cape-coral");
  expect(ids).toContain("capecoral-p1");
  expect(ids).toContain("naplesfl-p2");
  expect(hashtags).toHaveLength(2);
  // requests: 2 search pages × 2 terms (weight 2 each) + 2 hashtag lookups (weight 1) = 10
  expect(result.requests).toBe(10);
});

test("a term whose search returns empty never fails the run (empty-tolerant)", async () => {
  const { writer, posts } = memWriter();
  const result = await runScan({
    terms: TERMS,
    searchPosts: async () => ({ posts: [], paginationToken: null }),
    searchHashtags: async () => [],
    writer,
  });
  expect(result.posts).toBe(0);
  expect(posts).toHaveLength(0);
});
