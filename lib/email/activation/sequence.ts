/**
 * lib/email/activation/sequence.ts — the 2-step "It's Alive" runner (pure / DI).
 *
 * Beat 1 (enroll): on a consented opt-in, assemble the prospect's ZIP report, send
 * it (email #1), freeze the snapshot, and schedule step 2 at +interval days.
 * Beat 2 (delta): a cron claims due rows, re-assembles the report, diffs it against
 * the FROZEN snapshot (computeReportDelta — what we showed you vs. now), and sends
 * email #2 with the delta block + a CTA to the gate.
 *
 * Like `scheduler.ts`, all I/O is injected so the core is unit-testable with no DB
 * and no network, and a single row's failure never throws past its boundary. DRY_RUN
 * performs ZERO sends and ZERO mutations — it renders + diffs + logs only.
 *
 * The send seam is injected (`deps.send`) rather than hard-wired to the segment
 * broadcast: an activation email is 1:1 (one prospect), so the runner wires it to a
 * transactional send. The unsubscribe token is already in the rendered HTML
 * (reportToEmailHtml injects it), so the broadcast route's CAN-SPAM guard is satisfied.
 */

import { computeReportDelta } from "./delta";
import type { AssembledReport } from "./snapshot";
import { reportToEmailHtml, type RenderReportOptions } from "./render";
import { assembleActivationReport } from "./snapshot";
import type { ActivationScope, ActivationBrand, ActivationSnapshot } from "./types";

/** A `prospect_activation` row, the fields the runner reads/writes. */
export interface ActivationRow {
  id: number;
  email: string;
  scope: ActivationScope;
  brand: ActivationBrand | null;
  /** Highest step sent (1 after email #1). */
  step: number;
  snapshot: ActivationSnapshot | null;
  next_send_at: string | null;
  status: string;
}

export interface SendMessage {
  to: string;
  subject: string;
  html: string;
}

export interface SendResult {
  ok: boolean;
  id?: string;
  error?: string;
}

/** Injected dependencies — every I/O seam, so the core stays pure. */
export interface ActivationDeps {
  /** True → never send, never mutate; render + diff + log only. */
  dryRun: boolean;
  /** Assemble the grounded report for a scope (defaults to the disk-backed assembler). */
  assemble?: (scope: ActivationScope) => Promise<AssembledReport>;
  /** Render the branded email (defaults to reportToEmailHtml). */
  render?: (report: AssembledReport, opts: RenderReportOptions) => Promise<string>;
  /** Send one transactional email (1:1). The runner supplies the real Resend send. */
  send: (msg: SendMessage) => Promise<SendResult>;
  /** Insert a new enrollment row, returning its id. */
  insertEnrollment: (row: {
    email: string;
    scope: ActivationScope;
    brand: ActivationBrand | null;
    snapshot: ActivationSnapshot;
    step: number;
    next_send_at: string;
    sent_at: string;
  }) => Promise<{ id: number }>;
  /** Mark a row's step complete (step bump, status, append sent_at, clear/advance next_send_at). */
  completeStep: (
    id: number,
    patch: { step: number; status: string; sent_at: string; next_send_at: string | null },
  ) => Promise<void>;
  /** Days between step 1 and step 2 (default 3). */
  intervalDays?: number;
  /**
   * Send cadence (default "delta" — the 2-step "It's Alive" sequence). "daily-trial"
   * is the no-signup 30-day-at-9 AM trial: it schedules the NEXT send at +1 day. NOTE
   * (G-F3 scope): this seam sets the enroll-side interval only. The repeating
   * processor that re-sends daily up to 30× (and the close-button that starts the
   * trial) are the deferred remainder — they cannot run until live send (Phase D) and
   * the deferred conversational close exist.
   */
  cadence?: "delta" | "daily-trial";
  /** CTA target (default the gate at /pricing). */
  ctaUrl?: string;
  log: (line: string) => void;
  /** The instant the run is anchored to (injected for deterministic tests). */
  now: Date;
}

export type EnrollOutcome =
  | { kind: "enrolled"; id: number }
  | { kind: "sent-dry-run" }
  | { kind: "parked"; reason: string }
  | { kind: "error"; error: string };

export type StepOutcome =
  | { kind: "sent"; id: number; hadChange: boolean }
  | { kind: "dry-run"; id: number; hadChange: boolean }
  | { kind: "skipped"; id: number; reason: string }
  | { kind: "error"; id: number; error: string };

function placeOf(report: AssembledReport): string {
  return report.primaryPlace ?? `ZIP ${report.zip}`;
}

function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Beat 1 — enroll a consented prospect: send email #1 and schedule the delta.
 * Out-of-scope scopes are PARKED (never an invented sub-grain number).
 */
