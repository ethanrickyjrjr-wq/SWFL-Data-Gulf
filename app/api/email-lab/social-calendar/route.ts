// POST { scope?, weekOf?, platforms?, goal?, tone? } -> { calendar }. Thin wrapper over
// buildWeek. No auth (matches /api/email-lab/ai — builds are free, send is the paywall).
// Writes nothing. platforms/goal/tone are whitelisted here so a malformed body can never
// key variants off junk or crash buildWeek.
import { NextRequest, NextResponse } from "next/server";
import { buildWeek } from "@/lib/email/social-calendar/build-week";
import { mondayOf } from "@/lib/email/social-calendar/week";
import type { BuildScope } from "@/lib/email/build-doc";
import type { Platform } from "@/lib/social/types";
import type { GoalTone, SocialGoal, SocialTone } from "@/lib/email/social-calendar/types";

export const runtime = "nodejs";

// The 5 PUBLISHABLE platforms (schedule targets) — variant request must whitelist to these.
const PUBLISHABLE: readonly Platform[] = [
  "x",
  "facebook",
  "instagram",
  "linkedin",
  "google_business",
];
const GOALS: readonly SocialGoal[] = ["awareness", "leads", "engagement"];
const TONES: readonly SocialTone[] = ["professional", "casual", "bold"];

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    scope?: BuildScope;
    weekOf?: string;
    platforms?: unknown;
    goal?: unknown;
    tone?: unknown;
    campaign?: unknown;
  };
  const weekOf = body.weekOf ?? mondayOf(new Date());

  const platforms = Array.isArray(body.platforms)
    ? (body.platforms.filter((p): p is Platform =>
        PUBLISHABLE.includes(p as Platform),
      ) as Platform[])
    : [];
  const goalTone: GoalTone | undefined =
    GOALS.includes(body.goal as SocialGoal) && TONES.includes(body.tone as SocialTone)
      ? { goal: body.goal as SocialGoal, tone: body.tone as SocialTone }
      : undefined;

  // New Listing Socials launch week — whitelist the one known campaign key; the
  // subject listing is chosen server-side (top-ranked) so a body can't inject one.
  const campaign = body.campaign === "new-listing" ? {} : undefined;

  const opts =
    platforms.length || goalTone || campaign ? { platforms, goalTone, campaign } : undefined;
  const calendar = await buildWeek(body.scope, weekOf, opts);
  return NextResponse.json({ calendar });
}
