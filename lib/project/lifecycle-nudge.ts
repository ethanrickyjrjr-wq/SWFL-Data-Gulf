// lib/project/lifecycle-nudge.ts
//
// Pure decision core for PLATFORM_ARC auto-advance nudges (spec
// 2026-07-06-platform-arc-auto-advance-nudges-design.md). No DB, no disk, no Date.now() — `today`
// is always injected. NUDGE-ONLY: this module only ever PRODUCES candidate rows to insert; it
// never marks step state, schedules, or sends. The adapter (scripts/project-feed/
// lifecycle-nudges.mts) supplies the live data and does the actual write.

export type NudgeEventKind = "appeared" | "departed_holding" | "resolved_sold" | "time_elapsed";

const ACTIONABLE_STATES: ReadonlySet<string> = new Set(["pending", "built"]);
const MARKET_COMPS_DELAY_DAYS_DEFAULT = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface LifecycleTransition {
  from_state: string | null;
  to_state: string;
  /** ISO date string, e.g. "2026-07-10". */
  at: string;
  price: number | null;
  price_delta: number | null;
}

export interface SequenceStepForNudge {
  key: string;
  state: string;
  sent_at?: string | null;
}

export interface SequenceForNudge {
  /** email_sequences.id */
  id: string;
  project_id: string;
  user_id: string;
  address_key: string;
  steps: SequenceStepForNudge[];
}

export interface NudgeRow {
  user_id: string;
  project_id: string;
  sequence_id: string;
  step_key: string;
  event_kind: NudgeEventKind;
  from_state: string | null;
  to_state: string | null;
  at: string;
  price: number | null;
  price_delta: number | null;
  dedup_key: string;
}

/** Canonical dedup key — one row per (sequence, step, event kind, resulting state, event date). */
export function nudgeDedupKey(
  sequenceId: string,
  stepKey: string,
  eventKind: NudgeEventKind,
  toState: string | null,
  at: string,
): string {
  return `lifecycle:${sequenceId}:${stepKey}:${eventKind}:${toState ?? "-"}:${at}`;
}

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function latestByAt(
  transitions: LifecycleTransition[],
  toState: string,
): LifecycleTransition | undefined {
  return transitions
    .filter((t) => t.to_state === toState)
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))[0];
}

/**
 * Decide which lifecycle nudges apply right now for one armed sequence. Fully pure — the caller
 * (adapter script) supplies the sequence's own steps, the matching lake transitions, the current
 * lake state, and "today". Never fires for a step that's already `sent` or `skipped`.
 */
export function decideLifecycleNudges(
  seq: SequenceForNudge,
  transitions: LifecycleTransition[],
  currentState: string | null,
  today: Date,
  marketCompsDelayDays: number = MARKET_COMPS_DELAY_DAYS_DEFAULT,
): NudgeRow[] {
  const out: NudgeRow[] = [];
  const stepByKey = new Map(seq.steps.map((s) => [s.key, s] as const));
  const common = { user_id: seq.user_id, project_id: seq.project_id, sequence_id: seq.id };

  // ── appeared -> new-listing ────────────────────────────────────────────────
  const newListingStep = stepByKey.get("new-listing");
  const appeared = transitions.find((t) => t.from_state === null);
  if (appeared && newListingStep && ACTIONABLE_STATES.has(newListingStep.state)) {
    out.push({
      ...common,
      step_key: "new-listing",
      event_kind: "appeared",
      from_state: null,
      to_state: appeared.to_state,
      at: appeared.at,
      price: appeared.price,
      price_delta: appeared.price_delta,
      dedup_key: nudgeDedupKey(seq.id, "new-listing", "appeared", appeared.to_state, appeared.at),
    });
  }

  // ── departed to holding (ambiguous) -> under-contract ──────────────────────
  const underContractStep = stepByKey.get("under-contract");
  const holding = latestByAt(transitions, "holding");
  if (holding && underContractStep && ACTIONABLE_STATES.has(underContractStep.state)) {
    out.push({
      ...common,
      step_key: "under-contract",
      event_kind: "departed_holding",
      from_state: holding.from_state,
      to_state: "holding",
      at: holding.at,
      price: holding.price,
      price_delta: holding.price_delta,
      dedup_key: nudgeDedupKey(seq.id, "under-contract", "departed_holding", "holding", holding.at),
    });
  }

  // ── resolved sold (real county record via the off-market probe) -> sold ────
  // DEVIATION from plan (idempotency + provenance): fire ONLY when a real to_state='sold'
  // transition exists, never on a bare currentState==='sold' with no transition row. The plan's
  // original `at = soldTransition?.at ?? toDateOnly(today)` fallback minted a fresh dedup_key each
  // daily cron run (today changes), duplicating the nudge until the step left pending/built. The
  // sold copy asserts "county records show this sold" — that claim is only sourced by the actual
  // sold transition, so requiring it is both stable and source-faithful. The state machine always
  // appends a transition on a state change, so a sold state without one is a data anomaly we skip.
  const soldStep = stepByKey.get("sold");
  const soldTransition = latestByAt(transitions, "sold");
  if (
    currentState === "sold" &&
    soldStep &&
    ACTIONABLE_STATES.has(soldStep.state) &&
    soldTransition
  ) {
    out.push({
      ...common,
      step_key: "sold",
      event_kind: "resolved_sold",
      from_state: soldTransition.from_state,
      to_state: "sold",
      at: soldTransition.at,
      price: soldTransition.price,
      price_delta: soldTransition.price_delta,
      dedup_key: nudgeDedupKey(seq.id, "sold", "resolved_sold", "sold", soldTransition.at),
    });
  }

  // ── time_elapsed -> market-comps (anchored ONLY on new-listing's sent_at) ──
  const marketCompsStep = stepByKey.get("market-comps");
  if (marketCompsStep && ACTIONABLE_STATES.has(marketCompsStep.state) && newListingStep?.sent_at) {
    const sentAt = new Date(newListingStep.sent_at);
    const triggerAt = new Date(sentAt.getTime() + marketCompsDelayDays * DAY_MS);
    if (today.getTime() >= triggerAt.getTime()) {
      const at = toDateOnly(triggerAt);
      out.push({
        ...common,
        step_key: "market-comps",
        event_kind: "time_elapsed",
        from_state: null,
        to_state: null,
        at,
        price: null,
        price_delta: null,
        dedup_key: nudgeDedupKey(seq.id, "market-comps", "time_elapsed", null, at),
      });
    }
  }

  return out;
}
