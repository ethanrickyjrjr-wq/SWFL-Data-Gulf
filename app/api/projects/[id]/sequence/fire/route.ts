// app/api/projects/[id]/sequence/fire/route.ts
//
// Milestone fire (spec 2026-07-05-lifecycle-sequences-design.md). POST
// {step_key, mode:"now"|"at", at_iso?}:
//   - both modes create/reactivate the ONE-SHOT schedule row through the
//     existing idempotent bridge (deliverableToScheduleRecipe → createOrTouchSchedule);
//   - "now" then runs the cron's own processSchedule core RIGHT HERE with
//     frozen-render deps (no LLM — seconds). Losing the single-row claim to a
//     concurrent cron tick = "queued" (the send is happening either way);
//   - "at" = freeze-at-schedule; the cron fires it within ~15 min of the time.
// Sending requires a BUILT piece (409 not_built) — nothing sends unseen.

import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { deliverableToScheduleRecipe } from "@/lib/deliverable/schedule-recipe";
import { createOrTouchSchedule, type ScheduleUpsertDb } from "@/lib/email/schedule-upsert";
import { computeNextRunAt } from "@/lib/email/schedule-cadence";
import {
  processSchedule,
  type BroadcastRequest,
  type BroadcastResult,
  type ProcessDeps,
  type ScheduleRow,
} from "@/lib/email/scheduler";
import { checkUsageLimit, recordEmailSent } from "@/lib/email/usage";
import { claimOnce, releaseClaim } from "@/lib/email/idempotency";
import { isSequenceOnceRow, onceClaimKey } from "@/lib/email/sequence/once";
import { buildFrozenOccurrence } from "@/lib/email/sequence/frozen-occurrence";
import { sendOnceNow } from "@/lib/email/sequence/send-now";
import { renderEmailDocHtml } from "@/lib/email/render-email-doc";
import { etHour } from "@/lib/email/sequence/et-hour";
import { SequenceStepsSchema, STEP_KEYS, type StepKey } from "@/lib/email/sequence/types";
import { markScheduled, markSent } from "@/lib/email/sequence/state";
import type { SenderConfigRow } from "@/lib/email/sender-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // frozen render + broadcast POST, no LLM — seconds

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "";
const PLATFORM = {
  fromName: process.env.DIGEST_SENDER_NAME ?? "SWFL Data Gulf",
  fromEmail: process.env.DIGEST_SENDER_ADDRESS ?? "hello@swfldatagulf.com",
};

type Admin = ReturnType<typeof createServiceRoleClient>;

/** Minimal once-lane deps: the FROZEN render only — a sequence fire never
 *  touches the digest/report lanes and never calls an LLM. */
