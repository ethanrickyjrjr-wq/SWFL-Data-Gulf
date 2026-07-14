// lib/social/design/chart-attach.ts
//
// The ONE producer that turns a prompt into an attachable chart for the social
// canvas — shared by the manual "Add Chart" endpoint (Build 2a) and, later, the
// AI author (Build 2b). Path: buildChartForQuestion (moat-safe; model never writes
// a number) → chartSpecToEmailSvg (the shared bridge, same SVG email uses) →
// svgToPng → host in email-media → COHERENCE guard (drop, never block) → {spec, src}.
import { BRAND } from "@/lib/brand/tokens";
import { buildChartForQuestion } from "@/lib/assistant/chart-for-question";
import { chartSpecToEmailSvg } from "@/lib/charts/spec-to-image";
import { svgToPng } from "@/lib/email/chart-image";
import { hostSocialChartPng } from "@/lib/social/chart-image";
import {
  assertHeroChartCoherence,
  parseHeroFigure,
  chartMagnitudeFromSpec,
  type HeroFigure,
} from "@/lib/deliverable/chart-coherence";
import type { SocialDesign } from "./types";
import type { ChartSpec } from "@/components/charts/registry/chart-spec";

/** The canvas's headline figure for the coherence check. A social post has no
 *  STRUCTURAL hero the way an email doc does, so we resolve it deterministically:
 *  the stat element with the largest `valueFontSize` (ties broken by document
 *  order — the first such stat) whose value parses as a real figure. No parseable
 *  stat → null → assertHeroChartCoherence treats it as coherent (safe default:
 *  a post without a headline number can't contradict a chart). */
export function resolveSocialHero(design: SocialDesign): HeroFigure | null {
  const stats = design.elements
    .filter(
      (e): e is Extract<SocialDesign["elements"][number], { type: "stat" }> => e.type === "stat",
    )
    .slice()
    .sort((a, b) => b.valueFontSize - a.valueFontSize);
  for (const s of stats) {
    const parsed = parseHeroFigure(s.value);
    if (parsed) return parsed;
  }
  return null;
}

/** Compare a built chart against the canvas headline, reusing the ONE shared
 *  magnitude reader + comparator (never a second reading — [[shared-concept-one-authority]]). */
export function evaluateChartCoherence(
  spec: ChartSpec,
  hero: HeroFigure | null,
): { coherent: true } | { coherent: false; reason: string } {
  const magnitude = chartMagnitudeFromSpec(spec);
  return assertHeroChartCoherence({ hero, chart: magnitude });
}

export interface SocialChartAttachArgs {
  prompt: string;
  origin: string;
  hero: HeroFigure | null;
  key: string;
  zips?: string[];
}

/** Build → rasterize → host → coherence-gate. Returns the attachable {spec, src},
 *  or a drop+reason (incoherent), or null (nothing chartable / any error — the
 *  compose is NEVER blocked, RULE 0.7). */
export async function buildSocialChartAttach(
  args: SocialChartAttachArgs,
): Promise<{ spec: ChartSpec; src: string } | { dropped: true; reason: string } | null> {
  try {
    const cfq = await buildChartForQuestion(args.prompt, args.origin, { zips: args.zips });
    if (!cfq?.chart) return null;

    const coherence = evaluateChartCoherence(cfq.chart, args.hero);
    if (!coherence.coherent) return { dropped: true, reason: coherence.reason };

    // The chart's own accent when it has one, else the BRAND accent — never a
    // hand-typed teal. This line read `?? "#0ea5b7"` until 07/14/2026: a teal that
    // is not our teal, copied into four files. See lib/brand/tokens.ts.
    const accent = (cfq.chart.theme?.accent as string | undefined) ?? BRAND.teal;
    const svg = await chartSpecToEmailSvg(cfq.chart, accent);
    if (!svg) return null;

    const png = svgToPng(svg);
    const src = await hostSocialChartPng(args.key, png);
    return { spec: cfq.chart, src };
  } catch {
    return null;
  }
}
