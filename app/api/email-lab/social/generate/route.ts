// POST { scope?, skeleton, platforms?, goalTone? } -> CanvasFillResult.
// No auth — builds are free, send is the paywall (mirrors /api/email-lab/social-calendar/route.ts).
// Writes nothing. skeleton must be non-empty (at least one fillable element).
import { NextResponse, type NextRequest } from "next/server";
import { buildSocialCanvasFill } from "@/lib/email/social-calendar/build-canvas-fill";
import type { BuildScope } from "@/lib/email/build-doc";
import type { Platform } from "@/lib/social/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const scope = body?.scope as BuildScope | undefined;
  const skeleton = (body?.skeleton ?? {}) as Record<string, Record<string, string>>;
  const platforms = Array.isArray(body?.platforms) ? (body.platforms as Platform[]) : undefined;
  const goalTone = body?.goalTone;
  if (Object.keys(skeleton).length === 0) {
    return NextResponse.json({ error: "no elements to fill" }, { status: 400 });
  }
  const result = await buildSocialCanvasFill(scope, skeleton, { platforms, goalTone });
  if (!result) return NextResponse.json({ error: "fill_failed" }, { status: 502 });
  return NextResponse.json(result);
}
