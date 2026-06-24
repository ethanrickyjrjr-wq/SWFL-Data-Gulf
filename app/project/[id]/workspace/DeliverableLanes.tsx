"use client";

import type { EmailScheduleRow } from "./types";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function hourEt(h: number): string {
  const am = h < 12;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${am ? "am" : "pm"} ET`;
}

/** "Weekly · Mondays 9am ET" / "Daily · 7am ET" / "Monthly · day 1 · 8am ET". */
function cadenceLabel(s: EmailScheduleRow): string {
  const when =
    s.cadence === "weekly" && s.day_of_week != null
      ? `${DOW[s.day_of_week] ?? "?"}`
      : s.cadence === "monthly" && s.day_of_month != null
        ? `day ${s.day_of_month}`
        : "";
  const cad = s.cadence.charAt(0).toUpperCase() + s.cadence.slice(1);
  return [cad, when, hourEt(s.send_hour_et)].filter(Boolean).join(" · ");
}

function scopeLabel(s: EmailScheduleRow): string {
  if (!s.scope_value) return "All SWFL";
  // scope_value is stored canonical lowercase. A ZIP/county code reads fine
  // upper-cased; a place name should be title-cased ("cape coral" → "Cape Coral").
  if (s.scope_kind === "place") return s.scope_value.replace(/\b\w/g, (c) => c.toUpperCase());
  return s.scope_value.toUpperCase();
}

function EmailScheduleCard({ s }: { s: EmailScheduleRow }) {
  const paused = s.status !== "active";
  return (
    <li className="flex flex-col gap-1 rounded-xl border border-white/10 bg-[#0d1e2b]/80 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium text-white">{scopeLabel(s)}</span>
        <span
          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
            paused ? "border border-white/10 text-gray-400" : "bg-[#3DC9C0]/15 text-[#3DC9C0]"
          }`}
        >
          {paused ? s.status : "active"}
        </span>
      </div>
      <span className="text-xs text-gray-400">{cadenceLabel(s)}</span>
      {s.topic && <span className="text-[11px] text-gray-500">Topic: {s.topic}</span>}
      <span className="text-[11px] text-gray-500">Audience: {s.audience_slug ?? "—"}</span>
      <span className="text-[11px] text-gray-500">
        {s.last_run_at
          ? `Last sent ${new Date(s.last_run_at).toLocaleDateString()}`
          : "Not sent yet"}
        {s.next_run_at && !paused ? ` · Next ${new Date(s.next_run_at).toLocaleDateString()}` : ""}
      </span>
    </li>
  );
}

/**
 * Scheduled-sends lane (Materials Hub v2). The Built-deliverables lane moved into
 * <MaterialsHub>; this is now schedule-only. The lane is schedule-driven, not
 * deliverable-driven — `email_schedules` carries no `deliverable_id`; a card is the
 * recipe (cadence + scope + audience + last run). Renders nothing when there are no
 * active schedules (no empty state until the scheduler spec ships).
 */
export function DeliverableLanes({ emailSchedules }: { emailSchedules: EmailScheduleRow[] }) {
  if (emailSchedules.length === 0) return null;
  return (
    <section className="mt-6 rounded-xl border border-white/10 bg-[#0d1e2b]/50 p-4">
      <h2 className="text-sm font-semibold text-white">Scheduled sends</h2>
      <p className="mt-1 text-xs text-gray-500">
        Active schedules. Each send pulls fresh data at send time.
      </p>
      <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {emailSchedules.map((s) => (
          <EmailScheduleCard key={s.id} s={s} />
        ))}
      </ul>
    </section>
  );
}
