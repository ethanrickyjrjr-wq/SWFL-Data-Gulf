import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { extractBrandTheme } from "@/lib/deliverable/brand-theme";
import type { BrandTheme } from "@/scripts/email/types";
import {
  renderSocialImage,
  isSocialFormat,
  type SocialModel,
} from "@/lib/social/render-social-image";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/social/render/[format]?project_id=…&headline=…&stat_value=…&stat_label=…
 *   &stat_caption=…&source=…&as_of=…&freshness_token=…
 *
 * Authed, project-OWNED PNG render. Returns `image/png` (the branded, watermarked
 * social card) at the requested platform format
 * (`square|portrait|landscape|story`).
 *
 * Auth mirrors the deliverable/project routes: cookie/RLS client proves
 * ownership — a non-owner (or missing project) resolves to no row → 404. The
 * brand theme is read server-side from the owned `projects.branding`, so a caller
 * cannot spoof another tenant's brand.
 *
 * Content (headline / one stat / provenance) rides in query params so the cron
 * worker (build 04) and the workspace can drive it without a body on a GET. The
 * no-invention moat lives in the renderer: an absent `stat_value` omits the stat
 * block entirely — never a placeholder.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ format: string }> }) {
  const { format } = await params;
  if (!isSocialFormat(format)) {
    return NextResponse.json({ error: "unknown_format" }, { status: 400 });
  }

  const url = new URL(req.url);
  const projectId = url.searchParams.get("project_id");
  if (!projectId) {
    return NextResponse.json({ error: "project_id required" }, { status: 400 });
  }

  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // RLS proves ownership: a non-owner resolves to no row → 404.
  const { data: project } = await supabase
    .from("projects")
    .select("id, branding")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  const brand = extractBrandTheme((project.branding as Record<string, unknown> | null) ?? null);
  const theme: BrandTheme | null = brand
    ? { primary: brand.primary, accent: brand.accent, logoUrl: brand.logoUrl }
    : null;

  const headline = url.searchParams.get("headline")?.trim() || "SWFL Market Pulse";
  const statValue = url.searchParams.get("stat_value"); // may be null → stat omitted (moat)
  const statLabel = url.searchParams.get("stat_label")?.trim() || "";
  const statCaption = url.searchParams.get("stat_caption")?.trim() || undefined;
  const source = url.searchParams.get("source")?.trim() || undefined;
  const asOf = url.searchParams.get("as_of")?.trim() || undefined;
  const freshnessToken = url.searchParams.get("freshness_token")?.trim() || undefined;

  const model: SocialModel = {
    headline,
    ...(statValue != null
      ? { stat: { label: statLabel, value: statValue, caption: statCaption } }
      : {}),
    ...(source ? { source } : {}),
    ...(asOf ? { as_of: asOf } : {}),
    ...(freshnessToken ? { freshness_token: freshnessToken } : {}),
  };

  let png: Buffer;
  try {
    png = await renderSocialImage({ model, theme, format });
  } catch (e) {
    console.error("[social/render] render failed:", e);
    return NextResponse.json({ error: "render_failed" }, { status: 500 });
  }

  return new NextResponse(new Uint8Array(png), {
    status: 200,
    headers: {
      "content-type": "image/png",
      "cache-control": "private, max-age=0, must-revalidate",
      "content-length": String(png.length),
    },
  });
}
