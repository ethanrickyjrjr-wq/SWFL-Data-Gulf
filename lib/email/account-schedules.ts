import type { createClient } from "@/utils/supabase/server";

export interface AccountScheduleRow {
  id: number;
  project_id: string;
  project_title: string;
  status: string;
  cadence: string;
  day_of_week: number | null;
  day_of_month: number | null;
  send_hour_et: number;
  audience_slug: string | null;
  template_id: string | null;
  deliverable_id: string | null;
  next_run_at: string | null;
  last_run_at: string | null;
}

/** Every non-stopped email schedule the signed-in user owns, with project names
 *  + their audience slugs for the edit form. RLS scopes both queries. */
export async function loadAccountSchedules(supabase: ReturnType<typeof createClient>): Promise<{
  schedules: AccountScheduleRow[];
  audiences: string[];
}> {
  const [{ data: rows }, { data: auds }] = await Promise.all([
    supabase
      .from("email_schedules")
      .select(
        "id, project_id, status, cadence, day_of_week, day_of_month, send_hour_et, audience_slug, template_id, deliverable_id, next_run_at, last_run_at",
      )
      .neq("status", "stopped")
      .order("next_run_at", { ascending: true, nullsFirst: false }),
    supabase.from("email_audiences").select("audience_slug").order("audience_slug"),
  ]);
  const withProject = (rows ?? []).filter((r) => r.project_id != null);
  const projectIds = [...new Set(withProject.map((r) => r.project_id as string))];
  const titles = new Map<string, string>();
  if (projectIds.length) {
    const { data: projects } = await supabase
      .from("projects")
      .select("id, title")
      .in("id", projectIds);
    for (const p of projects ?? []) titles.set(p.id, p.title || "Untitled project");
  }
  const schedules: AccountScheduleRow[] = withProject.map((r) => ({
    ...(r as Omit<AccountScheduleRow, "project_id" | "project_title">),
    project_id: r.project_id as string,
    project_title: titles.get(r.project_id as string) ?? "Untitled project",
  }));
  return { schedules, audiences: (auds ?? []).map((a) => a.audience_slug) };
}
