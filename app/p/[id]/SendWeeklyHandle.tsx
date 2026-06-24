"use client";

import { useEffect, useState } from "react";

interface Audience {
  slug: string;
  contact_count: number;
}

interface ScheduleSummary {
  id: number;
  status: "active" | "paused";
  cadence: string;
  day_of_week: number | null;
  day_of_month: number | null;
  send_hour_et: number;
  audience_slug: string | null;
}

interface SendStatus {
  audiences: Audience[];
  schedule: ScheduleSummary | null;
}

interface Props {
  deliverableId: string;
  projectId: string;
  scopeKind: string | null;
  scopeValue: string | null;
}

type Step =
  | { name: "loading" }
  | { name: "idle" }
  | { name: "audience"; forAction: "weekly" }
  | { name: "cadence"; audienceSlug: string }
  | { name: "proposing" }
  | { name: "confirm"; summary: string; proposal: unknown; nonce: string | null }
  | { name: "confirming" }
  | { name: "success"; summary: string }
  | { name: "pausing" }
  | { name: "paused" }
  | { name: "error"; message: string };

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const HOUR_OPTIONS = [
  { value: 7, label: "7 am ET" },
  { value: 8, label: "8 am ET" },
  { value: 9, label: "9 am ET" },
  { value: 10, label: "10 am ET" },
  { value: 17, label: "5 pm ET" },
];

function describeSchedule(s: ScheduleSummary): string {
  const day = s.day_of_week != null ? DAYS[s.day_of_week] + "s" : null;
  const hour =
    HOUR_OPTIONS.find((h) => h.value === s.send_hour_et)?.label ?? `${s.send_hour_et}h ET`;
  const audience = s.audience_slug ? ` → ${s.audience_slug}` : "";
  if (s.cadence === "weekly" && day) return `Weekly${audience}, ${day} at ${hour}`;
  if (s.cadence === "monthly" && s.day_of_month != null)
    return `Monthly${audience}, day ${s.day_of_month} at ${hour}`;
  return `${s.cadence}${audience} at ${hour}`;
}

const BTN =
  "rounded-full border border-[#3DC9C0]/60 px-3 py-1.5 text-xs font-medium text-[#3DC9C0] transition-colors hover:bg-[#3DC9C0]/10 disabled:opacity-50";
const BTN_CONFIRM =
  "rounded-full bg-[#3DC9C0] px-4 py-1.5 text-xs font-semibold text-navy-dark transition-opacity hover:opacity-90 disabled:opacity-50";
const BTN_GHOST =
  "rounded-full border border-white/10 px-3 py-1.5 text-xs text-gray-400 transition-colors hover:text-white";

