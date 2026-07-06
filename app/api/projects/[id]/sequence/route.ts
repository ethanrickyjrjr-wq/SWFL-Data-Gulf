// app/api/projects/[id]/sequence/route.ts
//
// Lifecycle-sequence arc state (spec 2026-07-05-lifecycle-sequences-design.md).
//   GET   — the project's armed arc, steps sent-reconciled from schedule rows.
//   POST  — arm the arc (default setup else platform), audience + hour chosen once.
//   PATCH — step ops: record-built | skip | unlock (unlock stops the pending
//           one-shot FIRST — nothing goes out — then thaws the step).
// Ownership via the owner-RLS'd projects/email_sequences tables (cookie client);
// the cron worker never reads these tables.

import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { SequenceStepsSchema, STEP_KEYS, type StepKey } from "@/lib/email/sequence/types";
import {
  applySetup,
  markBuilt,
  markSkipped,
  markUnlocked,
  reconcileSent,
} from "@/lib/email/sequence/state";
import { resolveArmSteps } from "@/lib/email/sequence/setup";
import { geocodeAddress } from "@/refinery/lib/geocode.mts";
import { addressKey } from "@/lib/listings/address-key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Db = ReturnType<typeof createClient>;

async function ownedProject(db: Db, id: string) {
  const { data } = await db
    .from("projects")
    .select("id, subject_address")
    .eq("id", id)
    .maybeSingle();
  return data;
}

async function loadSequence(db: Db, projectId: string) {
  const { data } = await db
    .from("email_sequences")
    .select("id, status, setup_name, audience_slug, send_hour_et, steps")
    .eq("project_id", projectId)
    .eq("status", "armed")
    .maybeSingle();
  if (!data) return null;
  const steps = SequenceStepsSchema.safeParse(data.steps);
  if (!steps.success) return null;
  // Sent truth from the schedule rows (reconcileSent) — never asserted blind.
  const ids = steps.data.map((s) => s.schedule_id).filter((n): n is number => n != null);
  let reconciled = steps.data;
  if (ids.length) {
    const { data: rows } = await db
      .from("email_schedules")
      .select("id, status, last_run_at")
      .in("id", ids);
    reconciled = reconcileSent(steps.data, rows ?? []);
  }
  return { ...data, steps: reconciled };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = createClient(await cookies());
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await ownedProject(db, id)))
    return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ sequence: await loadSequence(db, id) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = createClient(await cookies());
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const project = await ownedProject(db, id);
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const audience = typeof body?.audience_slug === "string" ? body.audience_slug.trim() : "";
  const hour = Number(body?.send_hour_et);
  if (!audience || !Number.isInteger(hour) || hour < 0 || hour > 23) {
    return NextResponse.json(
      { error: "audience_slug and send_hour_et (0-23) required" },
      { status: 422 },
    );
  }

  const { data: setups } = await db
    .from("email_sequence_setups")
    .select("name, is_default, steps")
    .eq("user_id", user.id);
  const { source, steps } = resolveArmSteps(setups ?? []);

  // Address matching (spec 2026-07-06-platform-arc-auto-advance-nudges-design.md): resolve once
  // at arm time so the daily nudge cron never re-geocodes. subject_address is free text like
  // "1234 Main St, Cape Coral, FL 33914" — the street portion (before the first comma) is what
  // the lake's own address_key() keys on (it only ever sees street_address, never city/state), so
  // we split on comma rather than passing the full string. A bad/incomplete address (no comma, or
  // geocode miss) leaves address_key null — that sequence is simply never a nudge candidate
  // (fail closed, no invented match).
  let address_key: string | null = null;
  if (project.subject_address) {
    const street = project.subject_address.split(",")[0]?.trim() ?? "";
    const geo = await geocodeAddress(project.subject_address);
    if (street && geo?.zip) address_key = addressKey(street, geo.zip);
  }

  const { data: created, error } = await db
    .from("email_sequences")
    .insert({
      user_id: user.id,
      project_id: id,
      setup_name: source,
      status: "armed",
      audience_slug: audience,
      send_hour_et: hour,
      steps: applySetup(steps),
      address_key,
    })
    .select("id, status, setup_name, audience_slug, send_hour_et, steps")
    .single();
  if (error) {
    // one_armed partial unique index → duplicate arm attempt.
    if (error.code === "23505")
      return NextResponse.json({ error: "already_armed" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ sequence: created }, { status: 201 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = createClient(await cookies());
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await ownedProject(db, id)))
    return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const key = STEP_KEYS.find((k) => k === body?.step_key) as StepKey | undefined;
  const op = body?.op;
  if (!key || !["record-built", "skip", "unlock"].includes(op)) {
    return NextResponse.json(
      { error: "step_key and op (record-built|skip|unlock) required" },
      { status: 422 },
    );
  }

  const seq = await loadSequence(db, id);
  if (!seq) return NextResponse.json({ error: "no armed sequence" }, { status: 404 });

  try {
    let steps = seq.steps;
    if (op === "record-built") {
      const did = typeof body?.deliverable_id === "string" ? body.deliverable_id : "";
      if (!did) return NextResponse.json({ error: "deliverable_id required" }, { status: 422 });
      steps = markBuilt(steps, key, did);
    } else if (op === "skip") {
      steps = markSkipped(steps, key);
    } else {
      // unlock: stop the pending one-shot FIRST (nothing goes out), then thaw.
      const step = steps.find((s) => s.key === key);
      if (step?.schedule_id != null) {
        const { error: stopErr } = await db
          .from("email_schedules")
          .update({ status: "stopped", next_run_at: null, updated_at: new Date().toISOString() })
          .eq("id", step.schedule_id)
          .eq("user_id", user.id);
        if (stopErr) return NextResponse.json({ error: stopErr.message }, { status: 500 });
      }
      steps = markUnlocked(steps, key);
    }
    const { error: upErr } = await db
      .from("email_sequences")
      .update({ steps, updated_at: new Date().toISOString() })
      .eq("id", seq.id);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    return NextResponse.json({ sequence: { ...seq, steps } });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "illegal transition" },
      { status: 409 },
    );
  }
}