export async function enrollProspect(
  input: { email: string; scope: ActivationScope; brand: ActivationBrand | null },
  deps: ActivationDeps,
): Promise<EnrollOutcome> {
  const assemble = deps.assemble ?? assembleActivationReport;
  const render = deps.render ?? reportToEmailHtml;
  // daily-trial sends again tomorrow; the delta sequence waits the full interval.
  const interval = deps.cadence === "daily-trial" ? 1 : (deps.intervalDays ?? 3);

  try {
    const report = await assemble(input.scope);
    if (!report.in_scope) {
      deps.log(`[activation] PARKED ${input.email} — scope ${input.scope.zip} out of footprint.`);
      return { kind: "parked", reason: "out_of_scope" };
    }

    const html = await render(report, { brand: input.brand, ctaUrl: deps.ctaUrl });
    const subject = `Your ${placeOf(report)} market read`;
    const nowIso = deps.now.toISOString();
    const nextSend = addDays(deps.now, interval).toISOString();

    if (deps.dryRun) {
      deps.log(
        `[activation] DRY_RUN enroll ${input.email} — would send "${subject}" (htmlBytes=${html.length}), step2 at ${nextSend}.`,
      );
      return { kind: "sent-dry-run" };
    }

    const sent = await deps.send({ to: input.email, subject, html });
    if (!sent.ok) {
      deps.log(`[activation] SEND FAILED enroll ${input.email} — ${sent.error ?? "unknown"}.`);
      return { kind: "error", error: sent.error ?? "send_failed" };
    }

    const { id } = await deps.insertEnrollment({
      email: input.email,
      scope: input.scope,
      brand: input.brand,
      snapshot: report.snapshot,
      step: 1,
      next_send_at: nextSend,
      sent_at: nowIso,
    });
    deps.log(`[activation] ENROLLED ${input.email} id=${id} — email#1 sent, step2 at ${nextSend}.`);
    return { kind: "enrolled", id };
  } catch (err) {
    deps.log(
      `[activation] ERROR enroll ${input.email} — ${err instanceof Error ? err.message : String(err)}`,
    );
    return { kind: "error", error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Beat 2 — process one due step-2 row: re-assemble, diff against the frozen
 * snapshot, send email #2 with the delta. Never throws past its boundary; DRY_RUN
 * sends/mutates nothing.
 */
export async function processActivationStep(
  row: ActivationRow,
  deps: ActivationDeps,
): Promise<StepOutcome> {
  const assemble = deps.assemble ?? assembleActivationReport;
  const render = deps.render ?? reportToEmailHtml;

  try {
    if (row.step !== 1 || !row.snapshot) {
      deps.log(`[activation] SKIP id=${row.id} — not at step 1 or missing snapshot.`);
      return { kind: "skipped", id: row.id, reason: "not_ready" };
    }

    const current = await assemble(row.scope);
    if (!current.in_scope) {
      // The scope was in-scope at enroll; a regression here is data, not a claim to invent.
      deps.log(`[activation] SKIP id=${row.id} — scope ${row.scope.zip} no longer resolvable.`);
      return { kind: "skipped", id: row.id, reason: "scope_unresolved" };
    }

    const delta = computeReportDelta(row.snapshot, current.snapshot);
    const html = await render(current, { brand: row.brand, delta, ctaUrl: deps.ctaUrl });
    const place = placeOf(current);
    const subject = delta.has_change
      ? `What changed in ${place} this week`
      : `Your ${place} market read — re-verified`;

    if (deps.dryRun) {
      deps.log(
        `[activation] DRY_RUN step2 id=${row.id} — would send "${subject}" hasChange=${delta.has_change} ` +
          `metrics=${delta.metric_changes.length} signals=${delta.signal_changes.length} (htmlBytes=${html.length}).`,
      );
      return { kind: "dry-run", id: row.id, hadChange: delta.has_change };
    }

    const sent = await deps.send({ to: row.email, subject, html });
    if (!sent.ok) {
      deps.log(`[activation] SEND FAILED step2 id=${row.id} — ${sent.error ?? "unknown"}.`);
      return { kind: "error", id: row.id, error: sent.error ?? "send_failed" };
    }

    await deps.completeStep(row.id, {
      step: 2,
      status: "done",
      sent_at: deps.now.toISOString(),
      next_send_at: null,
    });
    deps.log(`[activation] SENT step2 id=${row.id} hasChange=${delta.has_change}.`);
    return { kind: "sent", id: row.id, hadChange: delta.has_change };
  } catch (err) {
    deps.log(
      `[activation] ERROR step2 id=${row.id} — ${err instanceof Error ? err.message : String(err)}`,
    );
    return { kind: "error", id: row.id, error: err instanceof Error ? err.message : String(err) };
  }
}
