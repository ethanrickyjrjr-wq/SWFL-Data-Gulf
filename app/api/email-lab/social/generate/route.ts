// POST — two modes on the social composer:
//   Fill (today):  { scope?, skeleton, platforms?, goalTone? } -> CanvasFillResult
//   Author (new):  { scope?, projectId?, prompt, format?, author:true, platforms?, goalTone?, branding? }
//                  -> { design, caption, hashtags, variants, webSources }
// No auth — builds are free, send is the paywall (mirrors /api/email-lab/social-calendar/route.ts).
// Writes nothing. Fill: skeleton must be non-empty. Author: prompt must be non-empty.
import { NextResponse, type NextRequest } from "next/server";
import { buildSocialCanvasFill } from "@/lib/email/social-calendar/build-canvas-fill";
import { authorSocialPost } from "@/lib/social/design/author";
import { loadProjectUploadsText } from "@/lib/project/uploads-text";
import { isSocialFormat } from "@/lib/social/formats";
import type { BuildScope } from "@/lib/email/build-doc";
import type { Platform } from "@/lib/social/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const scope = body?.scope as BuildScope | undefined;
  const platforms = Array.isArray(body?.platforms) ? (body.platforms as Platform[]) : undefined;
  const goalTone = body?.goalTone;

  // ── Author: compose a whole post (layout + cited copy) from one sentence ──
  if (body?.author === true) {
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) {
      return NextResponse.json({ error: "no prompt" }, { status: 400 });
    }
    const projectId = typeof body?.projectId === "string" ? body.projectId : undefined;
    const format = isSocialFormat(body?.format) ? body.format : undefined;
    const branding =
      body?.branding && typeof body.branding === "object"
        ? (body.branding as Record<string, string>)
        : undefined;
    // Equal-source: the project's uploaded files ride alongside the lake + web feed.
    const filesText = projectId ? await loadProjectUploadsText(projectId) : undefined;
    const result = await authorSocialPost(scope, prompt, {
      branding,
      format,
      filesText,
      platforms,
      goalTone,
    });
    if (!result) return NextResponse.json({ error: "author_failed" }, { status: 502 });
    return NextResponse.json(result);
  }

  // ── Fill: write cited copy into a hand-built canvas (unchanged) ──
  const skeleton = (body?.skeleton ?? {}) as Record<string, Record<string, string>>;
  if (Object.keys(skeleton).length === 0) {
    return NextResponse.json({ error: "no elements to fill" }, { status: 400 });
  }
  const result = await buildSocialCanvasFill(scope, skeleton, { platforms, goalTone });
  if (!result) return NextResponse.json({ error: "fill_failed" }, { status: 502 });
  return NextResponse.json(result);
}
