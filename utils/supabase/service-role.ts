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
 * names per PR #19; see `.env.example` lines 9-10). The refinery still reads
 * the legacy `BRAINS_SUPABASE_*` pair in `refinery/config/env.mts:76-77` —
 * separate concern, separate cleanup PR.
 *
 * Throws at call time (not module load) when env is missing so dev/build
 * environments without the key still boot.
 */
export function createServiceRoleClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error(
      "createServiceRoleClient: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