export function SendWeeklyHandle({ deliverableId, projectId, scopeKind, scopeValue }: Props) {
  const [status, setStatus] = useState<SendStatus | null>(null);
  const [step, setStep] = useState<Step>({ name: "loading" });
  const [dayOfWeek, setDayOfWeek] = useState(1); // Monday default
  const [sendHour, setSendHour] = useState(7);

  useEffect(() => {
    const params = new URLSearchParams({ projectId });
    if (scopeKind) params.set("scopeKind", scopeKind);
    if (scopeValue) params.set("scopeValue", scopeValue);
    fetch(`/api/email/send-status?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: SendStatus | null) => {
        setStatus(data);
        setStep({ name: "idle" });
      })
      .catch(() => setStep({ name: "idle" }));
  }, [deliverableId, projectId, scopeKind, scopeValue]);

  async function propose(audienceSlug: string) {
    setStep({ name: "proposing" });
    try {
      const res = await fetch("/api/email/schedule-command", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId,
          fromDeliverable: {
            deliverableId,
            audience_slug: audienceSlug || undefined,
            cadence: "weekly",
            day_of_week: dayOfWeek,
            send_hour_et: sendHour,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "propose failed");
      if (data.needsClarification) {
        setStep({ name: "error", message: data.message ?? "Could not create schedule." });
        return;
      }
      setStep({
        name: "confirm",
        summary: data.summary as string,
        proposal: data.proposal,
        nonce: (data.proposal_nonce as string) ?? null,
      });
    } catch (e) {
      setStep({ name: "error", message: e instanceof Error ? e.message : "Unknown error" });
    }
  }

  async function confirm(proposal: unknown, nonce: string | null) {
    setStep({ name: "confirming" });
    try {
      const body: Record<string, unknown> = { projectId, confirm: true, proposal };
      if (nonce) body.proposal_nonce = nonce;
      const res = await fetch("/api/email/schedule-command", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "confirm failed");
      const summary =
        step.name === "confirm"
          ? (step as { name: "confirm"; summary: string }).summary
          : "Schedule saved";
      // Refresh status so the new schedule appears on next open.
      setStatus((prev) => prev && { ...prev, schedule: null });
      setStep({ name: "success", summary });
    } catch (e) {
      setStep({ name: "error", message: e instanceof Error ? e.message : "Unknown error" });
    }
  }

  async function pauseSchedule(scheduleId: number) {
    setStep({ name: "pausing" });
    try {
      // Step 1: propose the pause via NL (route resolves the schedule by id).
      const p1 = await fetch("/api/email/schedule-command", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, command: `pause schedule ${scheduleId}` }),
      });
      const d1 = await p1.json();
      if (!p1.ok || d1.error) throw new Error(d1.error ?? "pause propose failed");
      // Step 2: immediately confirm — no user review needed for a pause.
      const body2: Record<string, unknown> = { projectId, confirm: true, proposal: d1.proposal };
      if (d1.proposal_nonce) body2.proposal_nonce = d1.proposal_nonce;
      const p2 = await fetch("/api/email/schedule-command", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body2),
      });
      if (!p2.ok) throw new Error("pause failed");
      setStatus(
        (prev) =>
          prev && {
            ...prev,
            schedule: prev.schedule ? { ...prev.schedule, status: "paused" } : null,
          },
      );
      setStep({ name: "paused" });
    } catch (e) {
      setStep({ name: "error", message: e instanceof Error ? e.message : "Unknown error" });
    }
  }

  if (step.name === "loading") return null;

  const schedule = status?.schedule ?? null;
  const audiences = status?.audiences ?? [];

  // ── Success ──────────────────────────────────────────────────────────────
  if (step.name === "success") {
    return (
      <div className="mt-2 rounded-lg border border-[#3DC9C0]/30 bg-[#3DC9C0]/10 px-3 py-2 text-xs text-[#3DC9C0]">
        ✓ {step.summary}
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (step.name === "error") {
    return (
      <div className="mt-2 flex items-center gap-2">
        <p className="text-xs text-red-400">{step.message}</p>
        <button type="button" className={BTN_GHOST} onClick={() => setStep({ name: "idle" })}>
          Dismiss
        </button>
      </div>
    );
  }

  // ── Existing schedule status ───────────────────────────────────────────────
  if (step.name === "idle" && schedule) {
    const isPaused = schedule.status === "paused";
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-[#3DC9C0]/30 bg-[#3DC9C0]/10 px-3 py-1.5 text-xs text-[#3DC9C0]">
          {isPaused ? "⏸ Paused — " : "📧 "}
          {describeSchedule(schedule)}
        </span>
        {!isPaused && (
          <button
            type="button"
            className={BTN_GHOST}
            onClick={() => void pauseSchedule(schedule.id)}
          >
            Pause
          </button>
        )}
        {isPaused && (
          <button
            type="button"
            className={BTN}
            onClick={() => setStep({ name: "audience", forAction: "weekly" })}
          >
            Resume / change
          </button>
        )}
      </div>
    );
  }

  // ── Paused confirmation ───────────────────────────────────────────────────
  if (step.name === "paused") {
    return (
      <div className="mt-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-400">
        Schedule paused. You can resume it anytime from this page.
      </div>
    );
  }

  // ── Idle — no schedule yet ────────────────────────────────────────────────
  if (step.name === "idle") {
    return (
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          className={BTN}
          onClick={() => setStep({ name: "audience", forAction: "weekly" })}
        >
          Send weekly
        </button>
      </div>
    );
  }

  // ── Audience picker ───────────────────────────────────────────────────────
  if (step.name === "audience") {
    if (audiences.length === 0) {
      return (
        <div className="mt-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
          <p className="mb-2 text-xs text-gray-300">No contact lists yet. Upload contacts first.</p>
          <div className="flex gap-2">
            <a href="/contacts/upload" className={BTN}>
              Upload contacts
            </a>
            <button type="button" className={BTN_GHOST} onClick={() => setStep({ name: "idle" })}>
              Cancel
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="mt-2 rounded-lg border border-white/10 bg-[#0d1e2b]/80 px-3 py-3">
        <p className="mb-2 text-xs font-medium text-gray-300">Who gets it?</p>
        <div className="mb-3 flex flex-wrap gap-2">
          {audiences.map((a) => (
            <button
              key={a.slug}
              type="button"
              className={BTN}
              onClick={() => setStep({ name: "cadence", audienceSlug: a.slug })}
            >
              {a.slug}
              {a.contact_count > 0 && (
                <span className="ml-1 text-gray-500">({a.contact_count})</span>
              )}
            </button>
          ))}
          <a
            href="/contacts/upload"
            className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-gray-500 transition-colors hover:text-gray-300"
          >
            + Upload contacts
          </a>
        </div>
        <button type="button" className={BTN_GHOST} onClick={() => setStep({ name: "idle" })}>
          Cancel
        </button>
      </div>
    );
  }

  // ── Cadence picker ────────────────────────────────────────────────────────
  if (step.name === "cadence") {
    const { audienceSlug } = step;
    return (
      <div className="mt-2 rounded-lg border border-white/10 bg-[#0d1e2b]/80 px-3 py-3">
        <p className="mb-2 text-xs font-medium text-gray-300">When should it go out?</p>
        <div className="mb-3 flex flex-wrap gap-2">
          {DAYS.slice(1, 6).map((d, i) => (
            <button
              key={d}
              type="button"
              onClick={() => setDayOfWeek(i + 1)}
              className={
                dayOfWeek === i + 1
                  ? "rounded-full bg-[#3DC9C0] px-3 py-1.5 text-xs font-semibold text-navy-dark"
                  : BTN
              }
            >
              {d}
            </button>
          ))}
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          {HOUR_OPTIONS.map((h) => (
            <button
              key={h.value}
              type="button"
              onClick={() => setSendHour(h.value)}
              className={
                sendHour === h.value
                  ? "rounded-full bg-[#3DC9C0] px-3 py-1.5 text-xs font-semibold text-navy-dark"
                  : BTN
              }
            >
              {h.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button type="button" className={BTN_CONFIRM} onClick={() => void propose(audienceSlug)}>
            Set up weekly send →
          </button>
          <button
            type="button"
            className={BTN_GHOST}
            onClick={() => setStep({ name: "audience", forAction: "weekly" })}
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  // ── Proposing / Confirming / Pausing ─────────────────────────────────────
  if (step.name === "proposing" || step.name === "confirming" || step.name === "pausing") {
    const label =
      step.name === "pausing" ? "Pausing…" : step.name === "proposing" ? "Setting up…" : "Saving…";
    return <div className="mt-2 text-xs text-gray-400">{label}</div>;
  }

  // ── Confirm card ──────────────────────────────────────────────────────────
  if (step.name === "confirm") {
    const { summary, proposal, nonce } = step;
    return (
      <div className="mt-2 rounded-lg border border-[#3DC9C0]/30 bg-[#3DC9C0]/5 px-3 py-3">
        <p className="mb-3 text-xs text-gray-200">{summary}</p>
        <p className="mb-3 text-[11px] text-gray-500">
          Fresh data pulled each send — not the frozen preview.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className={BTN_CONFIRM}
            onClick={() => void confirm(proposal, nonce)}
          >
            Confirm
          </button>
          <button type="button" className={BTN_GHOST} onClick={() => setStep({ name: "idle" })}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return null;
}
