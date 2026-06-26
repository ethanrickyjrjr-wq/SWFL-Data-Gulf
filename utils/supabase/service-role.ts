import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/database.types";

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
function serviceRoleEnv(): { url: string; key: string } {
  // Accept either the canonical bare names (post-PR #19 normalization) or
  // the legacy BRAINS_-prefixed names — Vercel env may have either set.
  const url = process.env.SUPABASE_URL ?? process.env.BRAINS_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY ?? process.env.BRAINS_SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error(
      "createServiceRoleClient: set SUPABASE_URL+SUPABASE_SERVICE_KEY (or legacy BRAINS_SUPABASE_URL+BRAINS_SUPABASE_SERVICE_KEY)",
    );
  }
  return { url, key };
}

export function createServiceRoleClient(): SupabaseClient<Database> {
  const { url, key } = serviceRoleEnv();
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// TEMPORARY opt-out — the SECOND untyped hatch (mirrors `createClientUntyped` in
// ./server.ts). Identical runtime; the return is the un-parameterized
// `SupabaseClient` (schema generic defaults to `any`) so callers can reach
// `.schema("data_lake")` (which we did NOT type) and call `.rpc(...)` for
// functions the generator never introspected (`Functions: Record<string, never>`).
// Every use MUST carry a `// KNOWN-DEBT(<reason>):` comment. ESLint (Task 5) must
// block new uses of THIS hatch too, not just the server one.
export function createServiceRoleClientUntyped(): SupabaseClient {
  const { url, key } = serviceRoleEnv();
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
