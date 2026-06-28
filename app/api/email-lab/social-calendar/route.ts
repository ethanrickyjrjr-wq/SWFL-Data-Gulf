// POST { scope?, weekOf? } -> { calendar }. Thin wrapper over buildWeek. No auth
// (matches /api/email-lab/ai — builds are free, send is the paywall). Writes nothing.
import { NextRequest, NextResponse } from "next/server";
import { buildWeek } from "@/lib/email/social-calendar/build-week";
import { mondayOf } from "@/lib/email/social-calendar/week";
import type { BuildScope } from "@/lib/email/build-doc";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { scope?: BuildScope; weekOf?: string };
  const weekOf = body.weekOf ?? mondayOf(new Date());
  const calendar = await buildWeek(body.scope, weekOf);
  return NextResponse.json({ calendar });
}
