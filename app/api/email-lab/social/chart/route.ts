// app/api/email-lab/social/chart/route.ts
//
// Add-Chart for the social composer. Builds a REAL chart (buildChartForQuestion —
// model never writes a number), rasterizes it, hosts it in email-media (CORS-safe
// for the Konva canvas), runs the headline<->chart coherence guard, and returns
// {spec, src} or a drop+reason. Writes only the chart PNG. Unauthed — builds are
// free (mirrors /api/email-lab/social/generate).
import { NextResponse, type NextRequest } from "next/server";
import { buildSocialChartAttach, resolveSocialHero } from "@/lib/social/design/chart-attach";
import type { HeroFigure } from "@/lib/deliverable/chart-coherence";
import type { SocialDesign } from "@/lib/social/design/types";
import type { BuildScope } from "@/lib/email/build-doc";

export const runtime = "nodejs";
export const maxDuration = 60;

export interface ParsedChartRequest {
  prompt: string;
  scope?: BuildScope;
  zips?: string[];
  hero: HeroFigure | null;
}

function isDesign(d: unknown): d is SocialDesign {
  return !!d && typeof d === "object" && Array.isArray((d as SocialDesign).elements);
}

/** Pure body parser — exported so tests assert the contract without a live build. */
export function parseChartRequest(body: unknown): ParsedChartRequest | null {
  const b = (body ?? {}) as Record<string, unknown>;
  const prompt = typeof b.prompt === "string" ? b.prompt.trim() : "";
  if (!prompt) return null;
  const scope = b.scope as BuildScope | undefined;
  const zips = Array.isArray(b.zips) ? (b.zips as string[]) : undefined;
  const hero = isDesign(b.design) ? resolveSocialHero(b.design) : null;
  return { prompt, scope, zips, hero };
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = parseChartRequest(body);
  if (!parsed) return NextResponse.json({ error: "no prompt" }, { status: 400 });

  const key = `lab/chart/${crypto.randomUUID()}.png`;
  const result = await buildSocialChartAttach({
    prompt: parsed.prompt,
    origin: req.nextUrl.origin,
    hero: parsed.hero,
    key,
    zips: parsed.zips,
  });

  if (!result) return NextResponse.json({ error: "no_chart" }, { status: 502 });
  if ("dropped" in result) return NextResponse.json({ dropped: true, reason: result.reason });
  return NextResponse.json({ spec: result.spec, src: result.src });
}
