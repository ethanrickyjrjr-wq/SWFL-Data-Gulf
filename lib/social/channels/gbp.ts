/**
 * lib/social/channels/gbp.ts
 *
 * Google Business Profile (GBP) platform adapter — direct My Business API v4.
 *
 * VENDOR-VERIFIED (2026-06-20):
 *   Local post endpoint: POST https://mybusiness.googleapis.com/v4/{parent}/localPosts
 *   Auth scopes:         https://www.googleapis.com/auth/business.manage
 *                        (also: https://www.googleapis.com/auth/plus.business.manage — deprecated alias)
 *   Access token TTL:    3600s (1 hour) — standard Google OAuth
 *   Refresh token TTL:   No expiry by default (revokable by user)
 *   Refresh endpoint:    POST https://oauth2.googleapis.com/token (grant_type=refresh_token)
 *   Quota:               No explicit quota published; normal Google API quotas apply
 *   Special approval:    None mentioned; standard OAuth consent screen verification required
 *   Docs:                https://developers.google.com/my-business/reference/rest
 *                        https://developers.google.com/my-business/reference/rest/v4/accounts.locations.localPosts/create
 *
 * NOTE: The accountId in PublishInput carries the location resource name:
 *   "accounts/{account_id}/locations/{location_id}"
 * This is stored during the OAuth connect flow (the operator must provide their
 * GBP location resource name when connecting the account).
 *
 * DRY MODE: caller MUST check SOCIAL_PUBLISH_ENABLED. This adapter adds a defensive second gate.
 */

import type { PublishInput, PublishResult } from "../types";

const GBP_BASE = "https://mybusiness.googleapis.com/v4";

interface GBPMediaItem {
  mediaFormat: "PHOTO";
  sourceUrl: string;
}

interface GBPLocalPostBody {
  languageCode: string;
  summary: string;
  topicType: "STANDARD";
  media?: GBPMediaItem[];
}

interface GBPLocalPostResponse {
  name?: string; // resource name of the created local post
  error?: { message: string; code: number; status: string };
}

/**
 * Google Business Profile publish adapter.
 *
 * accountId must be the location resource name:
 *   "accounts/12345678/locations/987654321"
 *
 * Creates a STANDARD local post (topicType=STANDARD).
 * Media: optional photo via publicly accessible URL.
 *
 * Returns the GBP local post resource name as platform_post_id.
 */
export async function postToGBP(input: PublishInput, accessToken: string): Promise<PublishResult> {
  // DRY MODE guard — defensive second check
  if (!process.env.SOCIAL_PUBLISH_ENABLED || process.env.SOCIAL_PUBLISH_ENABLED !== "true") {
    return { ok: false, error: "SOCIAL_PUBLISH_ENABLED is not true — DRY MODE, no post made" };
  }

  try {
    const parent = input.accountId; // e.g. "accounts/12345/locations/67890"
    const url = `${GBP_BASE}/${parent}/localPosts`;

    const body: GBPLocalPostBody = {
      languageCode: "en-US",
      summary: input.caption,
      topicType: "STANDARD",
    };

    if (input.media.length > 0) {
      body.media = input.media.map((m) => ({
        mediaFormat: "PHOTO" as const,
        sourceUrl: m.url,
      }));
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`GBP localPost creation failed (${res.status}): ${txt}`);
    }

    const json = (await res.json()) as GBPLocalPostResponse;
    if (json.error) throw new Error(`GBP error: ${json.error.message}`);

    return { ok: true, platform_post_id: json.name ?? "unknown" };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
