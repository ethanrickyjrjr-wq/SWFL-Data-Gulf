"use client";
// Milestone confirm card (lifecycle sequences). Send now = immediate, the cron
// is only the crash net. Schedule = FREEZE — the warning copy is operator-locked
// verbatim. Sending requires a built piece; layout-only steps route to the lab.

import { useState } from "react";
import type { SequenceStep } from "@/lib/email/sequence/types";

interface Props {
  step: SequenceStep;
  audienceSlug: string;
  busy: boolean;
  onConfirm: (mode: "now" | "at", atIso?: string) => void;
  onClose: () => void;
}

export function MilestoneConfirmCard({ step, audienceSlug, busy, onConfirm, onClose }: Props) {
  const [when, setWhen] = useState<"now" | "at">("now");
  const [at, setAt] = useState("");
  const atDate = at ? new Date(at) : null;
  const atLabel = atDate
    ? atDate.toLocaleString("en-US", {
        timeZone: "America/New_York",
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }) + " ET"
    : "[time]";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0a1822] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-white">Send “{step.title}”</h2>
        <p className="mt-1 text-xs text-white/50">
          Goes to your <span className="text-white/80">{audienceSlug}</span> list — every number
          sourced.
        </p>

        <div className="mt-4 flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm text-white/80">
            <input type="radio" checked={when === "now"} onChange={() => setWhen("now")} />
            Send now
          </label>
          <label className="flex items-center gap-2 text-sm text-white/80">
            <input type="radio" checked={when === "at"} onChange={() => setWhen("at")} />
            Schedule for…
          </label>
          {when === "at" && (
            <>
              <input
                type="datetime-local"
                value={at}
                onChange={(e) => setAt(e.target.value)}
                className="rounded-lg border border-white/15 bg-transparent px-2 py-1.5 text-sm text-white"
              />
              <p className="text-[11px] leading-snug text-amber-300/90">
                Scheduling locks this email. It can’t be edited or sent until {atLabel} — unlock to
                change it.
              </p>
              <p className="text-[10px] text-white/40">
                Sends within ~15 minutes of the chosen time.
              </p>
            </>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            disabled={busy || (when === "at" && !at)}
            onClick={() =>
              onConfirm(when, when === "at" && atDate ? atDate.toISOString() : undefined)
            }
            className="rounded-lg bg-gulf-teal py-2 text-sm font-semibold text-[#070f14] hover:bg-[#17a3b3] disabled:opacity-50"
          >
            {busy ? "Sending…" : when === "now" ? "Confirm & send now" : "Confirm & schedule"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="py-1 text-xs text-white/40 hover:text-white/70"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
