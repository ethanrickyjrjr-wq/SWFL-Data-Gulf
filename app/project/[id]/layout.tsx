import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { ToolFrame } from "./ToolFrame";

/**
 * Cockpit D1 — per-project tool frame (Overview · Email · Social). Nested under
 * the persistent project-area layout (rail + search live THERE, not here), so
 * switching tools swaps only the child page: rail, AI, and this switcher never
 * remount — this layout itself doesn't re-run on a sibling-tab click either
 * (same `id` segment), so this DB read only ever runs on a fresh visit to the
 * project. ToolFrame (client) carries the value live across in-session saves.
 *
 * Seeds the Email tab's `?did=` so leaving Email (Watch/Social/Overview) and
 * clicking back reopens the SAME saved doc instead of a fresh/blank one — the
 * bug this fixes: the tab switcher used to link to the bare project URL with
 * no did, so the arrival planner had nothing to load and started over every
 * time. "Most recent by data_as_of" is the deliberate tie-break for projects
 * with more than one deliverable.
 */
export default async function ProjectToolLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createClient(await cookies());
  const { data: lastDeliverable } = await supabase
    .from("deliverables")
    .select("id")
    .eq("project_id", id)
    .eq("template", "block-canvas")
    .order("data_as_of", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (
    <ToolFrame id={id} initialLastDid={lastDeliverable?.id ?? null}>
      {children}
    </ToolFrame>
  );
}
