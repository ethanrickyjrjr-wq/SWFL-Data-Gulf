// scripts/email/run-schedules.mts
//
// Unit F — the multi-tenant email cron WORKER (the runner half). A standalone Bun
// process (NOT a Next route): the GHA cron invokes it every 15 min. It claims the
// batch of due schedules, processes each through the pure DI core in
// `lib/email/scheduler.ts`, and owns top-level fatal handling + the exit code.
//
// ARCHITECTURE: all decision logic lives in `lib/email/scheduler.ts`
// (dependency-injected, unit-tested with mocks). This file is the ADAPTER — it
// builds the real seams (service-role Supabase client, the claim RPC, a real
// fetch to /api/email/broadcast, env reads, the brain-data fetch + render) and
// loops `processSchedule(row, deps)` over the claimed batch. Same split as
// audience-sync.ts (lib core) + contacts/sync route (adapter).
//
// IDEMPOTENCY is the claim RPC's `FOR UPDATE SKIP LOCKED` (real run only). In
// DRY_RUN we DON'T call the claiming RPC at all — we do a plain read-only SELECT
// of due rows so a dry run never parks/mutates prod and never sends. See the
// `claimDue` dep below.
//
// EXIT CODES: a clean run (incl. zero due) → 0. A top-level fatal (missing env,
// claim unreachable, can't construct the client) → process.exit(1) (loud — a GHA
// failure must be visible). Per-schedule errors NEVER change the exit code.

import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { computeNextRunAt } from "@/lib/email/schedule-cadence";
import { checkUsageLimit, recordEmailSent } from "@/lib/email/usage";
import { claimOnce, releaseClaim } from "@/lib/email/idempotency";
import type { SenderConfigRow } from "@/lib/email/sender-config";
import { generateReplyToken, buildReplyAddress, replyDomain } from "@/lib/email/reply-token";
import {
  processBatch,
  reapOrphans,
  hasSendFailures,
  type ScheduleRow,
  type AudienceLookup,
  type BroadcastRequest,
  type BroadcastResult,
  type ProcessDeps,
  type ScheduleOutcome,
} from "@/lib/email/scheduler";
// ── Block-canvas EmailDoc lane (N6) ──
// A schedule linked to a saved Email Lab design re-RENDERS that exact doc with fresh
// lake data + fresh AI commentary + a fresh chart each occurrence. buildContentDoc is
// the ONE Email Lab build root (the route is a thin wrapper over it); renderEmailDocHtml
// is the ONE EmailDoc→HTML root the Lab preview + the blast route use (paid grid docs
// compile, free docs stack). Both import cleanly under Bun (smoke-verified). No re-fork.
import { buildContentDoc } from "@/lib/email/build-doc";
import { renderEmailDocHtml } from "@/lib/email/render-email-doc";
import type { EmailDoc } from "@/lib/email/doc/types";
import { buildEmailDocOccurrence, type EmailDocDeliverable } from "@/lib/email/emaildoc-occurrence";
import { isSequenceOnceRow, onceClaimKey } from "@/lib/email/sequence/once";
import { buildFrozenOccurrence } from "@/lib/email/sequence/frozen-occurrence";

const DRY_RUN = process.env.DRY_RUN === "true";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
const CLAIM_LIMIT = 50;

// Model tier for a scheduled EmailDoc re-render. "quality" → Sonnet (the tier the
// end-to-end build was proven on): a recurring customer-facing email warrants the better
// content fill. One Anthropic call + chart build + lake fetch per occurrence per tenant —
// fine for v1 volume (CLAIM_LIMIT=50 / 15-min cron). Tune here if cost dictates.
const SCHEDULE_BUILD_MODE = "quality";

// Per-broadcast-POST timeout. The batch is processed sequentially, so ONE hung
// request would stall the entire 15-min cron — we cap each POST and surface a
// timeout as a normal per-row {ok:false} failure (NOT batch-fatal).
const BROADCAST_TIMEOUT_MS = 30_000;