function buildOnceDeps(admin: Admin): ProcessDeps {
  return {
    dryRun: false,
    platform: PLATFORM,
    checkUsage: checkUsageLimit,
    recordSent: recordEmailSent,
    async readSenderConfig(userId) {
      const { data, error } = await admin
        .from("email_sender_config")
        .select("domain, resend_domain_id, from_name, from_email, reply_to, domain_verified")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw new Error(`read email_sender_config: ${error.message}`);
      return (data as SenderConfigRow | null) ?? null;
    },
    async readAudience(userId, slug) {
      const { data, error } = await admin
        .from("email_audiences")
        .select("resend_audience_id, contact_count")
        .eq("user_id", userId)
        .eq("audience_slug", slug)
        .maybeSingle();
      if (error) throw new Error(`read email_audiences: ${error.message}`);
      return data ?? null;
    },
    async buildContent(row) {
      if (!isSequenceOnceRow(row)) {
        throw new Error(`send-now: schedule ${row.id} is not a sequence one-shot`);
      }
      const frozen = await buildFrozenOccurrence(row.deliverable_id!, {
        loadDeliverable: async (id) => {
          const { data, error } = await admin
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
        log: (l) => console.log(l),
      });
      if (!frozen) throw new Error(`send-now: deliverable ${row.deliverable_id} missing/invalid`);
      return frozen;
    },
    async renderHtml() {
      throw new Error("unreachable: the once lane always returns emailDocHtml");
    },
    async postBroadcast(req: BroadcastRequest): Promise<BroadcastResult> {
      if (!SITE_URL || !process.env.DIGEST_BROADCAST_SECRET) {
        // Definitive failure → claim released, row re-arms +30min → the CRON
        // (which has the env) carries the send. Never eaten, never doubled.
        return { ok: false, status: "500", error: "broadcast env missing in this runtime" };
      }
      try {
        const res = await fetch(`${SITE_URL}/api/email/broadcast`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.DIGEST_BROADCAST_SECRET}`,
          },
          body: JSON.stringify(req),
          signal: AbortSignal.timeout(30_000),
        });
        if (!res.ok) return { ok: false, status: String(res.status) };
        return (await res.json()) as BroadcastResult;
      } catch (err) {
        const isTimeout = err instanceof Error && err.name === "TimeoutError";
        return { ok: false, status: isTimeout ? "timeout" : "network_error" };
      }
    },
    async rearm(scheduleId, nextRunAt) {
      // Only once rows flow through this route: null next = fired → completed.
      const patch =
        nextRunAt === null
          ? { status: "completed", next_run_at: null, updated_at: new Date().toISOString() }
          : { next_run_at: nextRunAt, updated_at: new Date().toISOString() };
      const { error } = await admin.from("email_schedules").update(patch).eq("id", scheduleId);
      if (error) throw new Error(`re-arm schedule ${scheduleId}: ${error.message}`);
    },
    async claimSend(row) {
      const won = await claimOnce(admin, onceClaimKey(row), {
        userId: row.user_id,
        kind: "sequence",
        scheduleId: row.id,
      });
      return { proceed: won };
    },
    async releaseSend(row) {
      await releaseClaim(admin, onceClaimKey(row));
    },
    computeNext: computeNextRunAt,
    log: (l) => console.log(l),
  };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = createClient(await cookies());
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: project } = await db.from("projects").select("id").eq("id", id).maybeSingle();
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const key = STEP_KEYS.find((k) => k === body?.step_key) as StepKey | undefined;
  const mode = body?.mode === "at" ? "at" : body?.mode === "now" ? "now" : null;
  const atIso = typeof body?.at_iso === "string" ? body.at_iso : null;
  if (!key || !mode || (mode === "at" && (!atIso || Number.isNaN(Date.parse(atIso))))) {
    return NextResponse.json(
      { error: "step_key + mode (now|at, at needs at_iso) required" },
      { status: 422 },
    );
  }
  const now = new Date();
  const fireAt = mode === "now" ? now : new Date(atIso!);
  if (mode === "at" && fireAt.getTime() <= now.getTime()) {
    return NextResponse.json({ error: "at_iso must be in the future" }, { status: 422 });
  }

  // Load the armed sequence + the step; sending requires a BUILT piece.
  const { data: seqRow } = await db
    .from("email_sequences")
    .select("id, audience_slug, steps")
    .eq("project_id", id)
    .eq("status", "armed")
    .maybeSingle();
  if (!seqRow) return NextResponse.json({ error: "no armed sequence" }, { status: 404 });
  const parsed = SequenceStepsSchema.safeParse(seqRow.steps);
  if (!parsed.success)
    return NextResponse.json({ error: "corrupt sequence steps" }, { status: 500 });
  const step = parsed.data.find((s) => s.key === key);
  if (!step) return NextResponse.json({ error: "unknown step" }, { status: 422 });
  if (step.state === "sent") return NextResponse.json({ error: "already sent" }, { status: 409 });
  if (step.state !== "built" || !step.deliverable_id) {
    return NextResponse.json({ error: "not_built" }, { status: 409 });
  }
  if (!seqRow.audience_slug) {
    return NextResponse.json({ error: "no audience on the arc" }, { status: 422 });
  }

  // Deliverable → once command through the existing bridge + validator.
  const { data: deliv } = await db
    .from("deliverables")
    .select("id, template, scope_kind, scope_value")
    .eq("id", step.deliverable_id)
    .eq("project_id", id)
    .maybeSingle();
  if (!deliv) return NextResponse.json({ error: "deliverable gone" }, { status: 409 });
  const recipe = deliverableToScheduleRecipe(deliv, {
    cadence: "once",
    send_hour_et: etHour(fireAt),
    audience_slug: seqRow.audience_slug,
  });
  if (!recipe.ok) return NextResponse.json({ error: recipe.error }, { status: 422 });

  // Idempotent create/reactivate, armed at the chosen instant (cookie client — RLS).
  const { id: scheduleId } = await createOrTouchSchedule(db as unknown as ScheduleUpsertDb, {
    userId: user.id,
    projectId: id,
    command: recipe.command,
    nowIso: now.toISOString(),
    nextRunAtIso: fireAt.toISOString(),
  });

  // Persist the step state BEFORE attempting the in-request send.
  let steps = markScheduled(parsed.data, key, scheduleId, fireAt.toISOString());
  await db
    .from("email_sequences")
    .update({ steps, updated_at: now.toISOString() })
    .eq("id", seqRow.id);

  if (mode === "at") {
    return NextResponse.json({
      result: "scheduled",
      scheduled_for: fireAt.toISOString(),
      schedule_id: scheduleId,
    });
  }

  // mode "now": run the cron's own core right here; cron is the crash net.
  const admin = createServiceRoleClient();
  const outcome = await sendOnceNow(
    scheduleId,
    {
      claimRow: async (sid, nowIso) => {
        const { data } = await admin
          .from("email_schedules")
          .update({ next_run_at: null, last_run_at: nowIso, updated_at: nowIso })
          .eq("id", sid)
          .eq("status", "active")
          .not("next_run_at", "is", null)
          .select("*")
          .maybeSingle();
        return (data as ScheduleRow | null) ?? null;
      },
      process: (row, fromUtc) => processSchedule(row, buildOnceDeps(admin), fromUtc),
      log: (l) => console.log(l),
    },
    now,
  );

  if (outcome.kind === "sent") {
    steps = markSent(steps, key, now.toISOString());
    await db
      .from("email_sequences")
      .update({ steps, updated_at: new Date().toISOString() })
      .eq("id", seqRow.id);
    return NextResponse.json({ result: "sent", recipients: outcome.recipients });
  }
  // queued / skipped / error: the row is armed or retrying — the cron carries it.
  // GET's reconcileSent flips the step when the schedule row completes.
  return NextResponse.json({ result: "queued", detail: outcome.kind, schedule_id: scheduleId });
}
