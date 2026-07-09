// lib/email/variant-results.ts
//
// Pure aggregation of a split-send's cohort assignment (derived from
// contactIds + cohortIndex, NOT from a "sent" event — deterministic and
// reproducible) plus opened/clicked email_events rows (grouped by the
// `variant` tag) into per-cohort stats, gated by a real minimum-sample size
// and a two-proportion z-test before ever naming a leader. No invented
// confidence: a "winner" is a real statistical claim or it isn't claimed.

import { cohortIndex } from "./variant-cohort";

export const MIN_SAMPLE_PER_COHORT = 50;
const Z_95 = 1.96;

export interface VariantEventRow {
  variant: string | null;
  event: string;
}

export interface VariantStat {
  variant: number;
  label: string;
  sent: number;
  opened: number;
  clicked: number;
  openRate: number;
  clickRate: number;
}

export interface VariantWinner {
  variant: number;
  liftPct: number;
  zScore: number;
}

export interface VariantResultsOutput {
  cohorts: VariantStat[];
  readyToCallWinner: boolean;
  minSample: number;
  winner: VariantWinner | null;
}

/** Two-proportion z-test on click rate, pooled-variance form. Returns 0 (never
 *  significant) when either cohort has zero sends. */
function twoProportionZ(clicksA: number, sentA: number, clicksB: number, sentB: number): number {
  if (sentA === 0 || sentB === 0) return 0;
  const pA = clicksA / sentA;
  const pB = clicksB / sentB;
  const pPool = (clicksA + clicksB) / (sentA + sentB);
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / sentA + 1 / sentB));
  if (se === 0) return 0;
  return (pB - pA) / se;
}

export function variantResults(args: {
  contactIds: string[];
  variantCount: number;
  labels: { subjects?: string[]; ctas?: string[] };
  events: VariantEventRow[];
}): VariantResultsOutput {
  const { contactIds, variantCount, events, labels } = args;

  const sentByVariant = new Array<number>(variantCount).fill(0);
  for (const id of contactIds) sentByVariant[cohortIndex(id, variantCount)] += 1;

  const openedByVariant = new Array<number>(variantCount).fill(0);
  const clickedByVariant = new Array<number>(variantCount).fill(0);
  for (const e of events) {
    if (e.variant === null) continue;
    const v = Number(e.variant);
    if (!Number.isInteger(v) || v < 0 || v >= variantCount) continue;
    if (e.event === "opened") openedByVariant[v] += 1;
    if (e.event === "clicked") clickedByVariant[v] += 1;
  }

  // A cohort with 0 recipients (small audience, high N) is SKIPPED, not shipped
  // as a fake 0% result — a real result needs at least one recipient to mean
  // anything; "0 sent, 0% clicked" would misrepresent absence as a real rate.
  const cohorts: VariantStat[] = Array.from({ length: variantCount }, (_, i) => {
    const sent = sentByVariant[i];
    const opened = openedByVariant[i];
    const clicked = clickedByVariant[i];
    return {
      variant: i,
      label: labels.subjects?.[i] ?? labels.ctas?.[i] ?? `Variant ${i + 1}`,
      sent,
      opened,
      clicked,
      openRate: sent > 0 ? opened / sent : 0,
      clickRate: sent > 0 ? clicked / sent : 0,
    };
  }).filter((c) => c.sent > 0);

  const readyToCallWinner =
    cohorts.length >= 2 && cohorts.every((c) => c.sent >= MIN_SAMPLE_PER_COHORT);

  let winner: VariantWinner | null = null;
  if (readyToCallWinner) {
    const sorted = [...cohorts].sort((a, b) => b.clickRate - a.clickRate);
    const [top, runnerUp] = sorted;
    const z = twoProportionZ(runnerUp.clicked, runnerUp.sent, top.clicked, top.sent);
    if (Math.abs(z) >= Z_95) {
      winner = {
        variant: top.variant,
        liftPct:
          runnerUp.clickRate > 0
            ? ((top.clickRate - runnerUp.clickRate) / runnerUp.clickRate) * 100
            : 0,
        zScore: z,
      };
    }
  }

  return { cohorts, readyToCallWinner, minSample: MIN_SAMPLE_PER_COHORT, winner };
}
