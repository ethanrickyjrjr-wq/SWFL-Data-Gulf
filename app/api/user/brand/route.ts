import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { logActivity } from "@/lib/project/activity";

export const runtime = "nodejs";

const AGENT_FIELDS = ["agent_name", "photo_url", "license", "brokerage"] as const;
type AgentField = (typeof AGENT_FIELDS)[number];

async function authed() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/**
 * GET /api/user/brand — returns the signed-in user's brand profile.
 * Used to pre-fill BrandingBlock when a project has no branding yet
 * (funnel arrivals whose brand was scraped at prospect time land here).
 */
export async function GET(_req: NextRequest) {
  const { supabase, user } = await authed();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("user_brand_profiles")
    .select("agent_name, photo_url, license, brokerage, primary_color, accent_color, logo_url")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json(data ?? {});
}

/**
 * PATCH /api/user/brand — upserts agent identity fields into the user's brand profile.
 * Only the four BrandingBlock fields are written; theme fields (colors, logo) are
 * managed separately (scraped at funnel time, not edited here).
 */
export async function PATCH(req: NextRequest) {
  const { supabase, user } = await authed();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of AGENT_FIELDS) {
    if (key in body) {
      const v = body[key as AgentField];
      update[key] = typeof v === "string" && v.trim() ? v : null;
    }
  }

  const { error } = await supabase
    .from("user_brand_profiles")
    .upsert({ user_id: user.id, ...update }, { onConflict: "user_id" });

  if (error) return NextResponse.json({ error: "update failed" }, { status: 500 });

  // If the client passes a project_id, log branding_changed for that project so the AI
  // knows the agent identity updated. Global-only saves (no project_id) don't log here —
  // per-project branding is live-read from projects.branding on every context build.
  const projectId = typeof body?.project_id === "string" ? body.project_id : null;
  if (projectId) {
    const agentName = typeof update.agent_name === "string" ? update.agent_name : null;
    const brokerage = typeof update.brokerage === "string" ? update.brokerage : null;
    await logActivity(supabase, {
      projectId,
      type: "branding_changed",
      actor: "user",
      summary: [
        "Branding updated",
        agentName ? `agent: ${agentName}` : null,
        brokerage ? `brokerage: ${brokerage}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      detail: { agent_name: agentName, brokerage },
    });
  }

  return NextResponse.json({ ok: true });
}
