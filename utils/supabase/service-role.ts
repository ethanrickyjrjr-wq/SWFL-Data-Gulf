import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client that bypasses RLS via the service-role key.
 *
 * Use for writes from API routes against tables whose RLS policies grant
 * INSERT/UPDATE to `service_role` (e.g. `public.waitlist` — see
 * `docs/sql/20260523_waitlist.sql`). Never import from client components or
 * code that ships to the browser; the key would leak.
 *
 * Env vars: `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` (the canonical normalized
 * names per PR #19; see `.env.example` lines 9-10). Legacy `BRAINS_SUPABASE_*`
 * is accepted as a fallback so deploys carrying the old keys keep working —
 * `refinery/config/env.mts` follows the same read-canonical-fallback-legacy
 * pattern.
 *
 * Throws at call time (not module load) when env is missing so dev/build
 * environments without the key still boot.
 */
export function createServiceRoleClient(): SupabaseClient {
  // Accept either the canonical bare names (post-PR #19 normalization) or
  // the legacy BRAINS_-prefixed names — Vercel env may have either set.
  const url = process.env.SUPABASE_URL ?? process.env.BRAINS_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_KEY ?? process.env.BRAINS_SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error(
      "createServiceRoleClient: set SUPABASE_URL+SUPABASE_SERVICE_KEY (or legacy BRAINS_SUPABASE_URL+BRAINS_SUPABASE_SERVICE_KEY)",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
