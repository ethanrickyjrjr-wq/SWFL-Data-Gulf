// lib/social/frozen-post.ts
//
// Pure helper: given a claimed schedule row, return the verbatim publish payload IF it
// carries a frozen canvas image. The cron worker branches on this BEFORE building content
// or checking the freshness gate — a v1 frozen image is static, so the gate (which skips
// when brain data hasn't advanced) would wrongly suppress every repeat fire.
import { FORMAT_RATIO } from "@/lib/social/formats";
import type { SocialSchedule } from "@/lib/social/types";

export function frozenPublishPayload(
  row: SocialSchedule,
): { caption: string; media: { url: string; ratio: string }[] } | null {
  const url = row.frozen_post?.media_url;
  if (!url) return null;
  const fmt = row.frozen_post?.design?.format ?? "square";
  const ratio = FORMAT_RATIO[fmt] ?? "1:1";
  return { caption: row.frozen_post!.caption, media: [{ url, ratio }] };
}
