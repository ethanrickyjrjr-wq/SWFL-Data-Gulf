/**
 * At-most-once claim primitive for the multi-tenant email product.
 *
 * `claimOnce` is a SINGLE atomic statement — Supabase `.upsert(..., {
 * ignoreDuplicates: true })` → PostgREST `INSERT ... ON CONFLICT DO NOTHING`
 * against the UNIQUE(idempotency_key) index in `public.email_send_ledger`. There
 * is NO application-level SELECT-then-INSERT, so two concurrent cron workers (or a
 * crash-replay) racing the same key can't both win: the DB serializes on the
 * unique index and exactly one INSERT returns a row. The winner proceeds with the
 * side effect (a send); everyone else skips.
 *
 * Used by:
 *   - the cron digest worker (key `digest:<scheduleId>:<YYYY-MM-DD>`) — claim
 *     BEFORE the broadcast POST, so a customer is never double-sent;
 *   - the schedule-command confirm route (key `nonce:<nid>`) — single-use proposal
 *     nonce;
 *   - (reserved) the welcome→delta activation sequence + the reply sensor
 *     (`activation:<recipient>:<step>`), which reuse this exact seam.
 *
 * Table DDL: docs/sql/20260613_email_send_ledger.sql.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface SendLedgerContext {
  /** Owner of the row (RLS auth.uid() = user_id; service-role bypasses). */
  userId: string;
  /** Free-text class for observability: digest | nonce | activation | … */
  kind: string;
  scheduleId?: number | null;
  recipient?: string | null;
  sequenceStep?: string | null;
  broadcastId?: string | null;
}

/**
 * Try to claim `key`. Returns:
 *   - `true`  → THIS caller won the claim (first time) → proceed with the side effect;
 *   - `false` → the key was already claimed → skip (do NOT repeat the side effect).
 *
 * Error handling:
 *   - `42P01` (undefined_table — the migration isn't applied yet): returns `true`
 *     and warns. The cron is OFF until go-live applies the migration, so this only
 *     degrades gracefully in pre-migration/local runs; it never silently blocks sends.
 *   - any other DB error: THROWS (fail-closed — never double-send on an ambiguous
 *     error; the caller's per-row isolation turns it into a skipped/error outcome).
 */
export async function claimOnce(
  db: SupabaseClient,
  key: string,
  ctx: SendLedgerContext,
): Promise<boolean> {
  const { data, error } = await db
    .from("email_send_ledger")
    .upsert(
      {
        idempotency_key: key,
        user_id: ctx.userId,
        kind: ctx.kind,
        schedule_id: ctx.scheduleId ?? null,
        recipient: ctx.recipient ?? null,
        sequence_step: ctx.sequenceStep ?? null,
        broadcast_id: ctx.broadcastId ?? null,
      },
      { onConflict: "idempotency_key", ignoreDuplicates: true },
    )
    .select("id");

  if (error) {
    if ((error as { code?: string }).code === "42P01") {
      console.warn(
        `[idempotency] email_send_ledger missing — proceeding WITHOUT idempotency for "${key}". ` +
          `Apply docs/sql/20260613_email_send_ledger.sql.`,
      );
      return true;
    }
    throw new Error(`claimOnce("${key}"): ${error.message}`);
  }

  // ignoreDuplicates: PostgREST returns only the rows actually inserted. A non-empty
  // result means WE inserted (won the claim); an empty result means the key already
  // existed (lost the claim).
  return (data?.length ?? 0) > 0;
}
