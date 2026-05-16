import { createClient } from "@supabase/supabase-js";
// Bun auto-loads .env.local from CWD; no explicit loadEnvFile call needed.
const sb = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_READONLY_KEY!,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);

// Probe 1: row count + sample, INCLUDING the new metric columns the migration adds
const probe = await sb
  .from("corridor_profiles")
  .select(
    "corridor_name, city, corridor_type, cap_rate_pct, cap_rate_direction, vacancy_rate_pct, vacancy_rate_direction, metrics_period, metrics_verified_date",
    { count: "exact" },
  )
  .is("deleted_at", null)
  .eq("verification_status", "verified")
  .order("corridor_name", { ascending: true });

if (probe.error) {
  console.log("METRICS_COLS_MISSING:", probe.error.message);
  // Fallback — confirm key works and count rows
  const fallback = await sb
    .from("corridor_profiles")
    .select("corridor_name, city, corridor_type", { count: "exact" })
    .is("deleted_at", null)
    .eq("verification_status", "verified");
  if (fallback.error) {
    console.log("FALLBACK_ERROR:", fallback.error.message);
  } else {
    console.log("FALLBACK_COUNT:", fallback.count);
    console.log(
      "FALLBACK_FIRST3:",
      JSON.stringify(fallback.data?.slice(0, 3), null, 2),
    );
  }
} else {
  console.log("HAS_METRICS_COLS: true");
  console.log("COUNT:", probe.count);
  const withCap = probe.data?.filter((r) => r.cap_rate_pct != null).length ?? 0;
  const withVac =
    probe.data?.filter((r) => r.vacancy_rate_pct != null).length ?? 0;
  console.log(`HAS_CAP_DATA: ${withCap} / ${probe.count}`);
  console.log(`HAS_VAC_DATA: ${withVac} / ${probe.count}`);
  console.log("FIRST3:", JSON.stringify(probe.data?.slice(0, 3), null, 2));
}
