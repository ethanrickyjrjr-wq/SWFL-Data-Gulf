import { createServiceRoleClient } from "../../utils/supabase/service-role";
import { clientIdFromRequest } from "../highlighter/meter";

function ipFrom(request: Request): string | null {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return request.headers.get("x-real-ip");
}

/**
 * Insert-only telemetry for the welcome chat. Zero enforcement — Phase 3 reads
 * welcome_chat_usage to tune the gate. Never throws (must not break the stream).
 */
export async function recordWelcomeChat(request: Request, turnCount: number): Promise<void> {
  try {
    const db = createServiceRoleClient();
    await db.from("welcome_chat_usage").insert({
      cid: clientIdFromRequest(request),
      ip: ipFrom(request),
      turn_count: turnCount,
    });
  } catch {
    // telemetry must never break the chat
  }
}

/** True when the env cap is set (mirrors `capEnabled()` for the highlighter). */
export function welcomeCapEnabled(): boolean {
  return Boolean(process.env.WELCOME_CHAT_FREE_WEEKLY_CAP);
}

/**
 * Count a client's welcome-chat requests over the trailing 7 days (rolling cap,
 * not iso-week-aligned billing). Service-role read; NEVER throws (fails open → 0 =
 * allow). Returns 0 for an anon/forged cid — those are covered by the per-IP burst
 * limiter in middleware, not this per-client cap.
 */
export async function welcomeChatWeeklyCount(cid: string): Promise<number> {
  if (!cid || cid === "anon") return 0;
  try {
    const db = createServiceRoleClient();
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count } = await db
      .from("welcome_chat_usage")
      .select("*", { count: "exact", head: true })
      .eq("cid", cid)
      .gte("created_at", since);
    return count ?? 0;
  } catch {
    return 0; // fail open — a metering read must never block the chat
  }
}
