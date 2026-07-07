import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { WatchClient, type WatchConfig, type WatchFeedEvent } from "./WatchClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Watch" };

const WATCH_COLS =
  "watch_enabled, watch_mode, watch_lat, watch_lon, watch_radius_miles, watch_price_cut_threshold_pct, watch_beds, watch_baths, watch_sqft, watch_price, watch_price_is_estimate";
const WATCH_TYPES = ["nearby_new_listing", "nearby_price_cut", "nearby_sale"];

export default async function ProjectWatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createClient(await cookies());
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect("/login");

  const { data: project } = await supabase
    .from("projects")
    .select(`id, title, subject_address, ${WATCH_COLS}`)
    .eq("id", id)
    .maybeSingle();
  if (!project) notFound();

  const { data: events } = await supabase
    .from("project_events")
    .select("id, event_type, event_date, distance_miles, ai_summary, created_at")
    .eq("project_id", id)
    .in("event_type", WATCH_TYPES)
    .is("dismissed_at", null)
    .order("created_at", { ascending: false })
    .limit(200);

  const config: WatchConfig = {
    watch_enabled: project.watch_enabled,
    watch_mode: project.watch_mode,
    watch_radius_miles: project.watch_radius_miles,
    watch_price_cut_threshold_pct: project.watch_price_cut_threshold_pct,
    watch_beds: project.watch_beds,
    watch_baths: project.watch_baths,
    watch_sqft: project.watch_sqft,
    watch_price: project.watch_price,
    watch_price_is_estimate: project.watch_price_is_estimate,
    has_location: project.watch_lat != null && project.watch_lon != null,
  };

  return (
    <WatchClient
      projectId={id}
      subjectAddress={project.subject_address ?? null}
      initialConfig={config}
      initialEvents={(events ?? []) as WatchFeedEvent[]}
    />
  );
}
