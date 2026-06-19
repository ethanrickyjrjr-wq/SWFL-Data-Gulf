/**
 * Project activity log — the unified root (Phase 0).
 *
 * Every significant write to a project (rename, branding, item filed, email sent, etc.)
 * calls logActivity. The AI reads recentActivity() to build its state document. One table,
 * one source of truth — the AI is never out of sync with what the user has done.
 *
 * All writes use the service-role client (passed by the route handler). RLS on the table
 * allows owners to SELECT; all INSERTs are server-side only.
 *
 * logActivity is fire-and-forget: it never throws, never fails the primary request.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type ActivityType =
  | "project_created"
  | "project_renamed"
  | "scope_changed"
  | "branding_changed"
  | "item_filed"
  | "item_refreshed"
  | "metric_moved"
  | "deliverable_built"
  | "email_sent"
  | "external_event"
  | "news_clipped"
  | "mcp_connected";

const SIG: Record<ActivityType, number> = {
  project_created: 10,
  branding_changed: 9,
  project_renamed: 8,
  scope_changed: 8,
  news_clipped: 8,
  metric_moved: 7,
  email_sent: 7,
  deliverable_built: 6,
  item_filed: 5,
  mcp_connected: 5,
  item_refreshed: 4,
  external_event: 5,
};

export interface LogActivityInput {
  projectId: string;
  type: ActivityType;
  actor: "user" | "system" | "ai" | "external";
  summary: string;
  detail?: Record<string, unknown>;
  significance?: number;
}

/** Fire-and-forget insert. Logs on failure but never propagates to the caller. */
export async function logActivity(
  supabase: SupabaseClient,
  input: LogActivityInput,
): Promise<void> {
  try {
    const { error } = await supabase.from("project_activity").insert({
      project_id: input.projectId,
      activity_type: input.type,
      actor: input.actor,
      summary: input.summary,
      detail: input.detail ?? null,
      significance: input.significance ?? SIG[input.type],
    });
    if (error) console.error("[project_activity] insert error:", error.message);
  } catch (err) {
    console.error("[project_activity] insert threw:", err);
  }
}

/** Read the most recent significant activity for a project — pre-formatted for AI context. */
export async function readRecentActivity(
  supabase: SupabaseClient,
  projectId: string,
  opts: { limit?: number; minSignificance?: number; windowDays?: number } = {},
): Promise<string[]> {
  const { limit = 5, minSignificance = 5, windowDays = 30 } = opts;
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from("project_activity")
    .select("summary, created_at")
    .eq("project_id", projectId)
    .gte("significance", minSignificance)
    .gte("created_at", since)
    .order("significance", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!data?.length) return [];

  return data.map((r) => {
    const ms = Date.now() - new Date(r.created_at).getTime();
    const days = Math.round(ms / 86_400_000);
    const when = days === 0 ? "today" : days === 1 ? "yesterday" : `${days}d ago`;
    return `${r.summary} (${when})`;
  });
}
