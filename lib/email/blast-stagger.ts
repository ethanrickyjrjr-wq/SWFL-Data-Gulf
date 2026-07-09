// lib/email/blast-stagger.ts — pure partition rule for engagement-staggered blasts.
//
// Spec: docs/superpowers/specs/2026-07-09-engagement-staggered-send-design.md.
// Evidence: Google sender guidelines ("Start with a low sending volume to engaged
// users, and slowly increase the volume over time", live-pulled 07/09/2026) +
// r/Emailmarketing round-2 finding (engaged-first was "the single biggest lever").
//
// Wave 1 (send now) = engaged, brand-new, or thin-history contacts. "Unknown" is
// NOT "cold": a contact we've never emailed goes first. Wave 2 (schedule +2h) =
// dormant (≥2 deliveries, zero opens/clicks ever) or bouncy addresses — a bounce
// trumps engagement because it signals a bad address, not a disinterested reader.
// Zero event rows → wave 2 empty → behavior identical to an unstaggered blast
// (cold-start invariant; linkage only accrues from post-ship sends via the `cid` tag).
//
// PURE: no I/O, no Date. The route owns the clock, pacing, and deadline guard.

/** One tenant-scoped email_events row, as read at blast time. */
export interface ContactEventRow {
  contact_id: string | null;
  event: string;
}

export interface StaggerPartition<C> {
  /** Send immediately (batch path) — engaged, new, or thin-history contacts. */
  wave1: C[];
  /** Schedule +WAVE2_DELAY_MS (per-recipient scheduledAt) — dormant/bouncy contacts. */
  wave2: C[];
}

/** How far out wave 2 lands. 2h: same send-day, but reputation-shaped. */
export const WAVE2_DELAY_MS = 2 * 60 * 60 * 1000;

/** Spacing between wave-2 emails.send calls: 4/s under Resend's 5 req/s team limit
 *  (verified live 07/09/2026, resend.com/docs/api-reference/introduction). */
export const WAVE2_PACE_MS = 250;

export function partitionByEngagement<C extends { id: string }>(
  contacts: readonly C[],
  events: readonly ContactEventRow[],
): StaggerPartition<C> {
  const deliveredCount = new Map<string, number>();
  const engaged = new Set<string>();
  const bounced = new Set<string>();
  for (const e of events) {
    if (!e.contact_id) continue; // pre-linkage rows carry no recipient
    if (e.event === "delivered") {
      deliveredCount.set(e.contact_id, (deliveredCount.get(e.contact_id) ?? 0) + 1);
    } else if (e.event === "opened" || e.event === "clicked") {
      engaged.add(e.contact_id);
    } else if (e.event === "bounced") {
      bounced.add(e.contact_id);
    }
  }

  const wave1: C[] = [];
  const wave2: C[] = [];
  for (const contact of contacts) {
    const dormant =
      bounced.has(contact.id) ||
      (!engaged.has(contact.id) && (deliveredCount.get(contact.id) ?? 0) >= 2);
    (dormant ? wave2 : wave1).push(contact);
  }
  return { wave1, wave2 };
}
