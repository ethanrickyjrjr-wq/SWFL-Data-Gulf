/**
 * lib/social/channels/index.ts
 *
 * `postToChannel` — the SocialPublisher implementation.
 *
 * This is build 03's public surface. The cron worker (build 04) and the
 * USER SIDE confirm flow both call this. It implements the SocialPublisher interface
 * from lib/social/types.ts.
 *
 * Flow per call:
 *   1. DRY MODE gate (SOCIAL_PUBLISH_ENABLED env var — top-level guard)
 *   2. Retrieve tokens from social_accounts via oauth-tokens.ts
 *   3. Refresh-if-expired (each platform has its own refresh TTL and mechanism)
 *   4. Dispatch to per-platform adapter (x/meta/linkedin/gbp)
 *   5. Return PublishResult { ok, platform_post_id?, error? }
 *
 * The caller (cron worker) also gates on SOCIAL_PUBLISH_ENABLED before calling this
 * function. The platform adapters themselves add a third defensive check. Belt, suspenders,
 * and a second pair of suspenders — this never makes a live platform call in DRY mode.
 *
 * IMPORTANT: This module requires a Supabase client to be provided by the caller
 * so it can look up social_accounts rows. The SupabaseClient must have the
 * service-role key for the cron worker path.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Platform, PublishInput, PublishResult, SocialPublisher } from "../types";
import { getValidAccessToken } from "../oauth-tokens";
import { postToX } from "./x";
import { postToMeta } from "./meta";
import { postToLinkedIn } from "./linkedin";
import { postToGBP } from "./gbp";

// ─────────────────────────────────────────────────────────────────────────────
// The publisher needs the Supabase client to refresh tokens.
// We export a factory so the injected db is bound at construction time.
// ─────────────────────────────────────────────────────────────────────────────

export interface ChannelPublisherOptions {
  db: SupabaseClient;
  /** The user_id owner of all accounts this publisher instance serves. */
  userId: string;
}

/**
 * Route a publish request to the correct platform adapter.
 * This is the internal implementation; createChannelPublisher wraps it as SocialPublisher.
 *
 * @param db       - Service-role Supabase client
 * @param userId   - Owner user_id (used for social_accounts lookup)
 * @param input    - Publish request
 */
export async function postToChannel(
  db: SupabaseClient,
  userId: string,
  input: PublishInput,
): Promise<PublishResult> {
  // ── TOP-LEVEL DRY MODE GATE ──────────────────────────────────────────────
  // This is the first of three checks (the adapters each add a second;
  // the cron adds a third before calling this function at all).
  if (process.env.SOCIAL_PUBLISH_ENABLED !== "true") {
    return {
      ok: false,
      error: "SOCIAL_PUBLISH_ENABLED is not true — DRY MODE, no post made",
    };
  }

  // ── GET VALID (POSSIBLY REFRESHED) ACCESS TOKEN ──────────────────────────
  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(db, userId, input.platform, input.accountId);
  } catch (err) {
    return {
      ok: false,
      error: `Token retrieval/refresh failed for ${input.platform}/${input.accountId}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // ── DISPATCH TO PLATFORM ADAPTER ─────────────────────────────────────────
  switch (input.platform) {
    case "x":
      return postToX(input, accessToken);

    case "facebook":
    case "instagram":
      return postToMeta(input.platform, input, accessToken);

    case "linkedin":
      return postToLinkedIn(input, accessToken);

    case "google_business":
      return postToGBP(input, accessToken);

    default: {
      // Exhaustiveness guard
      const _never: never = input.platform;
      return {
        ok: false,
        error: `Unknown platform: ${String(_never)}`,
      };
    }
  }
}

/**
 * Create a SocialPublisher instance bound to a specific db + userId.
 * The cron worker (build 04) calls this factory to create a publisher for each
 * scheduled batch, then passes it into the publish pipeline via SocialDeps.
 *
 * Example:
 *   const publisher = createChannelPublisher({ db: supabaseClient, userId: schedule.user_id });
 *   const result = await publisher.post(input);
 */
export function createChannelPublisher(opts: ChannelPublisherOptions): SocialPublisher {
  return {
    post: (input: PublishInput): Promise<PublishResult> =>
      postToChannel(opts.db, opts.userId, input),
  };
}

/**
 * Convenience: get a platform's display name for logging.
 */
export function platformLabel(platform: Platform): string {
  const labels: Record<Platform, string> = {
    x: "X (Twitter)",
    facebook: "Facebook",
    instagram: "Instagram",
    linkedin: "LinkedIn",
    google_business: "Google Business Profile",
  };
  return labels[platform];
}
