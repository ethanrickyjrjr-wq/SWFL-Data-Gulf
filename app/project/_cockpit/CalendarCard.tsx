// app/project/_cockpit/CalendarCard.tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  expandScheduleMonth,
  etDateISO,
  type MonthSendMark,
} from "@/lib/project/schedule-calendar";
import {
  chipTime,
  type ScheduleChip,
  type EmailScheduleRow,
  type SocialScheduleRow,
} from "@/lib/project/schedule-chips";

/**
 * Compact month grid (spec: "not the center of attention") — teal dot on any
 * ET day with a scheduled send, today outlined, paused excluded (the expansion
 * util filters them). Under the grid: the next 3 upcoming sends as the existing
 * chips; clicking a dotted day FILTERS that list to the day (no popovers —
 * clipped-popover lesson, 07/16/2026). ‹ › month nav only; nothing fancier.
 */
export function CalendarCard({
  emailSch,
  socialSch,
  chips,
  scheduleHref,
}: {
  emailSch: EmailScheduleRow[];
  socialSch: SocialScheduleRow[];
  chips: ScheduleChip[];
  scheduleHref: string;
}) {
  const todayISO = etDateISO(new Date());
  const [y0, m0] = [Number(todayISO.slice(0, 4)), Number(todayISO.slice(5, 7)) - 1];
  const [view, setView] = useState({ year: y0, month0: m0 });
  const [dayFilter, setDayFilter] = useState<string | null>(null);

  const days = useMemo(
    () => expandScheduleMonth(emailSch, socialSch, view),
    [emailSch, socialSch, view],
  );
  const chipByKey = useMemo(() => new Map(chips.map((c) => [c.key, c])), [chips]);

  const first = new Date(Date.UTC(view.year, view.month0, 1));
  const daysInMonth = new Date(Date.UTC(view.year, view.month0 + 1, 0)).getUTCDate();
  const lead = first.getUTCDay(); // weekday of the 1st (0=Sun) — calendar-shape only
  const monthLabel = first.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const upcoming = chips
    .filter((c) => c.status === "active" && c.nextAt)
    .sort((a, b) => (a.nextAt! < b.nextAt! ? -1 : 1));
  const listed = dayFilter
    ? (days.get(dayFilter) ?? [])
        .map((m: MonthSendMark) => chipByKey.get(m.chipKey))
        .filter((c): c is ScheduleChip => !!c)
    : upcoming.slice(0, 3);

  const nav = (delta: number) => {
    setDayFilter(null);
    setView(({ year, month0 }) => {
      const m = month0 + delta;
      return { year: year + Math.floor(m / 12), month0: ((m % 12) + 12) % 12 };
    });
  };

  const empty = days.size === 0 && upcoming.length === 0;

  return (
    <section className="rounded-xl border border-white/8 bg-[#0f1d24] p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-gulf-teal">
          Calendar
        </p>
        <div className="flex items-center gap-2 text-xs text-white/60">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => nav(-1)}
            className="rounded px-1 hover:bg-white/10 hover:text-white"
          >
            ‹
          </button>
          <span>{monthLabel}</span>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => nav(1)}
            className="rounded px-1 hover:bg-white/10 hover:text-white"
          >
            ›
          </button>
        </div>
      </div>

      {empty ? (
        <p className="py-3 text-xs text-white/45">
          Schedule a send and it lands here —{" "}
          <Link href={scheduleHref} className="text-gulf-teal hover:underline">
            Schedule →
          </Link>
        </p>
      ) : (
        <>
          <div className="grid grid-cols-7 gap-y-0.5 text-center text-[11px]">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <span key={`${d}${i}`} className="text-white/30">
                {d}
              </span>
            ))}
            {Array.from({ length: lead }, (_, i) => (
              <span key={`pad${i}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const date = `${view.year}-${String(view.month0 + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
              const marks = days.get(date);
              const isToday = date === todayISO;
              return (
                <button
                  key={date}
                  type="button"
                  disabled={!marks}
                  onClick={() => setDayFilter(dayFilter === date ? null : date)}
                  aria-label={marks ? `Sends on ${date}` : undefined}
                  className={`relative mx-auto flex h-6 w-6 items-center justify-center rounded-full ${
                    isToday ? "outline outline-1 outline-gulf-teal/70" : ""
                  } ${dayFilter === date ? "bg-gulf-teal/20" : ""} ${
                    marks ? "text-white hover:bg-white/10" : "text-white/35"
                  }`}
                >
                  {i + 1}
                  {marks && (
                    <span className="absolute bottom-0 h-1 w-1 rounded-full bg-gulf-teal" />
                  )}
                </button>
              );
            })}
          </div>

          <ul className="mt-3 flex flex-col gap-1 border-t border-white/8 pt-2">
            {listed.length === 0 && (
              <li className="text-[11px] text-white/40">
                No upcoming sends{dayFilter ? " that day" : ""}.
              </li>
            )}
            {listed.map((c) => (
              <li key={c.key}>
                <Link
                  href={c.href}
                  className="text-xs text-white/60 transition-colors hover:text-gulf-teal"
                >
                  {c.kind === "email" ? "✉" : "📣"} {c.line}
                  {!dayFilter && chipTime(c.nextAt) ? ` · next ${chipTime(c.nextAt)}` : ""}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
