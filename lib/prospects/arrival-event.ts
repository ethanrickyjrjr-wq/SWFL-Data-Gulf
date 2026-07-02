// lib/prospects/arrival-event.ts
//
// Outreach click-attribution on the arrival page: a demo email's links carry
// `ref=<recipient uuid>-<touch>`; the welcome page logs an 'arrived' event so the
// cycle-1 scorecard can read delivered → opened → clicked → arrived → claimed.
// Parsing is pure; the write swallows every error — attribution must never break
// the page a prospect just clicked into.

import { REF_RE } from "./build-arrival-url";

export interface ArrivalRef {
  /** outreach_recipients.id (uuid). */
  rid: string;
  /** The touch that produced the click: t1..t4 | trial | reengage. */
  touch: string;
}

export function parseArrivalRef(ref: string | null | undefined): ArrivalRef | null {
  if (!ref || !REF_RE.test(ref)) return null;
  return { rid: ref.slice(0, 36), touch: ref.slice(37) };
}

/** Best-effort 'arrived' event. Never throws. */
export async function logArrival(ref: string): Promise<void> {
  const parsed = parseArrivalRef(ref);
  if (!parsed) return;
  try {
    // Lazy import keeps the pure parser importable without Supabase env.
    const { createServiceRoleClient } = await import("@/utils/supabase/service-role");
    const db = createServiceRoleClient();
    await db.from("outreach_events").insert({
      recipient_id: parsed.rid,
      event: "arrived",
      meta: { ref },
    });
  } catch (err) {
    console.error(
      `[arrival] event log failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
