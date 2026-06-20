/**
 * lib/social/channels/x.ts
 *
 * X (Twitter) platform adapter — direct API, no paid middleman.
 *
 * VENDOR-VERIFIED (2026-06-20):
 *   Post endpoint:  POST https://api.x.com/2/tweets
 *   Scopes:         tweet.write tweet.read users.read offline.access
 *   Access TTL:     ~2 hours (short-lived OAuth2 bearer)
 *   Refresh:        POST https://api.twitter.com/2/oauth2/token (HTTP Basic; offline.access scope required)
 *   Rate limits:    100 tweet creates / 15 min per user (OAuth2)
 *   Paid tier:      Basic or higher required for meaningful volume. Quote-posting = Enterprise only.
 *   Media upload:   POST https://upload.twitter.com/1.1/media/upload.json (v1.1 multipart); returns media_id_string
 *   Link tax:       Posting a URL in the tweet body counts toward the 280-char limit and
 *                   may reduce reach. Mitigation: post the link as the FIRST REPLY to the tweet.
 *   Docs:           https://docs.x.com/x-api/posts/creation-of-a-post
 *                   https://docs.x.com/x-api/fundamentals/rate-limits
 *
 * DRY MODE: callers MUST check SOCIAL_PUBLISH_ENABLED before calling this module.
 * This adapter also refuses to post when the flag is false (defensive double-gate).
 */

import type { PublishInput, PublishResult } from "../types";

const TWEET_ENDPOINT = "https://api.x.com/2/tweets";
const MEDIA_UPLOAD_ENDPOINT = "https://upload.twitter.com/1.1/media/upload.json";

interface TweetCreateBody {
  text: string;
  media?: { media_ids: string[] };
  reply?: { in_reply_to_tweet_id: string };
}

interface TweetCreateResponse {
  data?: { id: string; text: string };
  errors?: Array<{ message: string; type: string }>;
}

interface MediaUploadResponse {
  media_id_string: string;
}

/**
 * Upload one image URL → X media asset → return media_id_string.
 * X media upload uses the v1.1 API (multipart form upload from URL).
 * The image must be fetched to a buffer first, then uploaded.
 */
async function uploadMedia(imageUrl: string, accessToken: string): Promise<string> {
  // 1. Fetch the image bytes
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`Failed to fetch media from ${imageUrl}: ${imgRes.status}`);
  const imgBuffer = await imgRes.arrayBuffer();

  // 2. Multipart upload to Twitter v1.1
  const form = new FormData();
  form.append("media", new Blob([imgBuffer]), "image.jpg");

  const uploadRes = await fetch(MEDIA_UPLOAD_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: form,
  });

  if (!uploadRes.ok) {
    const txt = await uploadRes.text();
    throw new Error(`X media upload failed (${uploadRes.status}): ${txt}`);
  }
  const json = (await uploadRes.json()) as MediaUploadResponse;
  return json.media_id_string;
}

/**
 * Post a tweet (text only, or text + media IDs).
 * Returns the created tweet ID.
 */
async function createTweet(body: TweetCreateBody, accessToken: string): Promise<string> {
  const res = await fetch(TWEET_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`X tweet creation failed (${res.status}): ${txt}`);
  }

  const json = (await res.json()) as TweetCreateResponse;
  if (json.errors?.length) {
    throw new Error(`X tweet error: ${json.errors.map((e) => e.message).join(", ")}`);
  }
  if (!json.data?.id) throw new Error("X tweet response missing data.id");
  return json.data.id;
}

/**
 * X publish adapter.
 *
 * Strategy:
 *   1. Upload media assets (if any) → collect media_ids
 *   2. Post the tweet body (caption only, NO link in body — link tax avoidance)
 *   3. If a link is present in the caption, strip it from the tweet and
 *      post it as the FIRST REPLY to the tweet (link-in-first-reply pattern)
 *
 * Link-in-first-reply: avoids the ~$0.20 X link-post fee and reach penalty
 * for tweets containing URLs. The caller (compose.ts) should emit `link`
 * separately from `caption` when this applies; for now we detect a trailing URL.
 *
 * The caller is responsible for providing a valid (non-expired) access_token.
 * The dispatcher (channels/index.ts) handles refresh-before-post.
 */
export async function postToX(input: PublishInput, accessToken: string): Promise<PublishResult> {
  // DRY MODE guard — defensive second check
  if (!process.env.SOCIAL_PUBLISH_ENABLED || process.env.SOCIAL_PUBLISH_ENABLED !== "true") {
    return { ok: false, error: "SOCIAL_PUBLISH_ENABLED is not true — DRY MODE, no post made" };
  }

  try {
    // 1. Upload media (if any — X supports up to 4 images per tweet)
    const mediaIds: string[] = [];
    for (const m of input.media.slice(0, 4)) {
      const id = await uploadMedia(m.url, accessToken);
      mediaIds.push(id);
    }

    // 2. Detect link-in-caption (trailing URL pattern)
    const urlRegex = /https?:\/\/\S+$/;
    const urlMatch = input.caption.match(urlRegex);
    const linkUrl = urlMatch ? urlMatch[0] : null;
    const tweetText = linkUrl ? input.caption.replace(urlRegex, "").trim() : input.caption;

    // 3. Post the main tweet (caption without URL)
    const body: TweetCreateBody = { text: tweetText };
    if (mediaIds.length > 0) body.media = { media_ids: mediaIds };

    const tweetId = await createTweet(body, accessToken);

    // 4. Link-in-first-reply: post the link as a reply (avoids link tax)
    if (linkUrl) {
      await createTweet(
        {
          text: linkUrl,
          reply: { in_reply_to_tweet_id: tweetId },
        },
        accessToken,
      );
    }

    return { ok: true, platform_post_id: tweetId };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