// Crash-orphan reaper window: a parked row (next_run_at=NULL) whose last_run_at is
// older than this is a genuine crash-orphan, safe to re-arm. A freshly-claimed row
// has last_run_at=now, so it is NOT stale and won't be reaped mid-flight by a
// concurrent run.
const ORPHAN_STALE_MS = 60 * 60 * 1000; // 1 hour

// Platform fallback identity — the SAME env the single-tenant digest + broadcast
// route use (DIGEST_SENDER_NAME / DIGEST_SENDER_ADDRESS), never RESEND_FROM_EMAIL.
const PLATFORM = {
  fromName: process.env.DIGEST_SENDER_NAME ?? "SWFL Data Gulf",
  fromEmail: process.env.DIGEST_SENDER_ADDRESS ?? "hello@swfldatagulf.com",
};

// ── runner ───────────────────────────────────────────────────────────────────
// ONE EMAIL SYSTEM (operator decree 07/19/2026): the worker sends EmailDoc
// deliverables ONLY — the sequence one-shot (frozen doc) and the block-canvas
// occurrence (fresh re-build of a saved Email Lab design). The digest, grounded
// "report", scoped, and token-template lanes were ripped out; a legacy row throws
// a loud per-row error until it is re-linked to a saved design or deactivated.

function requireEnv(): void {
  // The service-role client throws on missing SUPABASE_*; surface the broadcast
  // secret here too so a misconfigured cron fails loud and early (not mid-batch).
  if (!process.env.DIGEST_BROADCAST_SECRET) {
    throw new Error("DIGEST_BROADCAST_SECRET is required to POST the broadcast.");
  }
  // Guard the sender identity: DIGEST_SENDER_ADDRESS must be an EMAIL, never a
  // postal street address. Without this a misconfigured var (e.g. a CAN-SPAM
  // mailing address pasted here) ships an invalid RFC5322 from-header and Resend
  // 400s per-row while the run still exits 0 — a silent no-send. Fail loud early.
  const senderAddr = process.env.DIGEST_SENDER_ADDRESS;
  if (senderAddr && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(senderAddr.trim())) {
    throw new Error(
      `DIGEST_SENDER_ADDRESS is not a valid email address (got "${senderAddr}"). ` +
        "It must be a sending email like hello@swfldatagulf.com. The CAN-SPAM postal " +
        "mailing address belongs in a SEPARATE variable, not here.",
    );
  }
  // On a REAL run, NEXT_PUBLIC_SITE_URL must be set: the localhost fallback would
  // make every broadcast POST hit http://localhost:3000 and fail per-row while the
  // run still exits 0 — a silent no-send. Fail loud here instead. The fallback
  // stays usable for local DRY_RUN only (a dry run never POSTs).
  if (!DRY_RUN && !process.env.NEXT_PUBLIC_SITE_URL) {
    throw new Error(
      "NEXT_PUBLIC_SITE_URL is required for a real send (the localhost fallback is DRY_RUN-only; " +
        "a real broadcast POST to localhost is never correct).",
    );
  }
}

