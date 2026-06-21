// lib/social/render-model.ts
//
// Map a composed social post → the renderer's SocialModel (the card shape that
// `renderSocialImage` consumes). Extracted VERBATIM from the inline mapping that
// the cron worker built before calling the renderer
// (scripts/social/run-schedules.mts) so the U2 preview render and the cron's real
// post render from the SAME mapper — no drift between what the user previews and
// what eventually posts.
//
// Behavior-preserving extraction (U2 Gap 2). No invention: every field traces to
// the ComposedPost / SocialTarget / now passed in.

import type { SocialModel } from "./render-social-image";
import type { ComposedPost, SocialTarget } from "./types";

/**
 * Build the renderer `SocialModel` for a composed post.
 *
 *   - headline   ← the first double-newline paragraph of the caption
 *   - stat       ← { label: scopeValue, value: freshness } when the target is
 *                  scoped to a place/ZIP/county; omitted for the whole region
 *   - source     ← `${scopeKind ?? "region"}:${scopeValue ?? "swfl"}`
 *   - freshness  ← carried verbatim from the post
 *   - as_of      ← the YYYY-MM-DD slice of `now`
 */
export function composedPostToSocialModel(
  post: ComposedPost,
  target: SocialTarget,
  now: Date,
): SocialModel {
  return {
    headline: post.caption.split("\n\n")[0] ?? post.caption,
    stat: target.scopeValue
      ? {
          label: target.scopeValue,
          value: post.freshness,
        }
      : undefined,
    freshness_token: post.freshness,
    source: `${target.scopeKind ?? "region"}:${target.scopeValue ?? "swfl"}`,
    as_of: now.toISOString().slice(0, 10),
  };
}
