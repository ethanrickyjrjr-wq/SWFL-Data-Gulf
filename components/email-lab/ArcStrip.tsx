"use client";
// The listing campaign arc strip (lifecycle sequences). Five step cards above
// the ONE lab surface (grid shell — never forked). $0 layout previews at arm;
// build-on-demand; manual milestones; save-as-my-setup. Order is advisory.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { stepSections, type SequenceStep } from "@/lib/email/sequence/types";
import { snapshotSetup } from "@/lib/email/sequence/setup";
import { arcStepDestination } from "@/lib/lab-entry/destination";
import { MilestoneConfirmCard } from "./MilestoneConfirmCard";
import { ArcNudgeChip, type ArcNudge } from "./ArcNudgeChip";

export interface ArcSequence {
  id: string;
  status: string;
  setup_name: string | null;
  audience_slug: string | null;
  send_hour_et: number | null;
  steps: SequenceStep[];
}

interface Props {
  projectId: string;
  sequence: ArcSequence;
  onChanged: (seq: ArcSequence) => void;
}

const MILESTONE_LABEL: Record<string, string> = {
  "coming-soon": "Tease it →",
  "new-listing": "It’s live →",
  "market-comps": "Send the comps →",
  "under-contract": "It’s under contract →",
  sold: "It sold →",
};

function chip(state: SequenceStep["state"], scheduledFor?: string | null): string {
  if (state === "sent") return "Sent";
  if (state === "scheduled")
    return `Locked · sends ${
      scheduledFor
        ? new Date(scheduledFor).toLocaleString("en-US", {
            timeZone: "America/New_York",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          }) + " ET"
        : "soon"
    }`;
  if (state === "built") return "Built";
  if (state === "skipped") return "Skipped";
  return "Layout ready";
}

