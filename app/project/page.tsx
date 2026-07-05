import { cookies } from "next/headers";
import { PageShell } from "@/components/PageShell";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/utils/supabase/server";
import type { ProjectItem } from "@/lib/project/items";
import { inferScopeFromItems } from "@/lib/project/derive-name";
import { projectHome } from "@/lib/project/tool-tabs";
import {
  describeCadence,
  formatScheduleSendTime,
  type Cadence,
} from "@/lib/email/schedule-cadence";
import { ImportDraftOnLogin } from "./_import/ImportDraftOnLogin";
import { NewProjectButton } from "./NewProjectButton";
import { NewListingButton } from "./NewListingButton";
import { CampaignQuickStart } from "@/components/campaigns/CampaignQuickStart";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your projects — SWFL Data Gulf" };

interface ProjectRow {
  id: string;
  title: string | null;
  items: ProjectItem[];
  updated_at: string;
}

/** One schedule chip — email or social, already phrased for display. */
interface ScheduleChip {
  key: string;
  kind: "email" | "social";
  status: string; // active | paused
  line: string; // "Emails every Monday at 8 AM ET"
  audience: string | null;
  nextAt: string | null; // ISO, for sorting + display
  href: string;
}

function chipTime(nextAt: string | null): string | null {
  if (!nextAt) return null;
  const t = formatScheduleSendTime(nextAt);
  return t || null;
}

/**
 * The control center (operator ruling 07/03/2026): every project shown WITH what it
 * has running — each schedule as a plain-English chip with its next send, click to
 * tailor. Opening a project itself lands on the Email tool (`projectHome`); this page
 * is where you MANAGE. Spec: docs/superpowers/specs/2026-07-03-projects-control-center-design.md
 */
