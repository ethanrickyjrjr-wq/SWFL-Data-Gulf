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

/** Calendar day → social_schedules day_of_week (Sun=0 convention, matches
 *  ScheduleSocialModal's DAYS array). */
export const DAY_OF_WEEK: Record<CalendarDay, number> = {
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
};
