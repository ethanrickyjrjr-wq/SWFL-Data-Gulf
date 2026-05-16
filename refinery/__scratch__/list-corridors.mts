import { createClient } from "@supabase/supabase-js";
const sb = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_READONLY_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const { data, error } = await sb
  .from("corridor_profiles")
  .select("corridor_name, city, corridor_type")
  .is("deleted_at", null)
  .eq("verification_status", "verified")
  .order("corridor_name", { ascending: true });
if (error) throw error;
console.log("COUNT:", data?.length);
for (const r of data ?? []) {
  console.log(`${r.corridor_name}\t|\t${r.city}\t|\t${r.corridor_type}`);
}
