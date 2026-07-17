/**
 * POST /api/switch/apply-forward — the ONLY place a pending forward (Task
 * 10's webhook branch, stash-then-confirm) becomes a real write.
 *
 * SECURITY (07/17/2026 review): the webhook can't be trusted to identify an
 * account -- an inbound `From` is attacker-claimable. So the webhook only
 * stashes what it parsed (public.switch_forwards, status 'pending'); this
 * route is where the actual contacts/agent_profile_facts/switch_passes write
 * happens, gated on a REAL authenticated session (cookie auth, same as every
 * other authed route in this app) rather than an email header. Ownership +
 * status are checked before any write (`lib/switch/forward-handler.ts`'s
 * `applyForward`) -- a forward that isn't the caller's, or isn't pending
 * anymore, 404s without revealing which case it was.
 *
 * Body: `{ forwardId: string, dismiss?: boolean }`. `dismiss: true` marks the
 * row dismissed without applying it (the agent said "not mine" / "no thanks").
 *
 * This route is the ADAPTER: cookie-auth lookup + a service-role client for
 * the actual reads/writes. All decision logic (ownership/status gate, the
 * per-kind apply behavior) lives in `applyForward` (unit-tested with mocks).
 */
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { upsertCanonicalContacts } from "@/lib/contacts/upsert";
import { activateSwitchPass } from "@/lib/switch/activate";
import {
  applyForward,
  type ApplyForwardDeps,
  type SwitchForwardRow,
} from "@/lib/switch/forward-handler";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const forwardId = typeof body?.forwardId === "string" ? body.forwardId : null;
  if (!forwardId) {
    return NextResponse.json({ error: "forwardId required" }, { status: 400 });
  }
  const dismiss = body?.dismiss === true;

  const sdb = createServiceRoleClient();

  const deps: ApplyForwardDeps = {
    log: (line) => console.log(line),

    async loadForward(id) {
      const { data, error } = await sdb
        .from("switch_forwards")
        .select("id, user_id, kind, status, message_id, payload")
        .eq("id", id)
        .maybeSingle();
      if (error || !data) return null;
      return {
        id: data.id,
        userId: data.user_id,
        kind: data.kind as SwitchForwardRow["kind"],
        status: data.status as SwitchForwardRow["status"],
        messageId: data.message_id,
        payload: data.payload,
      };
    },

    async markApplied(id) {
      const { error } = await sdb
        .from("switch_forwards")
        .update({ status: "applied" })
        .eq("id", id);
      if (error) console.error(`[apply-forward] mark applied failed: ${error.message}`);
    },

    async markDismissed(id) {
      const { error } = await sdb
        .from("switch_forwards")
        .update({ status: "dismissed" })
        .eq("id", id);
      if (error) console.error(`[apply-forward] mark dismissed failed: ${error.message}`);
    },

    async upsertContacts(userId, rows) {
      return upsertCanonicalContacts(sdb, userId, rows);
    },

    async activatePass(userId, proof) {
      return activateSwitchPass(sdb, userId, proof);
    },

    async insertProfileFact(userId, value, messageId) {
      const { error } = await sdb.from("agent_profile_facts").insert({
        user_id: userId,
        key: "forwarded_campaign_about",
        value,
        source: "agent_upload",
        source_detail: messageId,
      });
      if (!error) return "inserted";
      // 23505 = a LIVE fact already exists for (user_id, key) — first
      // forward wins; superseding is a later extension, not this task's.
      if (error.code === "23505") return "duplicate";
      console.error(`[apply-forward] profile fact insert failed: ${error.message}`);
      return "error";
    },
  };

  try {
    const outcome = await applyForward(forwardId, user.id, dismiss, deps);

    switch (outcome.kind) {
      case "not_found":
        // Never distinguish "doesn't exist" from "not yours" from "already
        // applied" over the wire (security review) -- a uniform 404 either
        // way. `outcome.reason` is logged server-side by applyForward itself.
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      case "dismissed":
        return NextResponse.json({ dismissed: true });
      case "apply_failed":
        return NextResponse.json({ error: "apply_failed" }, { status: 500 });
      case "applied_contact_export":
        return NextResponse.json({
          imported: outcome.added,
          skipped: outcome.skipped,
          pass: outcome.passActivated,
          partial: outcome.partial || undefined,
        });
      case "applied_campaign":
        return NextResponse.json({ applied: true });
    }
  } catch (err) {
    console.error(`[apply-forward] failed: ${err instanceof Error ? err.message : String(err)}`);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
