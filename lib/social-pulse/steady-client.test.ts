// lib/social-pulse/steady-client.test.ts
import { test, expect } from "bun:test";
import { searchPosts, searchHashtags } from "./steady-client";

const OK_SEARCH = {
  meta: { version: "v1.0", status: 200, pagination_token: "tok-abc" },
  body: [
    {
      id: "3744744884516299440",
      shortcode: "DP4AaHIDiKw",
      media_type: 1,
      product_type: "feed",
      taken_at: 1760628398,
      caption: "casting call",
      like_count: 56129,
      comment_count: 2644,
      view_count: null,
      permalink: "https://www.instagram.com/p/DP4AaHIDiKw/",
      user: { id: "56844315148", username: "mrbeastcasting", is_verified: true },
    },
  ],
};

function mockFetch(status: number, json?: unknown): typeof fetch {
  return (async () =>
    new Response(json === undefined ? "" : JSON.stringify(json), { status })) as typeof fetch;
}

test("searchPosts normalizes a vendor body and surfaces the pagination token", async () => {
  process.env.PHOTOS_API = "test-key";
  const { posts, paginationToken } = await searchPosts("capecoral", undefined, {
    fetchFn: mockFetch(200, OK_SEARCH),
  });
  expect(paginationToken).toBe("tok-abc");
  expect(posts).toHaveLength(1);
  expect(posts[0]).toMatchObject({
    postId: "3744744884516299440",
    shortcode: "DP4AaHIDiKw",
    permalink: "https://www.instagram.com/p/DP4AaHIDiKw/",
    username: "mrbeastcasting",
    isVerified: true,
    likeCount: 56129,
    mediaType: 1,
  });
  expect(posts[0].takenAt).toBe(new Date(1760628398 * 1000).toISOString());
});

test("empty-tolerant: non-200, bad body, and missing key all yield empty results", async () => {
  process.env.PHOTOS_API = "test-key";
  expect((await searchPosts("x", undefined, { fetchFn: mockFetch(429) })).posts).toEqual([]);
  expect(
    (await searchPosts("x", undefined, { fetchFn: mockFetch(200, { nope: 1 }) })).posts,
  ).toEqual([]);
  delete process.env.PHOTOS_API;
  expect((await searchPosts("x")).posts).toEqual([]);
  expect(await searchHashtags("x")).toEqual([]);
});

test("searchHashtags maps name + media_count", async () => {
  process.env.PHOTOS_API = "test-key";
  const tags = await searchHashtags("investing", {
    fetchFn: mockFetch(200, {
      meta: { status: 200 },
      body: [{ id: 1, name: "investingtips", media_count: 1826347, formatted_media_count: "1.8M" }],
    }),
  });
  expect(tags).toEqual([
    { name: "investingtips", mediaCount: 1826347, formattedMediaCount: "1.8M" },
  ]);
});
