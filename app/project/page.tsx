import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/utils/supabase/server";
import {
  buildScheduleChips,
  type EmailScheduleRow,
  type SocialScheduleRow,
} from "@/lib/project/schedule-chips";
import { toCockpitProjects, type ProjectRowInput } from "@/lib/project/group-projects";
import { loadCampaignStats } from "@/lib/email/load-campaign-stats";
import { renderEmailDocHtml } from "@/lib/email/render-email-doc";
import { EmailDocSchema } from "@/lib/email/doc/schema";
import { ImportDraftOnLogin } from "./_import/ImportDraftOnLogin";
import { NewProjectButton } from "./NewProjectButton";
import { NewListingButton } from "./NewListingButton";
import { ShowingPrepButton } from "./ShowingPrepButton";
import { ProjectsCockpit } from "./_cockpit/ProjectsCockpit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your projects — SWFL Data Gulf" };

/**
 * The hub: MISSION CONTROL (spec 2026-07-16-hub-mission-control-design,
 * supersedes the same-day cockpit's grouped center list). The rail (area
 * layout) is the ONE project list; this page assembles the dashboard's data —
 * schedules for the calendar, stored campaign stats, and the default
 * selection's frozen preview — and hands it to the cockpit shell. Full-bleed
 * like the [id] pages; no PageShell.
 */
export default async function ProjectListPage() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Middleware already gates /project, but redirect here too (belt + suspenders).
  if (!user) redirect("/login?next=/project");

  const [{ data }, { data: emailSch }, { data: socialSch }, { data: delivRows }, contactsRes] =
    await Promise.all([
      supabase
        .from("projects")
        .select("id, title, kind, items, updated_at")
        .order("updated_at", { ascending: false }),
      supabase
        .from("email_schedules")
        .select(
          "id, project_id, status, cadence, day_of_week, day_of_month, send_hour_et, audience_slug, next_run_at, deliverable_id",
        )
        .in("status", ["active", "paused"]),
      supabase
        .from("social_schedules")
        .select(
          "id, project_id, status, cadence, day_of_week, day_of_month, send_hour_et, platform, next_run_at",
        )
        .in("status", ["active", "paused"]),
      // Newest-first so the fold keeps the most-recent block-canvas doc per
      // project (same tie-break the tool switcher uses).
      supabase
        .from("deliverables")
        .select("id, project_id, template")
        .order("data_as_of", { ascending: false }),
      supabase.from("contacts").select("id", { count: "exact", head: true }),
    ]);

  const rows = (data as ProjectRowInput[] | null) ?? [];
  const contactsCount = contactsRes.count ?? 0;

  const { chipsByProject, activeCount, allChips } = buildScheduleChips(
    emailSch ?? [],
    socialSch ?? [],
  );
  const builtByProject = new Map<string, number>();
  const lastDidByProject = new Map<string, string>();
  for (const d of delivRows ?? []) {
    builtByProject.set(d.project_id, (builtByProject.get(d.project_id) ?? 0) + 1);
    if (d.template === "block-canvas" && !lastDidByProject.has(d.project_id)) {
      lastDidByProject.set(d.project_id, d.id);
    }
  }

  const projects = toCockpitProjects(rows, {
    chipsByProject,
    builtByProject,
    lastDidByProject,
  });

  const stats = await loadCampaignStats(supabase, user.id);

  // Default selection = most recent project (rows[0], same as the layout's
  // provider initialId). Server-render its latest doc so the card paints
  // without a fetch; selection changes re-fetch via preview-html.
  let initialPreview: { did: string; html: string } | null = null;
  const defaultDid = rows[0] ? (lastDidByProject.get(rows[0].id) ?? null) : null;
  if (defaultDid) {
    const { data: doc } = await supabase
      .from("deliverables")
      .select("doc")
      .eq("id", defaultDid)
      .maybeSingle();
    const parsed = EmailDocSchema.safeParse(doc?.doc);
    if (parsed.success) {
      initialPreview = { did: defaultDid, html: await renderEmailDocHtml(parsed.data) };
    }
  }

  return (
    <>
      {/* Migrates an anonymous localStorage draft into a saved project on arrival. */}
      <ImportDraftOnLogin />
      <ProjectsCockpit
        projects={projects}
        activeCount={activeCount}
        chips={allChips}
        emailSch={(emailSch ?? []) as EmailScheduleRow[]}
        socialSch={(socialSch ?? []) as SocialScheduleRow[]}
        contactsCount={contactsCount}
        stats={stats}
        initialPreview={initialPreview}
        actions={
          <>
            <NewListingButton />
            <ShowingPrepButton />
            <NewProjectButton />
          </>
        }
      />
    </>
  );
}
