/**
 * lib/social/channels/bluesky.ts
 *
 * Bluesky (AT Protocol) adapter for the "Post to Bluesky" post-now flow.
 * NOT wired into postToChannel (channels/index.ts routes bluesky OUT of that
 * lane deliberately) — this is called directly by the post-now API route
 * (Task 4) on an env-credential app password, never OAuth.
 *
 * VENDOR-VERIFIED call sequence — all three XRPC calls hit the PDS
 * (https://bsky.social), never the read-only public appview
 * (public.api.bsky.app):
 *   1. POST /xrpc/com.atproto.server.createSession { identifier, password }
 *      → { accessJwt, did }
 *   2. (only if an image is attached) POST /xrpc/com.atproto.repo.uploadBlob
 *      — body is the RAW image bytes (Uint8Array), Content-Type: <mime>,
 *      Bearer accessJwt. No multipart, no base64. → { blob }. That blob
 *      object is embedded VERBATIM in the post record — never reshaped.
 *   3. POST /xrpc/com.atproto.repo.createRecord
 *      { repo: did, collection: "app.bsky.feed.post", record: {...} }
 *      → { uri, cid }. uri is an at:// URI whose last path segment is the
 *      rkey; the public post URL is https://bsky.app/profile/<identifier>/post/<rkey>.
 *
 * Never throws. Any non-OK XRPC response short-circuits the remaining calls
 * and returns { ok: false, error } carrying the response status + the
 * response body text verbatim.
 */

import type { PublishResult } from "../types";

const PDS_BASE = "https://bsky.social";

export interface BlueskyCredential {
  identifier: string;
  appPassword: string;
}

export interface BlueskyImage {
  bytes: Uint8Array;
  mime: string;
  alt: string;
  aspectRatio?: { width: number; height: number };
}

export interface BlueskyPostInput {
  caption: string;
  /** Single-image convenience (the post-now route's shape). */
  image?: BlueskyImage;
  /** Multi-image post (lexicon cap: 4). Takes precedence over `image`. */
  images?: BlueskyImage[];
}

export interface BlueskyPostResult extends PublishResult {
  uri?: string;
  url?: string;
}

interface CreateSessionResponse {
  accessJwt: string;
  did: string;
}

interface UploadBlobResponse {
  blob: unknown;
}

interface CreateRecordResponse {
  uri: string;
  cid: string;
}

/** Non-OK XRPC response → { ok:false, error }, status + body text verbatim. Never throws. */
async function xrpcFailure(step: string, res: Response): Promise<{ ok: false; error: string }> {
  const bodyText = await res.text();
  return { ok: false, error: `Bluesky ${step} failed (${res.status}): ${bodyText}` };
}

/** rkey = the last path segment of an at:// record uri. */
function rkeyFromUri(uri: string): string {
  const segments = uri.split("/");
  return segments[segments.length - 1];
}

export interface LinkFacet {
  index: { byteStart: number; byteEnd: number };
  features: Array<{ $type: "app.bsky.richtext.facet#link"; uri: string }>;
}

const URL_IN_TEXT = /https?:\/\/\S+/g;
const TRAILING_PUNCT = /[.,;:!?)\]]+$/;

/**
 * Bare URLs in post text render as dead text on Bluesky unless the record
 * carries rich-text facets. Facet ranges are BYTE offsets into the UTF-8
 * encoding (inclusive start, exclusive end) — never JS string indices
 * (https://docs.bsky.app/docs/advanced-guides/post-richtext). Trailing
 * sentence punctuation is excluded from both the range and the uri.
 */
export function detectLinkFacets(text: string): LinkFacet[] {
  const enc = new TextEncoder();
  const facets: LinkFacet[] = [];
  for (const m of text.matchAll(URL_IN_TEXT)) {
    const uri = m[0].replace(TRAILING_PUNCT, "");
    if (!uri) continue;
    const byteStart = enc.encode(text.slice(0, m.index)).length;
    facets.push({
      index: { byteStart, byteEnd: byteStart + enc.encode(uri).length },
      features: [{ $type: "app.bsky.richtext.facet#link", uri }],
    });
  }
  return facets;
}

export async function postToBluesky(
  input: BlueskyPostInput,
  cred: BlueskyCredential,
): Promise<BlueskyPostResult> {
  // Normalized image list — `images` wins; the lexicon caps a post at 4.
  const imageList: BlueskyImage[] = input.images ?? (input.image ? [input.image] : []);
  if (imageList.length > 4) {
    return {
      ok: false,
      error: `Bluesky allows at most 4 images per post, got ${imageList.length}`,
    };
  }
  try {
    // 1. createSession
    const sessionRes = await fetch(`${PDS_BASE}/xrpc/com.atproto.server.createSession`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: cred.identifier, password: cred.appPassword }),
    });
    if (!sessionRes.ok) return xrpcFailure("createSession", sessionRes);
    const session = (await sessionRes.json()) as CreateSessionResponse;

    // 2. uploadBlob — one per attached image, in post order
    const blobs: unknown[] = [];
    for (const img of imageList) {
      const uploadRes = await fetch(`${PDS_BASE}/xrpc/com.atproto.repo.uploadBlob`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.accessJwt}`,
          "Content-Type": img.mime,
        },
        // Cast: lib.dom's BodyInit union doesn't include the generic
        // Uint8Array<ArrayBufferLike> shape TS infers here, but fetch (Bun/Node)
        // accepts any ArrayBufferView as a raw-bytes body at runtime.
        body: img.bytes as BodyInit,
      });
      if (!uploadRes.ok) return xrpcFailure("uploadBlob", uploadRes);
      const uploaded = (await uploadRes.json()) as UploadBlobResponse;
      blobs.push(uploaded.blob);
    }

    // 3. createRecord
    const record: Record<string, unknown> = {
      $type: "app.bsky.feed.post",
      text: input.caption,
      createdAt: new Date().toISOString(),
      langs: ["en"],
    };
    const facets = detectLinkFacets(input.caption);
    if (facets.length > 0) record.facets = facets;
    if (imageList.length > 0) {
      record.embed = {
        $type: "app.bsky.embed.images",
        images: imageList.map((img, i) => ({
          alt: img.alt,
          image: blobs[i], // embedded verbatim — never reshaped
          ...(img.aspectRatio ? { aspectRatio: img.aspectRatio } : {}),
        })),
      };
    }

    const createRes = await fetch(`${PDS_BASE}/xrpc/com.atproto.repo.createRecord`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessJwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        repo: session.did,
        collection: "app.bsky.feed.post",
        record,
      }),
    });
    if (!createRes.ok) return xrpcFailure("createRecord", createRes);
    const created = (await createRes.json()) as CreateRecordResponse;

    const rkey = rkeyFromUri(created.uri);
    return {
      ok: true,
      platform_post_id: rkey,
      uri: created.uri,
      url: `https://bsky.app/profile/${cred.identifier}/post/${rkey}`,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
