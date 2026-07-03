"use client";
// components/email-lab/ScheduleSendModal.tsx
//
// The Email Lab "Schedule this email" modal. Thin wrapper around the SAME
// SendWeeklyHandle flow the hosted /p/[id] page uses (audience → cadence/hour →
// confirm). Because the saved design is a `block-canvas` deliverable, the
// /api/email/schedule-command `fromDeliverable` path links the schedule to THIS doc
// (deliverable_id), so the cron worker re-renders this exact email with fresh data,
// fresh commentary, and a fresh chart each occurrence — never a frozen snapshot.

import { SendWeeklyHandle } from "@/app/p/[id]/SendWeeklyHandle";
import { SendCeilingMeter } from "@/components/email/SendCeilingMeter";

interface Props {
  deliverableId: string;
  projectId: string;
  scopeKind: string | null;
  scopeValue: string | null;
  onClose: () => void;
}

export function ScheduleSendModal({
  deliverableId,
  projectId,
  scopeKind,
  scopeValue,
  onClose,
}: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0a1822] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Schedule this email</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-white/40 transition-colors hover:text-white"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <p className="mb-3 text-xs text-white/50">
          It sends on your schedule and re-renders with fresh data, new commentary, and an updated
          chart each time — not this frozen preview.
        </p>
        <SendCeilingMeter variant="panel" />
        <SendWeeklyHandle
          deliverableId={deliverableId}
          projectId={projectId}
          scopeKind={scopeKind}
          scopeValue={scopeValue}
          // If they bounce to "Upload contacts", bring them back HERE with the schedule
          // modal reopened (?schedule=1) — not the generic /project page.
          returnTo={`/project/${projectId}/email-lab?did=${deliverableId}&schedule=1`}
        />
      </div>
    </div>
  );
}
