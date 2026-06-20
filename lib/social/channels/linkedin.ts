/**
 * lib/social/channels/linkedin.ts
 *
 * LinkedIn platform adapter — direct Posts API, no paid middleman.
 *
 * VENDOR-VERIFIED (2026-06-20):
 *   Post endpoint:    POST https://api.linkedin.com/rest/posts
 *   Required headers: LinkedIn-Version: {YYYYMM}, X-Restli-Protocol-Version: 2.0.0
 *   Response:         201 with x-restli-id header containing the post URN
 *   Scopes (org):     w_organization_social  (requires Community Management product approval)
 *   Scopes (member):  w_member_social
 *   Access TTL:       60 days (expires_in: 5184000)
 *   Refresh TTL:      365 days from initial issue (fixed; does NOT reset on use)
 *   Refresh endpoint: POST https://www.linkedin.com/oauth/v2/accessToken (grant_type=refresh_token)
 *   Image upload:     POST https://api.linkedin.com/rest/images?action=initializeUpload (Images API)
 *   Post ID:          x-restli-id response header (e.g. urn:li:share:...)
 *   Docs:             https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api
 *   OAuth docs:       https://learn.microsoft.com/en-us/linkedin/shared/authentication/programmatic-refresh-tokens
 *
 * NOTE: The accountId in PublishInput carries either:
 *   - An organization URN: "urn:li:organization:12345" (org page posts)
 *   - A person URN:        "urn:li:person:abc123" (member posts)
 * The OAuth callback must store the correct URN form.
 *
 * DRY MODE: caller MUST check SOCIAL_PUBLISH_ENABLED. This adapter adds a defensive second gate.
 */

import type { PublishInput, PublishResult } from "../types";

const LINKEDIN_API = "https://api.linkedin.com";
// Use a fixed recent version — update this when LinkedIn requires migration
const LINKEDIN_VERSION = "202501";

interface LinkedInImageUploadInit {
  value?: {
    uploadUrl?: string;
    image?: string; // URN: urn:li:image:{id}
  };
  status?: number;
}

/**
 * Initialize a LinkedIn image upload and return { uploadUrl, imageUrn }.
 * Docs: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/images-api
 */
async function initImageUpload(
  owner: string,
  accessToken: string,
): Promise<{ uploadUrl: string; imageUrn: string }> {
  const res = await fetch(`${LINKEDIN_API}/rest/images?action=initializeUpload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "LinkedIn-Version": LINKEDIN_VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      initializeUploadRequest: { owner },
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`LinkedIn image upload init failed (${res.status}): ${txt}`);
  }

  const json = (await res.json()) as LinkedInImageUploadInit;
  const uploadUrl = json.value?.uploadUrl;
  const imageUrn = json.value?.image;
  if (!uploadUrl || !imageUrn) {
    throw new Error("LinkedIn image upload init missing uploadUrl or image URN");
  }
  return { uploadUrl, imageUrn };
}

/**
 * Upload image bytes to LinkedIn's signed upload URL.
 */
async function uploadImageBytes(uploadUrl: string, imageUrl: string): Promise<void> {
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`Failed to fetch image from ${imageUrl}: ${imgRes.status}`);
  const imgBytes = await imgRes.arrayBuffer();

  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "image/jpeg" },
    body: imgBytes,
  });
  if (!uploadRes.ok) {
    const txt = await uploadRes.text();
    throw new Error(`LinkedIn image upload PUT failed (${uploadRes.status}): ${txt}`);
  }
}

/**
 * Create a LinkedIn post.
 * - Text-only: `commentary` only, no `content` field.
 * - With image: single image in `content.media.id` (image URN).
 *
 * Returns the post URN from the x-restli-id response header.
 */
async function createLinkedInPost(
  authorUrn: string,
  commentary: string,
  imageUrn: string | null,
  accessToken: string,
): Promise<string> {
  const body: Record<string, unknown> = {
    author: authorUrn,
    commentary,
    visibility: "PUBLIC",
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };

  if (imageUrn) {
    body.content = {
      media: {
        id: imageUrn,
      },
    };
  }

  const res = await fetch(`${LINKEDIN_API}/rest/posts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "LinkedIn-Version": LINKEDIN_VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`LinkedIn post creation failed (${res.status}): ${txt}`);
  }

  // Post ID is in the response header, not the body (body is empty on 201)
  const postUrn = res.headers.get("x-restli-id");
  if (!postUrn) throw new Error("LinkedIn post response missing x-restli-id header");
  return postUrn;
}

/**
 * LinkedIn publish adapter.
 *
 * accountId must be a valid LinkedIn URN:
 *   "urn:li:organization:12345"  → company/org page post (w_organization_social)
 *   "urn:li:person:abc123"       → member post (w_member_social)
 *
 * Media strategy: uploads the first image if present.
 * LinkedIn does not support text-only posts with image by URL — requires the Images API flow.
 */
export async function postToLinkedIn(
  input: PublishInput,
  accessToken: string,
): Promise<PublishResult> {
  // DRY MODE guard — defensive second check
  if (!process.env.SOCIAL_PUBLISH_ENABLED || process.env.SOCIAL_PUBLISH_ENABLED !== "true") {
    return { ok: false, error: "SOCIAL_PUBLISH_ENABLED is not true — DRY MODE, no post made" };
  }

  try {
    const authorUrn = input.accountId;
    let imageUrn: string | null = null;

    if (input.media.length > 0) {
      const { uploadUrl, imageUrn: urn } = await initImageUpload(authorUrn, accessToken);
      await uploadImageBytes(uploadUrl, input.media[0].url);
      imageUrn = urn;
    }

    const postUrn = await createLinkedInPost(authorUrn, input.caption, imageUrn, accessToken);
    return { ok: true, platform_post_id: postUrn };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