export function ArcStrip({ projectId, sequence, onChanged }: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<SequenceStep | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [nudges, setNudges] = useState<ArcNudge[]>([]);
  const [dismissingId, setDismissingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${projectId}/sequence`)
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && Array.isArray(j?.nudges)) setNudges(j.nudges);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  async function dismissNudge(nudgeId: string) {
    setDismissingId(nudgeId);
    try {
      const res = await fetch(`/api/projects/${projectId}/sequence/nudges`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nudge_id: nudgeId }),
      });
      if (res.ok) setNudges((prev) => prev.filter((n) => n.id !== nudgeId));
    } finally {
      setDismissingId(null);
    }
  }

  async function patch(body: Record<string, unknown>) {
    const res = await fetch(`/api/projects/${projectId}/sequence`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json();
    if (res.ok) onChanged(j.sequence);
    else setNote(j.error ?? "That didn’t work.");
  }

  async function fire(step: SequenceStep, mode: "now" | "at", atIso?: string) {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/sequence/fire`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step_key: step.key, mode, ...(atIso ? { at_iso: atIso } : {}) }),
      });
      const j = await res.json();
      if (!res.ok) {
        setNote(
          j.error === "not_built"
            ? "Build this piece first — nothing sends unseen."
            : (j.error ?? "Send failed."),
        );
        return;
      }
      setConfirming(null);
      if (j.result === "sent") setNote(`Sent to ${j.recipients ?? "your"} contacts.`);
      else if (j.result === "queued") setNote("Queued — sending within ~15 minutes.");
      else setNote("Scheduled.");
      const fresh = await fetch(`/api/projects/${projectId}/sequence`).then((r) => r.json());
      if (fresh.sequence) onChanged(fresh.sequence);
      if (Array.isArray(fresh.nudges)) setNudges(fresh.nudges);
    } finally {
      setBusy(false);
    }
  }

  async function saveSetup() {
    const name = window.prompt(
      "Name this setup (it saves the prompts + layouts, never this listing’s data):",
    );
    if (!name) return;
    const makeDefault = window.confirm("Make it your default for new listing projects?");
    const res = await fetch("/api/email/sequence-setups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        is_default: makeDefault,
        steps: snapshotSetup(sequence.steps),
      }),
    });
    setNote(
      res.ok ? `Setup “${name}” saved${makeDefault ? " as your default" : ""}.` : "Save failed.",
    );
  }

  return (
    <div className="border-b border-white/10 bg-[#081420] px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold text-white/80">
          Listing campaign ·{" "}
          {sequence.setup_name === "platform" ? "standard arc" : sequence.setup_name}
          <span className="ml-2 text-[10px] font-normal text-gulf-teal">every number sourced</span>
        </p>
        <button
          type="button"
          onClick={() => void saveSetup()}
          className="rounded-full border border-white/15 px-2.5 py-1 text-[10px] text-white/50 hover:border-gulf-teal/50 hover:text-gulf-teal"
        >
          Save as my setup
        </button>
      </div>
      {note && <p className="mb-2 text-[11px] text-gulf-teal">{note}</p>}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {sequence.steps.map((step) => (
          <div
            key={step.key}
            className="min-w-[180px] flex-1 rounded-xl border border-white/10 bg-white/[0.03] p-3"
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-white">{step.title}</p>
              <span
                className={`text-[9px] ${
                  step.state === "sent"
                    ? "text-gulf-teal"
                    : step.state === "scheduled"
                      ? "text-amber-300"
                      : "text-white/40"
                }`}
              >
                {chip(step.state, step.scheduled_for)}
              </span>
            </div>
            {previewing === step.key && (
              <ul className="mt-1 text-[10px] text-white/50">
                {stepSections(step.seed_doc_id).map((s, i) => (
                  <li key={i}>
                    · {s.label}
                    {s.live ? " — fills fresh at build" : ""}
                  </li>
                ))}
              </ul>
            )}
            {nudges
              .filter((n) => n.step_key === step.key)
              .map((n) => (
                <ArcNudgeChip
                  key={n.id}
                  nudge={n}
                  onBuild={() => router.push(arcStepDestination(projectId, step))}
                  onDismiss={() => void dismissNudge(n.id)}
                  dismissing={dismissingId === n.id}
                />
              ))}
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setPreviewing(previewing === step.key ? null : step.key)}
                className="rounded border border-white/10 px-2 py-0.5 text-[10px] text-white/50 hover:text-white"
              >
                Preview
              </button>
              {(step.state === "pending" || step.state === "built") && (
                <button
                  type="button"
                  onClick={() => router.push(arcStepDestination(projectId, step))}
                  className="rounded border border-white/10 px-2 py-0.5 text-[10px] text-white/50 hover:text-white"
                >
                  {step.state === "built" ? "Edit" : "Build"}
                </button>
              )}
              {step.state === "built" && (
                <button
                  type="button"
                  onClick={() => setConfirming(step)}
                  className="rounded bg-gulf-teal/90 px-2 py-0.5 text-[10px] font-semibold text-[#070f14] hover:bg-gulf-teal"
                >
                  {MILESTONE_LABEL[step.key]}
                </button>
              )}
              {step.state === "scheduled" && (
                <button
                  type="button"
                  onClick={() => void patch({ step_key: step.key, op: "unlock" })}
                  className="rounded border border-amber-300/40 px-2 py-0.5 text-[10px] text-amber-300 hover:bg-amber-300/10"
                >
                  Unlock
                </button>
              )}
              {step.state === "pending" && (
                <button
                  type="button"
                  onClick={() => void patch({ step_key: step.key, op: "skip" })}
                  className="rounded px-2 py-0.5 text-[10px] text-white/30 hover:text-white/60"
                >
                  Skip
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {confirming && (
        <MilestoneConfirmCard
          step={confirming}
          audienceSlug={sequence.audience_slug ?? "your"}
          busy={busy}
          onConfirm={(mode, atIso) => void fire(confirming, mode, atIso)}
          onClose={() => setConfirming(null)}
        />
      )}
    </div>
  );
}
