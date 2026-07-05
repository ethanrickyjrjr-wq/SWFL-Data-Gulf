"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AccountScheduleRow } from "@/lib/email/account-schedules";
import {
  describeCadence,
  formatScheduleSendTime,
  type Cadence,
} from "@/lib/email/schedule-cadence";
import { EMAIL_TEMPLATES } from "@/lib/email/templates/template-registry";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const HOURS = Array.from({ length: 24 }, (_, h) => ({
  value: h,
  label: `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "am" : "pm"} ET`,
}));

/**
 * Cross-project email-schedule manager (/account/schedules — page + route-modal).
 * Full edit per the operator ruling 07/05/2026: cadence/day/hour/audience/template
 * + pause/resume/stop, all through PATCH /api/email/schedules/[id] (the same
 * validated write core as the chat lane). A design-bound schedule (deliverable_id)
 * never exposes template_id — changing it would sever the saved design.
 */
export function ScheduleManager({
  schedules,
  audiences,
}: {
  schedules: AccountScheduleRow[];
  audiences: string[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);

  async function patch(id: number, body: Record<string, unknown>) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/email/schedules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as {
          error?: string;
          details?: string[];
        } | null;
        setError(
          j?.error === "invalid" ? (j.details ?? []).join("; ") : "Update failed — try again.",
        );
        return;
      }
      setEditing(null);
      router.refresh(); // server page re-reads rows → fresh next_run_at
    } finally {
      setBusy(null);
    }
  }

  const byProject = new Map<string, AccountScheduleRow[]>();
  for (const s of schedules) {
    const list = byProject.get(s.project_id) ?? [];
    list.push(s);
    byProject.set(s.project_id, list);
  }

  if (!schedules.length) {
    return (
      <p className="py-6 text-sm text-gray-400">
        Nothing scheduled yet. Open a project and build an email to schedule your first send —{" "}
        <Link href="/project" className="text-teal-primary hover:underline">
          your projects
        </Link>
        .
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
      {[...byProject.entries()].map(([projectId, rows]) => (
        <section key={projectId}>
          <h3 className="mb-2 flex items-baseline justify-between text-sm font-medium text-white">
            {rows[0].project_title}
            <Link
              href={`/project/${projectId}`}
              className="text-xs text-teal-primary hover:underline"
            >
              open project
            </Link>
          </h3>
          <ul className="flex flex-col gap-2">
            {rows.map((s) => (
              <li key={s.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm text-gray-200">
                    {describeCadence({
                      cadence: s.cadence as Cadence,
                      day_of_week: s.day_of_week,
                      day_of_month: s.day_of_month,
                      send_hour_et: s.send_hour_et,
                    })}
                    {s.audience_slug && <span className="text-gray-400"> → {s.audience_slug}</span>}
                    <span
                      className={`ml-2 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                        s.status === "active"
                          ? "bg-teal-primary/15 text-teal-primary"
                          : "bg-white/10 text-gray-400"
                      }`}
                    >
                      {s.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      disabled={busy === s.id}
                      onClick={() => setEditing((e) => (e === s.id ? null : s.id))}
                      className="rounded-lg border border-white/15 px-2 py-1 text-gray-300 hover:bg-white/10"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={busy === s.id}
                      onClick={() =>
                        void patch(s.id, { op: s.status === "paused" ? "resume" : "pause" })
                      }
                      className="rounded-lg border border-white/15 px-2 py-1 text-gray-300 hover:bg-white/10"
                    >
                      {s.status === "paused" ? "Resume" : "Pause"}
                    </button>
                    <button
                      type="button"
                      disabled={busy === s.id}
                      onClick={() => {
                        if (window.confirm("Stop this schedule? It will no longer send.")) {
                          void patch(s.id, { op: "stop" });
                        }
                      }}
                      className="rounded-lg border border-red-400/30 px-2 py-1 text-red-300 hover:bg-red-500/10"
                    >
                      Stop
                    </button>
                  </div>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {s.next_run_at
                    ? `Next send ${formatScheduleSendTime(s.next_run_at)}`
                    : "No next send"}
                  {s.deliverable_id ? " · sends your saved email design" : ""}
                </p>
                {editing === s.id && (
                  <EditForm row={s} audiences={audiences} busy={busy === s.id} onSubmit={patch} />
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function EditForm({
  row,
  audiences,
  busy,
  onSubmit,
}: {
  row: AccountScheduleRow;
  audiences: string[];
  busy: boolean;
  onSubmit: (id: number, body: Record<string, unknown>) => Promise<void>;
}) {
  const [cadence, setCadence] = useState(row.cadence);
  const [dayOfWeek, setDayOfWeek] = useState(row.day_of_week ?? 1);
  const [dayOfMonth, setDayOfMonth] = useState(row.day_of_month ?? 1);
  const [hour, setHour] = useState(row.send_hour_et);
  const [audience, setAudience] = useState(row.audience_slug ?? "");
  const [template, setTemplate] = useState(row.template_id ?? "");
  const audienceOptions = [
    ...new Set([...(row.audience_slug ? [row.audience_slug] : []), ...audiences]),
  ];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = {
      op: "edit",
      cadence,
      send_hour_et: hour,
      ...(cadence === "weekly" ? { day_of_week: dayOfWeek } : {}),
      ...(cadence === "monthly" ? { day_of_month: dayOfMonth } : {}),
    };
    if (audience && audience !== (row.audience_slug ?? "")) body.audience_slug = audience;
    if (!row.deliverable_id && template && template !== (row.template_id ?? "")) {
      body.template_id = template;
    }
    void onSubmit(row.id, body);
  }

  const selectCls =
    "w-full rounded border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-teal-primary [&>option]:text-black";
  return (
    <form
      onSubmit={submit}
      className="mt-3 grid grid-cols-2 gap-3 border-t border-white/10 pt-3 sm:grid-cols-3"
    >
      <label className="text-xs text-gray-400">
        Cadence
        <select value={cadence} onChange={(e) => setCadence(e.target.value)} className={selectCls}>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
      </label>
      {cadence === "weekly" && (
        <label className="text-xs text-gray-400">
          Day
          <select
            value={dayOfWeek}
            onChange={(e) => setDayOfWeek(Number(e.target.value))}
            className={selectCls}
          >
            {WEEKDAYS.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
        </label>
      )}
      {cadence === "monthly" && (
        <label className="text-xs text-gray-400">
          Day of month
          <input
            type="number"
            min={1}
            max={28}
            value={dayOfMonth}
            onChange={(e) => setDayOfMonth(Number(e.target.value))}
            className={selectCls}
          />
        </label>
      )}
      <label className="text-xs text-gray-400">
        Send hour
        <select
          value={hour}
          onChange={(e) => setHour(Number(e.target.value))}
          className={selectCls}
        >
          {HOURS.map((h) => (
            <option key={h.value} value={h.value}>
              {h.label}
            </option>
          ))}
        </select>
      </label>
      {audienceOptions.length > 0 && (
        <label className="text-xs text-gray-400">
          Audience
          <select
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            className={selectCls}
          >
            {audienceOptions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
      )}
      {!row.deliverable_id && (
        <label className="text-xs text-gray-400">
          Template
          <select
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            className={selectCls}
          >
            {template && !(template in EMAIL_TEMPLATES) && (
              <option value={template}>{template}</option>
            )}
            {Object.keys(EMAIL_TEMPLATES).map((slug) => (
              <option key={slug} value={slug}>
                {slug}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="col-span-2 flex items-end sm:col-span-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-teal-primary/90 px-3 py-1.5 text-xs font-medium text-[#0a1419] hover:bg-teal-primary disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
