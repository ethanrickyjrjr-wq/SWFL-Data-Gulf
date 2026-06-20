/**
 * lib/social/channels/meta.ts
 *
 * Meta (Facebook Pages + Instagram) platform adapter — direct Graph API, no paid middleman.
 * ONE adapter for both `facebook` and `instagram` platforms (same Meta app).
 *
 * VENDOR-VERIFIED (2026-06-20):
 *   Facebook Page post endpoint: POST /{page_id}/feed
 *   Facebook photo endpoint:     POST /{page_id}/photos
 *   IG media container:          POST /{ig_user_id}/media
 *   IG publish:                  POST /{ig_user_id}/media_publish
 *   Required scopes (FB):        pages_manage_posts, pages_read_engagement
 *   Required scopes (IG via FB): instagram_content_publish, pages_read_engagement, instagram_basic
 *   Page token TTL:              Permanent (no expiry)
 *   Long-lived user token:       ~60 days (fb_exchange_token extension)
 *   IG rate limit:               100 API-published posts per 24h per IG account
 *   IG media format:             JPEG only for images (publicly accessible URL required)
 *   App Review:                  Required for pages_manage_posts, instagram_content_publish
 *   Docs (FB):   https://developers.facebook.com/docs/pages/publishing/
 *   Docs (IG):   https://developers.facebook.com/docs/instagram-api/guides/content-publishing
 *   Docs (LLT):  https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived
 *
 * DRY MODE: caller MUST check SOCIAL_PUBLISH_ENABLED. This adapter adds a defensive second gate.
 */

import type { Platform, PublishInput, PublishResult } from "../types";

const GRAPH_BASE = "https://graph.facebook.com/v19.0";

// ─────────────────────────────────────────────────────────────────────────────
// Facebook Page posting
// ─────────────────────────────────────────────────────────────────────────────

interface FBFeedResponse {
  id?: string;
  error?: { message: string; code: number };
}

interface FBPhotoResponse {
  id?: string;
  post_id?: string;
  error?: { message: string; code: number };
}

/**
 * Post to a Facebook Page.
 * - Text-only: POST /{page_id}/feed with `message`
 * - With image: POST /{page_id}/photos with `url` and `caption`
 * Returns the Page post ID (e.g. "{page_id}_{post_id}").
 */
async function postToFacebookPage(
  pageId: string,
  caption: string,
  media: PublishInput["media"],
  pageAccessToken: string,
): Promise<string> {
  if (media.length > 0) {
    // Upload first image as a Page photo
    const firstImage = media[0];
    const body = new URLSearchParams({
      url: firstImage.url,
      caption,
      access_token: pageAccessToken,
    });
    const res = await fetch(`${GRAPH_BASE}/${pageId}/photos`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`FB photo post failed (${res.status}): ${txt}`);
    }
    const json = (await res.json()) as FBPhotoResponse;
    if (json.error) throw new Error(`FB photo error: ${json.error.message}`);
    return json.post_id ?? json.id ?? "unknown";
  }

  // Text-only
  const body = new URLSearchParams({ message: caption, access_token: pageAccessToken });
  const res = await fetch(`${GRAPH_BASE}/${pageId}/feed`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`FB feed post failed (${res.status}): ${txt}`);
  }
  const json = (await res.json()) as FBFeedResponse;
  if (json.error) throw new Error(`FB feed error: ${json.error.message}`);
  return json.id ?? "unknown";
}

// ─────────────────────────────────────────────────────────────────────────────
// Instagram Content Publishing (two-step: create container → publish)
// ─────────────────────────────────────────────────────────────────────────────

interface IGMediaResponse {
  id?: string;
  error?: { message: string; code: number };
}

interface IGPublishResponse {
  id?: string;
  error?: { message: string; code: number };
}

/**
 * Create an IG media container (step 1 of 2).
 * For images: media_type=IMAGE, image_url must be a publicly accessible JPEG.
 * Returns the container ID.
 */
async function createIGMediaContainer(
  igUserId: string,
  imageUrl: string,
  caption: string,
  accessToken: string,
): Promise<string> {
  const body = new URLSearchParams({
    media_type: "IMAGE",
    image_url: imageUrl,
    caption,
    access_token: accessToken,
  });
  const res = await fetch(`${GRAPH_BASE}/${igUserId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`IG media container creation failed (${res.status}): ${txt}`);
  }
  const json = (await res.json()) as IGMediaResponse;
  if (json.error) throw new Error(`IG media container error: ${json.error.message}`);
  if (!json.id) throw new Error("IG media container missing id");
  return json.id;
}

/**
 * Publish a created IG media container (step 2 of 2).
 * Returns the published media ID.
 */
async function publishIGContainer(
  igUserId: string,
  containerId: string,
  accessToken: string,
): Promise<string> {
  const body = new URLSearchParams({
    creation_id: containerId,
    access_token: accessToken,
  });
  const res = await fetch(`${GRAPH_BASE}/${igUserId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`IG media publish failed (${res.status}): ${txt}`);
  }
  const json = (await res.json()) as IGPublishResponse;
  if (json.error) throw new Error(`IG publish error: ${json.error.message}`);
  return json.id ?? "unknown";
}

// ─────────────────────────────────────────────────────────────────────────────
// Main adapter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Meta (Facebook + Instagram) publish adapter.
 *
 * The `accountId` field in PublishInput carries:
 *   facebook:  the Page ID (numeric string)
 *   instagram: the IG Business/Creator account user ID (numeric string)
 *
 * Platform-specific paths:
 *   facebook  → POST /{page_id}/photos (with image) or /{page_id}/feed (text)
 *   instagram → POST /{ig_user_id}/media → POST /{ig_user_id}/media_publish (two-step)
 *
 * The caller (channels/index.ts) is responsible for providing a valid,
 * non-expired access_token (Page token for FB; user/IG token for IG).
 */
export async function postToMeta(
  platform: Extract<Platform, "facebook" | "instagram">,
  input: PublishInput,
  accessToken: string,
): Promise<PublishResult> {
  // DRY MODE guard — defensive second check
  if (!process.env.SOCIAL_PUBLISH_ENABLED || process.env.SOCIAL_PUBLISH_ENABLED !== "true") {
    return { ok: false, error: "SOCIAL_PUBLISH_ENABLED is not true — DRY MODE, no post made" };
  }

  try {
    if (platform === "facebook") {
      const postId = await postToFacebookPage(
        input.accountId,
        input.caption,
        input.media,
        accessToken,
      );
      return { ok: true, platform_post_id: postId };
    }

    // instagram — two-step create + publish
    if (input.media.length === 0) {
      // IG requires at least one image
      return {
        ok: false,
        error: "Instagram requires at least one image — text-only posts are not supported",
      };
    }

    const containerId = await createIGMediaContainer(
      input.accountId,
      input.media[0].url,
      input.caption,
      accessToken,
    );

    const mediaId = await publishIGContainer(input.accountId, containerId, accessToken);
    return { ok: true, platform_post_id: mediaId };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
