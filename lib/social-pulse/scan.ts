// lib/social-pulse/scan.ts
// Pure DI scan core (pattern: pollEngagement in lib/social). The adapter script
// wires the real client + Supabase writer; tests wire memory fakes.
import type { PulseTerm } from "./terms";
import type {
  searchPosts as SearchPostsFn,
  searchHashtags as SearchHashtagsFn,
} from "./steady-client";

export interface PostInsert {
  post_id: string;
  scan_id: number;
  shortcode: string;
  permalink: string;
  username: string;
  is_verified: boolean;
  taken_at: string | null;
  media_type: number | null;
  product_type: string | null;
  caption: string | null;
  like_count: number | null;
  comment_count: number | null;
  view_count: number | null;
  reshare_count: number | null;
  matched_term: string;
  area: string;
}

export interface HashtagInsert {
  name: string;
  scan_id: number;
  media_count: number | null;
  formatted_media_count: string | null;
}

export interface ScanRowWriter {
  insertScan(meta: { status: "ok" | "partial" | "dry" }): Promise<number>;
  finishScan(
    scanId: number,
    patch: { terms_scanned: number; requests_spent: number; status: string },
  ): Promise<void>;
  insertPosts(rows: PostInsert[]): Promise<void>;
  insertHashtags(rows: HashtagInsert[]): Promise<void>;
}

const SEARCH_WEIGHT = 2; // vendor contract: /search = 2
const HASHTAG_WEIGHT = 1;

export async function runScan(deps: {
  terms: PulseTerm[];
  searchPosts: typeof SearchPostsFn;
  searchHashtags: typeof SearchHashtagsFn;
  writer: ScanRowWriter;
  pagesPerTerm?: number;
  log?: (m: string) => void;
}): Promise<{ scanId: number; posts: number; hashtags: number; requests: number }> {
  const { terms, writer } = deps;
  const pages = deps.pagesPerTerm ?? 2;
  const log = deps.log ?? (() => {});
  const scanId = await writer.insertScan({ status: "ok" });

  const seen = new Set<string>();
  const postRows: PostInsert[] = [];
  const tagRows: HashtagInsert[] = [];
  let requests = 0;

  for (const t of terms) {
    let token: string | undefined;
    for (let page = 0; page < pages; page++) {
      const { posts, paginationToken } = await deps.searchPosts(t.term, token);
      requests += SEARCH_WEIGHT;
      for (const p of posts) {
        if (seen.has(p.postId)) continue;
        seen.add(p.postId);
        postRows.push({
          post_id: p.postId,
          scan_id: scanId,
          shortcode: p.shortcode,
          permalink: p.permalink,
          username: p.username,
          is_verified: p.isVerified,
          taken_at: p.takenAt,
          media_type: p.mediaType,
          product_type: p.productType,
          caption: p.caption,
          like_count: p.likeCount,
          comment_count: p.commentCount,
          view_count: p.viewCount,
          reshare_count: p.reshareCount,
          matched_term: t.term,
          area: t.area,
        });
      }
      if (!paginationToken) break;
      token = paginationToken;
    }
    if (t.kind === "hashtag") {
      const tags = await deps.searchHashtags(t.term);
      requests += HASHTAG_WEIGHT;
      // keep only the exact tag (the endpoint returns fuzzy matches)
      const exact = tags.find((x) => x.name === t.term);
      if (exact) {
        tagRows.push({
          name: exact.name,
          scan_id: scanId,
          media_count: exact.mediaCount,
          formatted_media_count: exact.formattedMediaCount,
        });
      }
    }
    log(`${t.term}: ${postRows.length} cumulative posts`);
  }

  if (postRows.length) await writer.insertPosts(postRows);
  if (tagRows.length) await writer.insertHashtags(tagRows);
  await writer.finishScan(scanId, {
    terms_scanned: terms.length,
    requests_spent: requests,
    status: "ok",
  });
  return { scanId, posts: postRows.length, hashtags: tagRows.length, requests };
}
