import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { BRAIN_CATALOG } from "@/refinery/packs/catalog.mts";
import { ProjectsRail } from "./ProjectsRail";
import { SelectedProjectProvider } from "./SelectedProjectContext";
import {
  groupProjects,
  toCockpitProjects,
  type ProjectRowInput,
} from "@/lib/project/group-projects";
import { ProjectSearch } from "@/components/project/ProjectSearch";
import type { SearchEntry } from "./[id]/workspace/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Persistent project-area layout (Piece 1 §A/§F — the architecture spine). Holds the
 * left projects rail and the pinned bottom search bar; `{children}` is the selected
 * project's world (or the list landing). Clicking a project navigates to its own URL
 * `/project/[id]`, but because the rail + search live HERE they do not unmount — only
 * the right side swaps, and the root-mounted AI (`app/layout.tsx`) keeps its context.
 *
 * HARD GUARD: never add `key={pathname}` here — it would remount the subtree (and,
 * combined with the root AI, defeat the "persistent, prepared assistant" premise).
 * The AI is NOT mounted in this layout; it persists from the root.
 */
export default async function ProjectAreaLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Unauthenticated: render children plain — the child page redirects to /login.
  if (!user) return <>{children}</>;

  const [{ data }, { data: delivRows }] = await Promise.all([
    supabase
      .from("projects")
      // subject_address/subject_area ride so a fresh listing project still gets
      // its city subgroup (toCockpitProjects' scope fallback — same fix as the hub).
      .select("id, title, kind, items, updated_at, subject_address, subject_area")
      .order("updated_at", { ascending: false }),
    // Newest-first so the fold below keeps the first (= most recent) block-canvas
    // row per project — same rule the tool-switcher fix (layout.tsx under [id])
    // uses. Without a remembered did, clicking a rail row into a project with a
    // built email dropped you onto a fresh/blank canvas every time.
    supabase
      .from("deliverables")
      .select("id, project_id, template")
      .order("data_as_of", { ascending: false }),
  ]);
  const lastDidByProject = new Map<string, string>();
  for (const d of delivRows ?? []) {
    if (d.template === "block-canvas" && !lastDidByProject.has(d.project_id)) {
      lastDidByProject.set(d.project_id, d.id);
    }
  }

  // Rail sections: same type→city grouping as the hub (spec 2026-07-16 §3).
  // Only project_id is read from the schedules — the rail needs "has a
  // schedule" for the Campaigns section, not the chip text.
  const [{ data: emailIds }, { data: socialIds }] = await Promise.all([
    supabase.from("email_schedules").select("project_id").in("status", ["active", "paused"]),
    supabase.from("social_schedules").select("project_id").in("status", ["active", "paused"]),
  ]);
  const scheduledIds = new Set<string>(
    [...(emailIds ?? []), ...(socialIds ?? [])]
      .map((r) => r.project_id as string | null)
      .filter((x): x is string => !!x),
  );
  const sections = groupProjects(
    toCockpitProjects((data as ProjectRowInput[] | null) ?? [], {
      scheduledIds,
      lastDidByProject,
    }),
  );

  // Bottom-bar search index (§F): reports from BRAIN_CATALOG + recent titled saved
  // charts. Built server-side so the client filters a plain array (no catalog bundle).
  const reportEntries: SearchEntry[] = BRAIN_CATALOG.map((b) => ({
    kind: "report",
    ref: b.id,
    label: b.id,
    haystack: `${b.id} ${b.domain} ${b.scope}`.toLowerCase(),
  }));
  const { data: chartRows } = await supabase
    .from("saved_charts")
    .select("id, chart_block")
    .order("created_at", { ascending: false })
    .limit(200);
  const chartEntries: SearchEntry[] = (
    (chartRows as { id: string; chart_block: { title?: string } | null }[] | null) ?? []
  ).flatMap((r) => {
    const title = r.chart_block?.title;
    return title
      ? [{ kind: "chart" as const, ref: r.id, label: title, haystack: title.toLowerCase() }]
      : [];
  });
  const searchIndex = [...reportEntries, ...chartEntries];

  // Rows arrive updated_at desc, so rows[0] is the most-recent project — the
  // hub dashboard's default selection (same default the old center list used).
  const initialSelectedId = ((data as ProjectRowInput[] | null) ?? [])[0]?.id ?? null;

  return (
    <SelectedProjectProvider initialId={initialSelectedId}>
      <div className="flex w-full">
        <ProjectsRail sections={sections} />
        <div className="flex min-h-[calc(100dvh-3.5rem)] min-w-0 flex-1 flex-col">
          <div className="flex-1">{children}</div>
          <ProjectSearch entries={searchIndex} />
        </div>
      </div>
    </SelectedProjectProvider>
  );
}
