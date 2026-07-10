// lib/email/zip-events/webhook.ts
//
// Pure mapping: Resend outbound event tagged `ma` → one per-recipient ×
// per-trigger engagement row (market_alert_engagement). Mirrors
// extractWeeklyReadAction's shape (tags arrive as a plain object).
// Suppression (bounce/complaint → subscriber status flip) stays in the
// weekly-read extract — this module ONLY records engagement.

const EVENTS: Record<string, "opened" | "clicked" | "bounced" | "complained" | "delivered"> = {
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.delivered": "delivered",
};

export interface MarketAlertEngagement {
  wid: string;
  issue_id: string;
  trigger: string | null;
  area_id: string | null;
  event: (typeof EVENTS)[string];
}

export function extractMarketAlertEngagement(payload: {
  type?: string;
  data?: { tags?: Record<string, string> };
}): MarketAlertEngagement | null {
  const tags = payload.data?.tags;
  const wid = tags?.["wid"];
  const issueId = tags?.["ma"];
  if (!wid || !issueId) return null;
  const event = payload.type ? EVENTS[payload.type] : undefined;
  if (!event) return null;
  return {
    wid,
    issue_id: issueId,
    trigger: tags?.["trigger"] ?? null,
    area_id: tags?.["area"] ?? null,
    event,
  };
}
