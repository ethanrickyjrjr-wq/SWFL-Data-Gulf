// app/api/projects/[id]/watch/route.ts
//
// Property Watch config + feed (spec 2026-07-07-property-watch-design.md).
//   GET   — the project's watch config + its own nearby_* event feed (reverse-chron).
//   POST  — enable/configure watch: geocode the subject address ONCE (watch_lat/lon), resolve the
//           address_key, auto-fill the subject spec from data_lake.listing_state when the tracked
//           address is itself an active listing, else take the spec from the body (four-lane lane 4).
//   PATCH — adjust config (radius / threshold / mode) or turn watch off. Never re-geocodes.
//
// Ownership via the owner-RLS'd projects table (cookie client). The data_lake auto-fill read uses a
// service-role client (data_lake is service_role-only) — the address_key is a public listing key, not
// user-private data. The daily cron (watch-scan.mts) is what actually reads these columns.

import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
// KNOWN-DEBT: data_lake.listing_state lives in the data_lake schema (typed client is public-only),
// so the subject-spec auto-fill read uses the untyped service-role hatch. Allowlisted in
// verification/supabase-untyped-allowlist.json. Same pattern as scripts/project-feed/lifecycle-nudges.mts.
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";
import { geocodeAddress } from "@/refinery/lib/geocode.mts";
import { addressKey } from "@/lib/listings/address-key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Db = ReturnType<typeof createClient>;

const WATCH_TYPES = ["nearby_new_listing", "nearby_price_cut", "nearby_sale"];

const WATCH_COLS =
  "watch_enabled, watch_mode, watch_lat, watch_lon, watch_radius_miles, watch_price_cut_threshold_pct, watch_beds, watch_baths, watch_sqft, watch_price, watch_price_is_estimate";

async function ownedProject(db: Db, id: string) {
  const { data } = await db
    .from("projects")
    .select(`id, subject_address, ${WATCH_COLS}`)
    .eq("id", id)
    .maybeSingle();
  return data;
}

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Look up the tracked address's own listing_state row (any source) for the subject spec auto-fill. */
async function autoFillSpec(address_key: string): Promise<{
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  price: number | null;
} | null> {
  try {
    const lake = createServiceRoleClientUntyped();
    const { data } = await lake
      .schema("data_lake")
      .from("listing_state")
      .select("beds, baths, sqft, list_price")
      .eq("address_key", address_key)
      .eq("sale_or_rent", "sale")
      .order("last_seen", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    const r = data as {
      beds: number | null;
      baths: number | null;
      sqft: number | null;
      list_price: number | null;
    };
    return { beds: r.beds, baths: r.baths, sqft: r.sqft, price: r.list_price };
  } catch {
    return null; // fail closed → the form's values are used (never blocks the enable)
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = createClient(await cookies());
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const project = await ownedProject(db, id);
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { data: events } = await db
    .from("project_events")
    .select("id, event_type, event_date, distance_miles, ai_summary, notify_user, created_at")
    .eq("project_id", id)
    .in("event_type", WATCH_TYPES)
    .is("dismissed_at", null)
    .order("created_at", { ascending: false })
    .limit(200);

  return NextResponse.json({ config: project, events: events ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = createClient(await cookies());
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const project = await ownedProject(db, id);
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const mode = body?.mode === "selling" || body?.mode === "watching" ? body.mode : "watching";
  const radius = num(body?.radius_miles);
  const threshold = num(body?.price_cut_threshold_pct);

  // Location is required — a watch with no point can't be radius-scanned. Geocode the tracked
  // address ONCE here so the daily cron never re-geocodes (arm-time resolution pattern).
  if (!project.subject_address) {
    return NextResponse.json({ error: "project has no subject_address to watch" }, { status: 422 });
  }
  const geo = await geocodeAddress(project.subject_address);
  if (!geo) {
    return NextResponse.json(
      { error: "could not resolve the tracked address to a location" },
      { status: 422 },
    );
  }

  // Auto-fill the subject spec from the lake when the tracked address is itself a listing; else the
  // body supplies it (lane 4). watch_price_is_estimate marks the lane-4 case.
  const street = project.subject_address.split(",")[0]?.trim() ?? "";
  const address_key = street && geo.zip ? addressKey(street, geo.zip) : null;
  const filled = address_key ? await autoFillSpec(address_key) : null;

  const spec = filled ?? {
    beds: num(body?.beds),
    baths: num(body?.baths),
    sqft: num(body?.sqft),
    price: num(body?.price),
  };

  const { data: updated, error } = await db
    .from("projects")
    .update({
      watch_enabled: true,
      watch_mode: mode,
      watch_lat: geo.lat,
      watch_lon: geo.lon,
      watch_radius_miles: radius != null && radius > 0 ? radius : 0.5,
      watch_price_cut_threshold_pct: threshold != null && threshold >= 0 ? threshold : 2,
      watch_beds: spec.beds,
      watch_baths: spec.baths,
      watch_sqft: spec.sqft,
      watch_price: spec.price,
      watch_price_is_estimate: filled == null,
    })
    .eq("id", id)
    .select(WATCH_COLS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ config: updated, auto_filled: filled != null }, { status: 200 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = createClient(await cookies());
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await ownedProject(db, id)))
    return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const patch: {
    watch_enabled?: boolean;
    watch_mode?: string;
    watch_radius_miles?: number;
    watch_price_cut_threshold_pct?: number;
  } = {};
  if (typeof body?.watch_enabled === "boolean") patch.watch_enabled = body.watch_enabled;
  if (body?.mode === "selling" || body?.mode === "watching") patch.watch_mode = body.mode;
  const radius = num(body?.radius_miles);
  if (radius != null && radius > 0) patch.watch_radius_miles = radius;
  const threshold = num(body?.price_cut_threshold_pct);
  if (threshold != null && threshold >= 0) patch.watch_price_cut_threshold_pct = threshold;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "no valid fields to update" }, { status: 422 });
  }

  const { data: updated, error } = await db
    .from("projects")
    .update(patch)
    .eq("id", id)
    .select(WATCH_COLS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ config: updated });
}
