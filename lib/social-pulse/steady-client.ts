// lib/social-pulse/steady-client.ts
//
// Instagram public-data client for the Social Pulse scan.
// Contract: docs/vendor-notes/INSTAGRAM-SOCIAL-STEADY.md (crawled 07/05/2026).
// Empty-tolerant: no key, non-200, quota, or malformed body → empty result, never throws.
// Pagination tokens expire in 15 min and pagination sessions cap at 20 req/15 min —
// callers keep walks short (scan uses ≤2 pages per term).
import type { PulsePost, PulseHashtag } from "./types";

const BASE = "https://api.steadyapi.com/v1/instagram";

// Cloudflare in front of the API blocks default UAs; browser-like headers work
// (same finding as lib/listings/steadyapi.ts, verified live 06/30).
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  Accept: "application/json",
  Origin: "https://steadyapi.com",
  Referer: "https://steadyapi.com/",
};

interface Deps {
  fetchFn?: typeof fetch;
}

async function getBody(url: string, deps?: Deps): Promise<unknown[] | null> {
  const key = process.env.PHOTOS_API;
  if (!key) return null;
  const fetchFn = deps?.fetchFn ?? fetch;
  try {
    const res = await fetchFn(url, {
      headers: { ...BROWSER_HEADERS, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { body?: unknown };
    return Array.isArray(json?.body) ? (json.body as unknown[]) : null;
  } catch {
    return null;
  }
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function str(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

function normalizePost(raw: Record<string, unknown>): PulsePost | null {
  const postId = raw.id == null ? "" : String(raw.id);
  const shortcode = str(raw.shortcode);
  if (!postId || !shortcode) return null;
  const user = (raw.user ?? {}) as Record<string, unknown>;
  const takenAt = num(raw.taken_at);
  return {
    postId,
    shortcode,
    permalink: str(raw.permalink) ?? `https://www.instagram.com/p/${shortcode}/`,
    username: str(user.username) ?? "",
    isVerified: user.is_verified === true,
    takenAt: takenAt ? new Date(takenAt * 1000).toISOString() : null,
    mediaType: num(raw.media_type),
    productType: str(raw.product_type),
    caption: str(raw.caption),
    likeCount: num(raw.like_count),
    commentCount: num(raw.comment_count),
    viewCount: num(raw.view_count),
    reshareCount: num(raw.reshare_count),
  };
}

/** GET /v1/instagram/search — posts matching a term. Weight 2 per call. */
export async function searchPosts(
  term: string,
  paginationToken?: string,
  deps?: Deps,
): Promise<{ posts: PulsePost[]; paginationToken: string | null }> {
  const key = process.env.PHOTOS_API;
  if (!key) return { posts: [], paginationToken: null };
  const fetchFn = deps?.fetchFn ?? fetch;
  const url = new URL(`${BASE}/search`);
  url.searchParams.set("search", term);
  if (paginationToken) url.searchParams.set("pagination_token", paginationToken);
  try {
    const res = await fetchFn(url.toString(), {
      headers: { ...BROWSER_HEADERS, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return { posts: [], paginationToken: null };
    const json = (await res.json()) as {
      meta?: { pagination_token?: unknown };
      body?: unknown;
    };
    const body = Array.isArray(json?.body) ? json.body : [];
    const posts = body
      .map((r) => normalizePost(r as Record<string, unknown>))
      .filter((p): p is PulsePost => p !== null);
    return { posts, paginationToken: str(json?.meta?.pagination_token) };
  } catch {
    return { posts: [], paginationToken: null };
  }
}

/** GET /v1/instagram/hashtags/search — tag reach (media_count). Weight 1. */
export async function searchHashtags(term: string, deps?: Deps): Promise<PulseHashtag[]> {
  const url = new URL(`${BASE}/hashtags/search`);
  url.searchParams.set("search", term);
  const body = await getBody(url.toString(), deps);
  if (!body) return [];
  return body
    .map((r) => {
      const raw = r as Record<string, unknown>;
      const name = str(raw.name);
      if (!name) return null;
      return {
        name,
        mediaCount: num(raw.media_count),
        formattedMediaCount: str(raw.formatted_media_count),
      };
    })
    .filter((t): t is PulseHashtag => t !== null);
}
