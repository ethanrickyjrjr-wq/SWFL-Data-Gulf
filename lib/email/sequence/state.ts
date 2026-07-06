/**
 * lib/email/sequence/state.ts — PURE step-state transitions for a listing arc.
 * No I/O, no Date. Every mutator returns a NEW array and throws on an illegal
 * transition (routes catch → 409). Order is advisory by operator decree
 * (07/05/2026): transitions gate on the STEP's own state, never its neighbors'.
 */
import type { SequenceStep, SetupStep, StepKey, StepState } from "./types";

function transition(
  steps: SequenceStep[],
  key: StepKey,
  legalFrom: StepState[],
  patch: Partial<SequenceStep>,
  verb: string,
): SequenceStep[] {
  const step = steps.find((s) => s.key === key);
  if (!step) throw new Error(`sequence: unknown step "${key}"`);
  if (!legalFrom.includes(step.state)) {
    const why = step.state === "scheduled" ? "it is scheduled (frozen)" : `it is ${step.state}`;
    throw new Error(`sequence: cannot ${verb} "${key}" — ${why}`);
  }
  return steps.map((s) => (s.key === key ? { ...s, ...patch } : s));
}

export function applySetup(setup: SetupStep[]): SequenceStep[] {
  return setup.map((s) => ({ ...s, state: "pending" as const }));
}

export function markBuilt(steps: SequenceStep[], key: StepKey, deliverableId: string) {
  return transition(
    steps,
    key,
    ["pending", "built"],
    { state: "built", deliverable_id: deliverableId },
    "build/edit",
  );
}

export function markScheduled(
  steps: SequenceStep[],
  key: StepKey,
  scheduleId: number,
  scheduledForIso: string,
) {
  return transition(
    steps,
    key,
    ["built"],
    { state: "scheduled", schedule_id: scheduleId, scheduled_for: scheduledForIso },
    "schedule",
  );
}

export function markUnlocked(steps: SequenceStep[], key: StepKey) {
  return transition(
    steps,
    key,
    ["scheduled"],
    { state: "built", schedule_id: null, scheduled_for: null },
    "unlock",
  );
}

export function markSkipped(steps: SequenceStep[], key: StepKey) {
  return transition(steps, key, ["pending", "built"], { state: "skipped" }, "skip");
}

export function markSent(steps: SequenceStep[], key: StepKey, sentAtIso: string) {
  return transition(steps, key, ["scheduled"], { state: "sent", sent_at: sentAtIso }, "mark sent");
}

/** Truth for "sent" comes from the schedule row, never asserted blind: a
 *  completed once row means the worker fired it (the runner's status flip). */
export function reconcileSent(
  steps: SequenceStep[],
  rows: { id: number; status: string; last_run_at: string | null }[],
): SequenceStep[] {
  const done = new Map(rows.filter((r) => r.status === "completed").map((r) => [r.id, r]));
  return steps.map((s) =>
    s.state === "scheduled" && s.schedule_id != null && done.has(s.schedule_id)
      ? { ...s, state: "sent" as const, sent_at: done.get(s.schedule_id)!.last_run_at }
      : s,
  );
}
