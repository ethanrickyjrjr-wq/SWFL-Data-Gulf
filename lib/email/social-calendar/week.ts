// lib/email/social-calendar/week.ts
import type { SocialDraft } from "./types";

/** ISO date (YYYY-MM-DD) of the Monday of the given date's week, in UTC. */
export function mondayOf(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = x.getUTCDay(); // 0=Sun..6=Sat
  x.setUTCDate(x.getUTCDate() - ((dow + 6) % 7));
  return x.toISOString().slice(0, 10);
}

/** Paste-ready caption block: caption, blank line, then #-prefixed hashtags. */
export function formatForClipboard(draft: SocialDraft): string {
  const tags = draft.hashtags.map((h) => `#${h}`).join(" ");
  return tags ? `${draft.caption}\n\n${tags}` : draft.caption;
}