async function main(): Promise<void> {
  requireEnv();
  const db = createServiceRoleClient(); // throws → fatal (caught below)
  const now = new Date();
  const nowIso = now.toISOString();

  // ── claimDue: real run claims+parks via the RPC; DRY_RUN does a read-only
  //    SELECT so it never mutates prod and never sends. ──
  async function claimDue(): Promise<ScheduleRow[]> {
    if (DRY_RUN) {
      const { data, error } = await db
        .from("email_schedules")
        .select("*")
        .eq("status", "active")
        .not("next_run_at", "is", null)
        .lte("next_run_at", nowIso)
        .order("next_run_at", { ascending: true })
        .limit(CLAIM_LIMIT);
      if (error) throw new Error(`dry-run select due schedules failed: ${error.message}`);
      return (data ?? []) as ScheduleRow[];
    }
    const { data, error } = await db.rpc("claim_due_email_schedules", {
      p_now: nowIso,
      p_limit: CLAIM_LIMIT,
    });
    if (error) throw new Error(`claim_due_email_schedules failed: ${error.message}`);
    return (data ?? []) as ScheduleRow[];
  }

  // ── SELF-HEALING REAPER (real run only, BEFORE the claim) ──
  // If a prior worker died AFTER the claim parked rows (next_run_at=NULL) but
  // BEFORE it re-armed them, those rows stay parked forever. Re-arm genuine
  // crash-orphans: active, parked, and last touched > ORPHAN_STALE_MS ago (the
  // staleness guard means a freshly-claimed row — last_run_at=now — is NOT reaped
  // mid-flight by a concurrent run). Read-only in DRY_RUN: skip it entirely.
  async function reapCrashOrphans(): Promise<void> {
    if (DRY_RUN) return; // must stay read-only; never mutate in a dry run.
    const staleBeforeIso = new Date(now.getTime() - ORPHAN_STALE_MS).toISOString();
    const { data, error } = await db
      .from("email_schedules")
      .select("*")
      .is("next_run_at", null)
      .eq("status", "active")
      .lt("last_run_at", staleBeforeIso)
      .limit(CLAIM_LIMIT);
    if (error) throw new Error(`reaper select crash-orphans failed: ${error.message}`);
    const orphans = (data ?? []) as ScheduleRow[];
    if (orphans.length === 0) return;
    // A crash-orphaned once row (active+parked+stale: the worker died mid-flight)
    // re-arms to NOW — the date-free once claim key dedupes if the send actually
    // went out before the crash, so this can never double-send. computeNext("once")
    // is null, so reapOrphans would strand these as "invalid spec".
    const onceOrphans = orphans.filter((r) => r.cadence === "once");
    for (const o of onceOrphans) {
      const { error: onceErr } = await db
        .from("email_schedules")
        .update({ next_run_at: nowIso, updated_at: new Date().toISOString() })
        .eq("id", o.id);
      if (onceErr) console.error(`[run-schedules] once-orphan re-arm ${o.id}: ${onceErr.message}`);
      else console.log(`[run-schedules] once-orphan ${o.id} re-armed to now (claim key dedupes).`);
    }
    const rest = orphans.filter((r) => r.cadence !== "once");
    if (rest.length === 0) return;
    const reaped = await reapOrphans(
      rest,
      {
        computeNext: computeNextRunAt,
        async rearm(scheduleId: number, nextRunAt: string | null): Promise<void> {
          const { error: upErr } = await db
            .from("email_schedules")
            .update({ next_run_at: nextRunAt, updated_at: new Date().toISOString() })
            .eq("id", scheduleId);
          if (upErr) throw new Error(`reaper re-arm schedule ${scheduleId}: ${upErr.message}`);
        },
        log: (line: string) => console.log(line),
      },
      now,
    );
    const n = reaped.filter((r) => r.kind === "reaped").length;
    console.log(
      `[run-schedules] reaper re-armed ${n} crash-orphaned schedule(s) (of ${rest.length} stale parked cadence rows, threshold=${staleBeforeIso}).`,
    );
  }

  await reapCrashOrphans();

  const rows = await claimDue();
  console.log(
    `[run-schedules] ${DRY_RUN ? "DRY_RUN " : ""}claimed ${rows.length} due schedule(s) at ${nowIso}.`,
  );
  if (rows.length === 0) {
    console.log("[run-schedules] nothing due; exiting clean.");
    return;
  }

  // ── Block-canvas EmailDoc occurrence (N6) ──
  // The decision core lives in `lib/email/emaildoc-occurrence.ts` (load → re-build with
  // fresh data → render → subject; injected + unit-tested). Here we build the REAL seams:
  // the DB read, the ONE Email Lab build root (buildContentDoc), and the ONE EmailDoc
  // render root (renderEmailDocHtml). buildContentDoc fills content only — never restyles — so the
  // doc's own brand (globalStyle + header/footer) is preserved; the AI-fill falling
  // through (applied:false) ships the saved doc unchanged rather than a blank send.
  async function emailDocOccurrence(deliverableId: string) {
    return buildEmailDocOccurrence(deliverableId, {
      async loadDeliverable(id): Promise<EmailDocDeliverable | null> {
        const { data, error } = await db
          .from("deliverables")
          .select("doc, instruction, scope_kind, scope_value, template, project_id")
          .eq("id", id)
          .maybeSingle();
        if (error) {
          console.error(
            `[run-schedules] EmailDoc load failed (deliverable=${id}): ${error.message}`,
          );
          return null;
        }
        if (!data) return null;
        // Address spine: the owning listing project's saved subject address rides
        // the occurrence scope, read FRESH each send (never frozen — an updated
        // project address flows into future sends). Best-effort: any failure → null.
        let subjectAddress: string | null = null;
        const projectId = (data as { project_id?: string | null }).project_id ?? null;
        if (projectId) {
          const { data: proj } = await db
            .from("projects")
            .select("subject_address")
            .eq("id", projectId)
            .maybeSingle();
          subjectAddress = (proj?.subject_address as string | null) ?? null;
        }
        return {
          doc: data.doc,
          instruction: (data.instruction as string | null) ?? null,
          scope_kind: (data.scope_kind as string | null) ?? null,
          scope_value: (data.scope_value as string | null) ?? null,
          template: data.template as string,
          subject_address: subjectAddress,
        };
      },
      async buildDoc({ prompt, rawDoc, scope }) {
        const result = await buildContentDoc({ prompt, rawDoc, scope, mode: SCHEDULE_BUILD_MODE });
        // The re-filled doc on success, else the ORIGINAL valid doc (applied:false).
        return (result.payload?.doc as EmailDoc | undefined) ?? rawDoc;
      },
      renderDoc: renderEmailDocHtml,
      hostedUrl: `${SITE_URL}/p/${deliverableId}`,
      log: (line) => console.log(line),
    });
  }

  // Once rows terminate on completion (see the rearm dep): the batch rows are in
  // scope here so the dep can tell a once row from a cadence row by id.
  const claimedById = new Map(rows.map((r) => [r.id, r]));

  const deps: ProcessDeps = {
    dryRun: DRY_RUN,
    platform: PLATFORM,
    checkUsage: checkUsageLimit,
    recordSent: recordEmailSent,

    async readSenderConfig(userId: string): Promise<SenderConfigRow | null> {
      const { data, error } = await db
        .from("email_sender_config")
        .select("domain, resend_domain_id, from_name, from_email, reply_to, domain_verified")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw new Error(`read email_sender_config: ${error.message}`);
      return (data as SenderConfigRow | null) ?? null;
    },

    async readAudience(userId: string, slug: string): Promise<AudienceLookup | null> {
      const { data, error } = await db
        .from("email_audiences")
        .select("resend_audience_id, contact_count")
        .eq("user_id", userId)
        .eq("audience_slug", slug)
        .maybeSingle();
      if (error) throw new Error(`read email_audiences: ${error.message}`);
      return (data as AudienceLookup | null) ?? null;
    },

    async buildContent(row: ScheduleRow) {
      // Sequence one-shot (lifecycle arc): render the FROZEN saved doc verbatim —
      // no AI refill (freeze-at-schedule, operator-locked 07/05/2026). A missing/
      // invalid deliverable THROWS (loud per-row error outcome): a listing-milestone
      // email must never fall back to the whole-region digest.
      if (isSequenceOnceRow(row)) {
        const frozen = await buildFrozenOccurrence(row.deliverable_id!, {
          loadDeliverable: async (id) => {
            const { data, error } = await db
              .from("deliverables")
              .select("doc, instruction, scope_kind, scope_value, template")
              .eq("id", id)
              .maybeSingle();
            if (error || !data) return null;
            return {
              doc: data.doc,
              instruction: (data.instruction as string | null) ?? null,
              scope_kind: (data.scope_kind as string | null) ?? null,
              scope_value: (data.scope_value as string | null) ?? null,
              template: data.template as string,
            };
          },
          renderDoc: renderEmailDocHtml,
          hostedUrl: `${SITE_URL}/p/${row.deliverable_id}`,
          log: (line) => console.log(line),
        });
        if (frozen) return frozen;
        throw new Error(
          `sequence one-shot schedule=${row.id}: deliverable ${row.deliverable_id} missing/invalid — refusing digest fallback`,
        );
      }
      // Block-canvas EmailDoc lane (N6): a row carrying a deliverable_id +
      // template_id="block-canvas" re-renders the user's saved Email Lab design with
      // fresh data this occurrence. Returns finished HTML (emailDocHtml) the core
      // sends verbatim. A null (deliverable gone / invalid doc) THROWS: the digest
      // fallback is deleted, there is nothing honest to send instead, and a silent
      // skip would look green.
      if (row.template_id === "block-canvas" && row.deliverable_id) {
        const built = await emailDocOccurrence(row.deliverable_id);
        if (built) return built;
        throw new Error(
          `schedule=${row.id}: deliverable ${row.deliverable_id} missing/invalid — no send path (EmailDoc only)`,
        );
      }
      // Legacy digest/report/scoped/template rows have NO send path since the
      // 07/19/2026 rip (one email system). Loud per-row error, never batch-fatal:
      // the row errors every cycle until re-linked to a saved Email Lab design
      // (template_id="block-canvas" + deliverable_id) or deactivated.
      throw new Error(
        `schedule=${row.id}: legacy template_id=${row.template_id ?? "null"} has no send path — ` +
          "the digest/report/template lanes were removed; link the schedule to a saved Email Lab design.",
      );
    },

    async renderHtml(): Promise<string> {
      // Unreachable: both EmailDoc lanes return finished emailDocHtml (the core
      // skips renderHtml) and every other row throws in buildContent. Kept only
      // because ProcessDeps requires the seam — a call landing here means a new
      // body-only lane appeared without a render plan. Fail loud.
      throw new Error(
        "renderHtml is unreachable — the EmailDoc lanes return finished HTML (one email system, 07/19/2026).",
      );
    },

    async postBroadcast(req: BroadcastRequest): Promise<BroadcastResult> {
      // Per-request timeout: a hung broadcast must NOT stall the sequential batch.
      // On timeout, AbortSignal.timeout fires an AbortError → caught below and
      // returned as a normal {ok:false} per-row failure (never batch-fatal).
      let res: Response;
      try {
        res = await fetch(`${SITE_URL}/api/email/broadcast`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.DIGEST_BROADCAST_SECRET}`,
          },
          body: JSON.stringify(req),
          signal: AbortSignal.timeout(BROADCAST_TIMEOUT_MS),
        });
      } catch (err) {
        // AbortError (timeout) OR any network/fetch rejection → per-row failure.
        const isTimeout = err instanceof Error && err.name === "TimeoutError";
        const reason = isTimeout
          ? `timed out after ${BROADCAST_TIMEOUT_MS}ms`
          : err instanceof Error
            ? err.message
            : String(err);
        console.error(`[run-schedules] broadcast fetch failed: ${reason}`);
        return { ok: false, status: isTimeout ? "timeout" : "network_error", error: reason };
      }
      // Non-2xx → not ok; the core treats this as a per-row send failure (it does
      // NOT throw past the row boundary).
      if (!res.ok) {
        let detail = "";
        try {
          detail = JSON.stringify(await res.json());
        } catch {
          /* body not JSON */
        }
        console.error(`[run-schedules] broadcast ${res.status}: ${detail}`);
        return { ok: false, status: String(res.status) };
      }
      return (await res.json()) as BroadcastResult;
    },

    async rearm(scheduleId: number, nextRunAt: string | null): Promise<void> {
      // DRY_RUN: do NOT write back — leave the DB untouched (the dry select never
      // parked the row, so there is nothing to re-arm; we already logged the
      // computed next_run_at inside the core). A true read-only dry run.
      if (DRY_RUN) return;
      // A fired sequence one-shot terminates: computeNext("once") → null, and
      // instead of an active+parked zombie (permanent reaper noise) the row flips
      // to status='completed'. A definitive send failure re-arms non-null (+30min
      // retry) and stays active — the retry path is untouched.
      const isOnceDone = nextRunAt === null && claimedById.get(scheduleId)?.cadence === "once";
      const patch = isOnceDone
        ? { status: "completed", next_run_at: null, updated_at: new Date().toISOString() }
        : { next_run_at: nextRunAt, updated_at: new Date().toISOString() };
      const { error } = await db.from("email_schedules").update(patch).eq("id", scheduleId);
      if (error) throw new Error(`re-arm schedule ${scheduleId}: ${error.message}`);
    },

    // ── Buyer-Intent Reply Sensor ──
    // Each fire gets a fresh monitored reply address; the core overrides the
    // broadcast's reply_to with it and threads the SAME token into recordSend.
    resolveReplyTo(_row: ScheduleRow) {
      const token = generateReplyToken();
      return { token, address: buildReplyAddress(token, replyDomain()) };
    },

    async recordSend(
      row: ScheduleRow,
      result: BroadcastResult,
      reply: { token: string; address: string } | null,
    ): Promise<void> {
      if (!reply) return;
      const { error } = await db.from("email_sends").insert({
        user_id: row.user_id,
        schedule_id: row.id,
        audience_slug: row.audience_slug,
        broadcast_id: result.broadcast_id ?? null,
        reply_token: reply.token,
        reply_address: reply.address,
      });
      // Thrown here is caught by the core's best-effort wrapper (the email already
      // sent); it logs and continues rather than failing the batch.
      if (error) throw new Error(`insert email_sends: ${error.message}`);
    },

    // ── At-most-once idempotency ──
    async claimSend(row: ScheduleRow, fromUtc: Date): Promise<{ proceed: boolean }> {
      // Occurrence key, two lanes:
      //  - digest/report/scoped: scheduleId + the UTC date of this run instant. A
      //    same-day crash-replay re-claims the SAME key (dedupe → skip); the next
      //    cadence occurrence is a different date → a fresh key → sends.
      //  - sequence one-shot: DATE-FREE `once:<id>` — a one-shot fires at most once
      //    EVER, so a crash-orphan healed past midnight still dedupes.
      // Both are at-most-once defense-in-depth on top of the claim RPC's primary
      // guarantee — closing the crash-AFTER-POST-BEFORE-rearm window.
      const key = isSequenceOnceRow(row)
        ? onceClaimKey(row)
        : `digest:${row.id}:${fromUtc.toISOString().slice(0, 10)}`;
      const won = await claimOnce(db, key, {
        userId: row.user_id,
        kind: isSequenceOnceRow(row) ? "sequence" : "digest",
        scheduleId: row.id,
      });
      return { proceed: won };
    },

    // Release the SAME key after a DEFINITIVE non-2xx send failure (nothing was
    // sent) so the core's 30-min same-occurrence retry can re-claim. Key derivation
    // mirrors claimSend exactly.
    async releaseSend(row: ScheduleRow, fromUtc: Date): Promise<void> {
      const key = isSequenceOnceRow(row)
        ? onceClaimKey(row)
        : `digest:${row.id}:${fromUtc.toISOString().slice(0, 10)}`;
      await releaseClaim(db, key);
    },

    computeNext: computeNextRunAt,
    log: (line: string) => console.log(line),
  };

  const outcomes = await processBatch(rows, deps, now);
  summarize(outcomes);

  // LOUD-FAILURE GATE: any failed send exits non-zero so the GHA run goes RED and
  // the cron-incident capture fires. 07/04/2026 a 503 route dropped every send
  // while the run exited 0 — a silent no-send must never look green again.
  if (hasSendFailures(outcomes)) {
    console.error(
      "[run-schedules] one or more sends FAILED this cycle (see SEND FAILED lines above) — exiting 1 so the failure is visible.",
    );
    process.exitCode = 1;
  }
}

function summarize(outcomes: readonly ScheduleOutcome[]): void {
  const tally = { sent: 0, "dry-run": 0, skipped: 0, error: 0 } as Record<string, number>;
  for (const o of outcomes) tally[o.kind] = (tally[o.kind] ?? 0) + 1;
  console.log(
    `[run-schedules] done — sent=${tally.sent} dry-run=${tally["dry-run"]} ` +
      `skipped=${tally.skipped} error=${tally.error} (total=${outcomes.length}).`,
  );
}

main().catch((err) => {
  // Top-level fatal ONLY (missing env, claim unreachable, client construction).
  // Per-schedule errors are isolated inside processSchedule and never reach here.
  console.error("[run-schedules] FATAL", err);
  process.exit(1);
});
