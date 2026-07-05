// lib/social-pulse/load.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/database.types";
import type { PulseDigest } from "./digest";

export async function loadLatestDigest(deps?: {
  client?: SupabaseClient<Database>;
}): Promise<{ digest: PulseDigest; narrative: string | null } | null> {
  const client =
    deps?.client ?? (await import("@/utils/supabase/service-role")).createServiceRoleClient();
  const { data, error } = await client
    .from("social_pulse_digest")
    .select("week, digest, narrative")
    .order("week", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return { digest: data.digest as unknown as PulseDigest, narrative: data.narrative };
}