export default async function ProjectListPage() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Middleware already gates /project, but redirect here too (belt + suspenders).
  if (!user) redirect("/login?next=/project");

  const [{ data }, { data: emailSch }, { data: socialSch }, { data: delivRows }] =
    await Promise.all([
      supabase.from("projects").select("id, title, items, updated_at").order("updated_at", {
        ascending: false,
      }),
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
      supabase.from("deliverables").select("id, project_id"),
    ]);
  const projects = (data as ProjectRow[] | null) ?? [];

  // Fold schedules + built-email counts by project. Schedules not linked to a
  // project (project_id null) are counted in the summary but have no card row.
  const chipsByProject = new Map<string, ScheduleChip[]>();
  function addChip(pid: string | null, chip: ScheduleChip) {
    if (!pid) return;
    const list = chipsByProject.get(pid) ?? [];
    list.push(chip);
    chipsByProject.set(pid, list);
  }
  for (const s of emailSch ?? []) {
    addChip(s.project_id, {
      key: `e${s.id}`,
      kind: "email",
      status: s.status,
      line: `Emails ${describeCadence({
        cadence: s.cadence as Cadence,
        day_of_week: s.day_of_week,
        day_of_month: s.day_of_month,
        send_hour_et: s.send_hour_et,
      })}`,
      audience: s.audience_slug,
      nextAt: s.next_run_at,
      href:
        s.project_id && s.deliverable_id
          ? `/project/${s.project_id}/email-lab?did=${s.deliverable_id}&schedule=1`
          : s.project_id
            ? projectHome(s.project_id)
            : "/project",
    });
  }
  for (const s of socialSch ?? []) {
    addChip(s.project_id, {
      key: `s${s.id}`,
      kind: "social",
      status: s.status,
      line: `Posts to ${s.platform} ${describeCadence({
        cadence: s.cadence as Cadence,
        day_of_week: s.day_of_week,
        day_of_month: s.day_of_month,
        send_hour_et: s.send_hour_et,
      })}`,
      audience: null,
      nextAt: s.next_run_at,
      href: s.project_id ? `/project/${s.project_id}/social` : "/project",
    });
  }
  const builtByProject = new Map<string, number>();
  for (const d of delivRows ?? []) {
    builtByProject.set(d.project_id, (builtByProject.get(d.project_id) ?? 0) + 1);
  }

  // Upcoming: the next 3 active sends across everything, soonest first.
  const allChips = [...chipsByProject.values()].flat();
  const upcoming = allChips
    .filter((c) => c.status === "active" && c.nextAt)
    .sort((a, b) => (a.nextAt! < b.nextAt! ? -1 : 1))
    .slice(0, 3);
  const activeCount = allChips.filter((c) => c.status === "active").length;

  return (
    <PageShell width="narrow">
      {/* Migrates an anonymous localStorage draft into a saved project on arrival. */}
      <ImportDraftOnLogin />

      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Your projects</h1>
        <div className="flex items-center gap-2">
          <NewListingButton />
          <NewProjectButton />
        </div>
      </div>

      {/* Quick-start campaigns — one click drops the user into a pre-shaped
          recipe (New Listing / Newsletter email, New Listing Socials). */}
      <CampaignQuickStart surface="all" variant="bare" />

      {/* B4 — signed-in home base. The logo lands signed-in users here; this
          header doubles as a hub into the rest of the toolset. */}
      <nav
        aria-label="Quick links"
        className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-400"
      >
        <Link href="/charts" className="hover:text-gulf-teal">
          Charts
        </Link>
        <span aria-hidden className="text-white/15">
          ·
        </span>
        <Link href="/r" className="hover:text-gulf-teal">
          Search
        </Link>
        <span aria-hidden className="text-white/15">
          ·
        </span>
        <Link href="/alerts" className="hover:text-gulf-teal">
          Buyer-intent alerts
        </Link>
        <span aria-hidden className="text-white/15">
          ·
        </span>
        <Link href="/contacts" className="hover:text-gulf-teal">
          Contacts
        </Link>
      </nav>

      {/* What's running — the reason this page exists. */}
      <div className="mb-6 rounded-xl border border-white/10 bg-[#0d1e2b]/80 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Running now</p>
        {activeCount === 0 ? (
          <p className="mt-1 text-sm text-gray-400">
            Nothing scheduled yet. Open a project&apos;s Email tool and schedule a send — it shows
            up here with its next date.
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-white">
              {activeCount} active {activeCount === 1 ? "send" : "sends"}
            </p>
            <ul className="mt-2 flex flex-col gap-1">
              {upcoming.map((c) => (
                <li key={c.key}>
                  <Link
                    href={c.href}
                    className="text-xs text-gray-300 transition-colors hover:text-gulf-teal"
                  >
                    {c.kind === "email" ? "✉" : "📣"} {c.line}
                    {chipTime(c.nextAt) ? ` · next ${chipTime(c.nextAt)}` : ""}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* Project cards — title + scope + built count + schedule chips. */}
      {projects.length === 0 ? (
        <p className="text-sm text-gray-400">
          No projects yet. File figures, charts, and answers as you browse, then save them here.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {projects.map((p) => {
            const scope = inferScopeFromItems(p.items ?? []);
            const scopeLabel = scope.place ?? scope.zip ?? null;
            const chips = chipsByProject.get(p.id) ?? [];
            const built = builtByProject.get(p.id) ?? 0;
            return (
              <li
                key={p.id}
                className="rounded-xl border border-white/10 bg-[#0d1e2b]/80 px-4 py-3 transition-colors hover:border-gulf-teal/40"
              >
                <div className="flex items-center justify-between gap-3">
                  <Link
                    href={projectHome(p.id)}
                    className="min-w-0 flex-1 text-sm font-medium text-white hover:text-gulf-teal"
                  >
                    <span className="truncate">{p.title || "Untitled project"}</span>
                  </Link>
                  <span className="shrink-0 text-xs text-gray-500">
                    {scopeLabel ? `${scopeLabel} · ` : ""}
                    {built > 0
                      ? `${built} ${built === 1 ? "email" : "emails"} built`
                      : `${p.items?.length ?? 0} ${p.items?.length === 1 ? "item" : "items"}`}
                  </span>
                </div>
                {chips.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-1">
                    {chips.map((c) => (
                      <li key={c.key}>
                        <Link
                          href={c.href}
                          className={`inline-flex flex-wrap items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                            c.status === "active"
                              ? "border-gulf-teal/40 text-gray-200 hover:border-gulf-teal hover:text-white"
                              : "border-white/10 text-gray-500 hover:border-white/30"
                          }`}
                          title="Click to tailor this schedule"
                        >
                          <span aria-hidden>{c.kind === "email" ? "✉" : "📣"}</span>
                          <span>{c.line}</span>
                          {c.audience && <span className="text-gray-500">→ {c.audience}</span>}
                          {c.status === "paused" ? (
                            <span className="text-amber-300/70">paused</span>
                          ) : chipTime(c.nextAt) ? (
                            <span className="text-gray-500">· next {chipTime(c.nextAt)}</span>
                          ) : null}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </PageShell>
  );
}
