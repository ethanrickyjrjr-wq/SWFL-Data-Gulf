// components/email-lab/ArcNudgeChip.tsx
"use client";
import { nudgeChipText } from "@/lib/project/nudge-copy";
import type { NudgeEventKind } from "@/lib/project/lifecycle-nudge";

export interface ArcNudge {
  id: string;
  step_key: string;
  event_kind: NudgeEventKind;
  price: number | null;
  price_delta: number | null;
  at: string;
}

export function ArcNudgeChip({
  nudge,
  onBuild,
  onDismiss,
  dismissing,
}: {
  nudge: ArcNudge;
  onBuild: () => void;
  onDismiss: () => void;
  dismissing: boolean;
}) {
  return (
    <div className="mt-2 rounded-md border border-gulf-teal/30 bg-gulf-teal/5 p-2 text-[10px] text-gulf-teal">
      <p>{nudgeChipText(nudge.event_kind, nudge.price_delta)}</p>
      <div className="mt-1 flex gap-2">
        <button
          type="button"
          onClick={onBuild}
          className="rounded border border-gulf-teal/40 px-2 py-0.5 hover:bg-gulf-teal/10"
        >
          Build it →
        </button>
        <button
          type="button"
          onClick={onDismiss}
          disabled={dismissing}
          className="px-1 text-white/40 hover:text-white/70 disabled:opacity-50"
        >
          {dismissing ? "…" : "×"}
        </button>
      </div>
    </div>
  );
}
