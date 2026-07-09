import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { NarrativeRow } from "./types";

/**
 * narratives table access — reads for pages, upserts for the bake script.
 * Untyped client: the table ships ahead of the next database-generated.types
 * regen (file is allowlisted in verification/supabase-untyped-allowlist.json).
 */

function client(url?: string, key?: string): SupabaseClient | null {
  const u = url ?? process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const k =
    key ??
    process.env.SUPABASE_SERVICE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!u || !k) return null;
  return createClient(u, k, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Page read — null on any failure (sections are additive; page renders without). */
export async function loadNarrative(
  surface: string,
  surfaceKey: string,
): Promise<NarrativeRow | null> {
  const sb = client();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from("narratives")
      .select("surface, surface_key, sections, inputs_hash, sources, model, baked_at")
      .eq("surface", surface)
      .eq("surface_key", surfaceKey)
      .maybeSingle();
    if (error || !data) return null;
    return data as unknown as NarrativeRow;
  } catch {
    return null;
  }
}

/** Bake read — existing hashes for the delta gate, one query per surface. */
export async function loadInputsHashes(surface: string): Promise<Map<string, string>> {
  const sb = client();
  const out = new Map<string, string>();
  if (!sb) return out;
  const { data, error } = await sb
    .from("narratives")
    .select("surface_key, inputs_hash")
    .eq("surface", surface);
  if (error || !data) return out;
  for (const row of data as { surface_key: string; inputs_hash: string }[]) {
    out.set(row.surface_key, row.inputs_hash);
  }
  return out;
}

/** Idempotent upsert — the only write path. Throws on failure (bake exits loud). */
export async function upsertNarrative(row: Omit<NarrativeRow, "baked_at">): Promise<void> {
  const sb = client();
  if (!sb) throw new Error("narratives: SUPABASE_URL / SUPABASE_SERVICE_KEY not configured");
  const { error } = await sb
    .from("narratives")
    .upsert({ ...row, baked_at: new Date().toISOString() }, { onConflict: "surface,surface_key" });
  if (error)
    throw new Error(
      `narratives upsert failed for ${row.surface}/${row.surface_key}: ${error.message}`,
    );
}
