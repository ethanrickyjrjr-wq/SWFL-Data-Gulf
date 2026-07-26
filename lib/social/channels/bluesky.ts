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

export interface BlueskyPostInput {
  caption: string;
  image?: {
    bytes: Uint8Array;
    mime: string;
    alt: string;
    aspectRatio?: { width: number; height: number };
  };
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

export async function postToBluesky(
  input: BlueskyPostInput,
  cred: BlueskyCredential,
): Promise<BlueskyPostResult> {
  try {
    // 1. createSession
    const sessionRes = await fetch(`${PDS_BASE}/xrpc/com.atproto.server.createSession`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: cred.identifier, password: cred.appPassword }),
    });
    if (!sessionRes.ok) return xrpcFailure("createSession", sessionRes);
    const session = (await sessionRes.json()) as CreateSessionResponse;

    // 2. uploadBlob — only when an image is attached
    let blob: unknown;
    if (input.image) {
      const uploadRes = await fetch(`${PDS_BASE}/xrpc/com.atproto.repo.uploadBlob`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.accessJwt}`,
          "Content-Type": input.image.mime,
        },
        // Cast: lib.dom's BodyInit union doesn't include the generic
        // Uint8Array<ArrayBufferLike> shape TS infers here, but fetch (Bun/Node)
        // accepts any ArrayBufferView as a raw-bytes body at runtime.
        body: input.image.bytes as BodyInit,
      });
      if (!uploadRes.ok) return xrpcFailure("uploadBlob", uploadRes);
      const uploaded = (await uploadRes.json()) as UploadBlobResponse;
      blob = uploaded.blob;
    }

    // 3. createRecord
    const record: Record<string, unknown> = {
      $type: "app.bsky.feed.post",
      text: input.caption,
      createdAt: new Date().toISOString(),
      langs: ["en"],
    };
    if (input.image) {
      record.embed = {
        $type: "app.bsky.embed.images",
        images: [
          {
            alt: input.image.alt,
            image: blob, // embedded verbatim — never reshaped
            ...(input.image.aspectRatio ? { aspectRatio: input.image.aspectRatio } : {}),
          },
        ],
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
