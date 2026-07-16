// lib/project/schedule-chips.ts
/**
 * Fold raw email/social schedule rows into plain-English display chips —
 * lifted from app/project/page.tsx (control-center build, 07/03/2026) so the
 * cockpit hub, panel, and rail consume ONE shape. Pure; no Supabase.
 */
import {
  describeCadence,
  formatScheduleSendTime,
  type Cadence,
} from "@/lib/email/schedule-cadence";
import { projectHome } from "@/lib/project/tool-tabs";

/** One schedule chip — email or social, already phrased for display. */
export interface ScheduleChip {
  key: string;
  kind: "email" | "social";
  status: string; // active | paused
  line: string; // "Emails every Monday at 8 AM ET"
  audience: string | null;
  nextAt: string | null; // ISO, for sorting + display
  href: string;
}

export interface EmailScheduleRow {
  id: string | number;
  project_id: string | null;
  status: string;
  cadence: string;
  day_of_week: number | null;
  day_of_month: number | null;
  send_hour_et: number;
  audience_slug: string | null;
  next_run_at: string | null;
  deliverable_id: string | null;
}

export interface SocialScheduleRow {
  id: string | number;
  project_id: string | null;
  status: string;
  cadence: string;
  day_of_week: number | null;
  day_of_month: number | null;
  send_hour_et: number;
  platform: string;
  next_run_at: string | null;
}

export interface ScheduleChipSummary {
  chipsByProject: Map<string, ScheduleChip[]>;
  allChips: ScheduleChip[];
  activeCount: number;
  upcoming: ScheduleChip[];
}

export function chipTime(nextAt: string | null): string | null {
  if (!nextAt) return null;
  const t = formatScheduleSendTime(nextAt);
  return t || null;
}

export function buildScheduleChips(
  emailSch: EmailScheduleRow[],
  socialSch: SocialScheduleRow[],
  opts: { upcomingLimit?: number } = {},
): ScheduleChipSummary {
  const upcomingLimit = opts.upcomingLimit ?? 3;
  const chipsByProject = new Map<string, ScheduleChip[]>();
  const allChips: ScheduleChip[] = [];

  function add(pid: string | null, chip: ScheduleChip) {
    allChips.push(chip);
    if (!pid) return;
    const list = chipsByProject.get(pid) ?? [];
    list.push(chip);
    chipsByProject.set(pid, list);
  }

  for (const s of emailSch) {
    add(s.project_id, {
      key: `e${s.id}`,
      kind: "email",
      status: s.status,
      line: `Emails ${describeCadence({
        cadence: s.cadence as Cadence,
        day_of_week: s.day_of_week,
        day_of_month: s.day_of_month,
        send_hour_et: s.send_hour_et,
      })}`,
      audience: s.audience_slug,
      nextAt: s.next_run_at,
      href:
        s.project_id && s.deliverable_id
          ? `/project/${s.project_id}/email-lab?did=${s.deliverable_id}&schedule=1`
          : s.project_id
            ? projectHome(s.project_id)
            : "/project",
    });
  }
  for (const s of socialSch) {
    add(s.project_id, {
      key: `s${s.id}`,
      kind: "social",
      status: s.status,
      line: `Posts to ${s.platform} ${describeCadence({
        cadence: s.cadence as Cadence,
        day_of_week: s.day_of_week,
        day_of_month: s.day_of_month,
        send_hour_et: s.send_hour_et,
      })}`,
      audience: null,
      nextAt: s.next_run_at,
      href: s.project_id ? `/project/${s.project_id}/social` : "/project",
    });
  }

  const upcoming = allChips
    .filter((c) => c.status === "active" && c.nextAt)
    .sort((a, b) => (a.nextAt! < b.nextAt! ? -1 : 1))
    .slice(0, upcomingLimit);
  const activeCount = allChips.filter((c) => c.status === "active").length;
  return { chipsByProject, allChips, activeCount, upcoming };
}
