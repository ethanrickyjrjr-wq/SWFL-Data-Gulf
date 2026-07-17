// lib/project/this-week.ts
//
// The ready-for-you week (project cockpit D0). Queue items are ordinary
// `deliverables` materials; this module is the ui_state.this_week pointer bag
// that ties them to a week + approval state. No new table — probe 07/02/2026
// confirmed /api/email-lab/social-calendar persists nothing, so the week's
// docs are saved through the materials endpoints and referenced by `did`.
import type { CalendarDay } from "@/lib/email/social-calendar/types";

export type QueueItemState = "pending" | "approved" | "skipped" | "scheduled";

export interface ThisWeekEmail {
  did: string;
  state: QueueItemState;
}

export interface ThisWeekSocial {
  day: CalendarDay;
  did: string;
  theme: string;
  caption: string;
  hashtags: string[];
  state: QueueItemState;
}

export interface ThisWeekState {
  /** Monday of the generated week — ISO date (lib/email/social-calendar/week.ts mondayOf). */
  week_of: string;
  generated_at: string;
  /** null = email-side generation failed (retryable via missingSides). */
  email: ThisWeekEmail | null;
  /** [] = social-side generation failed (retryable via missingSides). */
  social: ThisWeekSocial[];
  errors?: { email?: boolean; social?: boolean };
}

/** Once-per-week guard: the stored week is current for the given Monday. */
export function weekIsCurrent(week: ThisWeekState | null | undefined, monday: string): boolean {
  return !!week && week.week_of === monday;
}

/** Which sides still need generation (drives the partial-failure retry chip). */
export function missingSides(week: ThisWeekState | null | undefined): {
  email: boolean;
  social: boolean;
} {
  if (!week) return { email: true, social: true };
  return { email: week.email == null, social: week.social.length === 0 };
}

/** Every deliverable id the week's queue references (email + socials, any state).
 *  The materials library excludes these — queue inventory is not something the
 *  user made, so it never renders as "Your materials" (operator, 07/16/2026). */
export function weekDids(week: ThisWeekState | null | undefined): string[] {
  if (!week) return [];
  const dids = week.social.map((s) => s.did);
  if (week.email) dids.unshift(week.email.did);
  return dids;
}

/** Queue rows safe to soft-trash when a week is replaced (rollover or force
 *  regen): the user never acted on them. Approved/scheduled rows are kept —
 *  acting on a queue item is what graduates it into the materials library. */
export function staleQueueDids(week: ThisWeekState | null | undefined): string[] {
  if (!week) return [];
  const entries = [
    ...(week.email ? [week.email] : []),
    ...week.social.map((s) => ({ did: s.did, state: s.state })),
  ];
  return entries.filter((e) => e.state === "pending" || e.state === "skipped").map((e) => e.did);
}

/** Calendar day → social_schedules day_of_week (Sun=0 convention, matches
 *  ScheduleSocialModal's DAYS array). */
export const DAY_OF_WEEK: Record<CalendarDay, number> = {
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
};
