import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, requireEnv } from "../config/env.mts";

let cached: SupabaseClient | null = null;
let premiseCached: SupabaseClient | null = null;

/**
 * Brains Supabase client (jtkdowmrjaxfvwmemxso) — all live source reads go here.
 * The Refinery never writes — no insert/update/upsert anywhere in refinery/.
 * Only called in live mode; fixture mode never touches the network.
 */
export function getSupabase(): SupabaseClient {
  if (cached) return cached;
  requireEnv(["supabaseUrl", "supabaseKey"]);
  cached = createClient(env.supabaseUrl as string, env.supabaseKey as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

/**
 * Premise Engine Supabase client (tssgulkyczfefucmrtda) — transition-period only.
 * Used exclusively by the migration script; remove once all tables are on Brains.
 */
export function getPremiseSupabase(): SupabaseClient {
  if (premiseCached) return premiseCached;
  requireEnv(["premiseSupabaseUrl", "premiseSupabaseKey"]);
  premiseCached = createClient(
    env.premiseSupabaseUrl as string,
    env.premiseSupabaseKey as string,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  return premiseCached;
}
