import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * narrative_bake_batches access — batch-bake handoff bookkeeping (spec
 * 2026-07-10-batch-narrative-bake-design.md §3). A row with null collected_at
 * is pending; Phase 0 of the bake collects it. Untyped client: table ships
 * ahead of the next database-generated.types regen (allowlisted in
 * verification/supabase-untyped-allowlist.json).
 */

export interface BatchRequestEntry {
  customId: string;
  surface: string;
  key: string;
  inputsHash: string;
}

export interface PendingBatch {
  batchId: string;
  requests: BatchRequestEntry[];
  submittedAt: string;
}

function client(): SupabaseClient | null {
  const u = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const k = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!u || !k) return null;
  return createClient(u, k, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Persist BEFORE polling — a died run must leave a collectable trail. Throws loud. */
export async function persistPendingBatch(
  batchId: string,
  requests: BatchRequestEntry[],
): Promise<void> {
  const sb = client();
  if (!sb)
    throw new Error("narrative_bake_batches: SUPABASE_URL / SUPABASE_SERVICE_KEY not configured");
  const { error } = await sb
    .from("narrative_bake_batches")
    .upsert({ batch_id: batchId, requests }, { onConflict: "batch_id" });
  if (error) throw new Error(`persistPendingBatch(${batchId}) failed: ${error.message}`);
}

/** Uncollected rows, oldest first. Empty on missing config (offline dev). */
export async function loadPendingBatches(): Promise<PendingBatch[]> {
  const sb = client();
  if (!sb) return [];
  const { data, error } = await sb
    .from("narrative_bake_batches")
    .select("batch_id, requests, submitted_at")
    .is("collected_at", null)
    .order("submitted_at", { ascending: true });
  if (error || !data) return [];
  return (data as { batch_id: string; requests: BatchRequestEntry[]; submitted_at: string }[]).map(
    (r) => ({ batchId: r.batch_id, requests: r.requests, submittedAt: r.submitted_at }),
  );
}

export async function markBatchCollected(batchId: string): Promise<void> {
  const sb = client();
  if (!sb)
    throw new Error("narrative_bake_batches: SUPABASE_URL / SUPABASE_SERVICE_KEY not configured");
  const { error } = await sb
    .from("narrative_bake_batches")
    .update({ collected_at: new Date().toISOString() })
    .eq("batch_id", batchId);
  if (error) throw new Error(`markBatchCollected(${batchId}) failed: ${error.message}`);
}
