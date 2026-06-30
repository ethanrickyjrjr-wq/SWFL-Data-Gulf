// lib/email/social-calendar/types.ts
import type { BlockType, EmailDoc } from "@/lib/email/doc/types";
import type { BuildScope } from "@/lib/email/build-doc";
import type { Platform } from "@/lib/social/types";

export type { BuildScope };
export type CalendarDay = "mon" | "tue" | "wed" | "thu" | "fri";

// Goal/tone knobs the user sets once; shape the synthesis voice (Task 3).
export type SocialGoal = "awareness" | "leads" | "engagement";
export type SocialTone = "professional" | "casual" | "bold";
export interface GoalTone {
  goal: SocialGoal;
  tone: SocialTone;
}

export interface DayTheme {
  day: CalendarDay;
  label: string;
  cardBlocks: BlockType[]; // ordered; never header/footer
  systemAddendum: string;
}

export interface SocialDraft {
  day: CalendarDay;
  theme: string;
  caption: string;
  hashtags: string[]; // 5–8, NO "#" prefix
  card: EmailDoc;
  /**
   * Per-network caption variants keyed by the 5 PUBLISHABLE platforms
   * (`Platform` union — the schedule targets, NOT the 8 display platforms).
   * Present only when platforms were requested; consumers default to the
   * variant for the selected platform and fall back to `caption`.
   */
  variants?: Partial<Record<Platform, string>>;
}

export interface WeeklyCalendar {
  scope?: BuildScope;
  weekOf: string; // ISO date of the Monday
  posts: SocialDraft[];
  /** Stale held figures refreshed to a current web-cited value (transparency). */
  webRefreshed?: string[];
  webSources?: { label: string; value: string; url: string }[];
}
