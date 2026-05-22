/**
 * Split "Naples Airport-Pulling" into two corridor rows.
 *
 * Airport-Pulling Rd crosses the Pine Ridge Rd CW submarket boundary:
 *   North of Pine Ridge → N Naples submarket (strip/neighborhood retail, $30.91 NNN)
 *   South of Pine Ridge → Naples submarket  (commercial/business node, $60.84 NNN)
 *
 * SOURCES:
 *   CW SWFL Retail MarketBeat Q4 2025
 *   https://assets.cushmanwakefield.com/-/media/cw/marketbeat-pdfs/2025/q4/us-reports/retail/fortmyersnaples_americas_marketbeat_retail_q42025.pdf
 *
 * METRICS APPLIED:
 *   North: N Naples — $30.91 NNN, 3.3% vacancy (stable), 6.7% cap (rising)
 *   South: Naples   — $60.84 NNN, 1.8% vacancy (falling), 6.7% cap (rising)
 *   Cap rate: market-wide retail (CW publishes no Naples-specific submarket cap)
 *   Absorption: null on both rows — submarket absorption can't be attributed to a sub-corridor
 *
 * NOTE — character field:
 *   The existing character narrative describes the full corridor. Both rows inherit it
 *   as a placeholder; update to north/south-specific text when center-level data is
 *   available (see memory: project_airport-pulling-split.md).
 *
 * Usage:
 *   bun refinery/__scratch__/split-airport-pulling.mts --dry-run
 *   bun refinery/__scratch__/split-airport-pulling.mts
 */
import { createClient } from "@supabase/supabase-js";

const PERIOD = "2026-Q1";
const VERIFIED_DATE = "2026-05-21";

const dryRun = process.argv.includes("--dry-run");

const sb = createClient(
  process.env.BRAINS_SUPABASE_URL!,
  process.env.BRAINS_SUPABASE_SERVICE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

// ── 1. Read existing row ────────────────────────────────────────────────────
const { data: existing, error: readErr } = await sb
  .from("corridor_profiles")
  .select("*")
  .eq("corridor_name", "Naples Airport-Pulling")
  .is("deleted_at", null)
  .single();

if (readErr || !existing) {
  console.error("FAIL  read existing row:", readErr?.message ?? "not found");
  process.exit(1);
}
console.log(`Read: "${existing.corridor_name}" (id=${existing.id})`);

// ── 2. Build payloads ───────────────────────────────────────────────────────
const { id, created_at, updated_at, ...copyFields } = existing as Record<
  string,
  unknown
>;
void id;
void created_at;
void updated_at; // strip auto-generated

const NORTH_OVERRIDES = {
  corridor_name: "Naples Airport-Pulling (North)",
  asking_rent_psf: 30.91,
  asking_rent_psf_direction: "stable",
  vacancy_rate_pct: 3.3,
  vacancy_rate_direction: "stable",
  cap_rate_pct: 6.7,
  cap_rate_direction: "rising",
  absorption_sqft: null,
  metrics_period: PERIOD,
  metrics_verified_date: VERIFIED_DATE,
};

const SOUTH_OVERRIDES = {
  corridor_name: "Naples Airport-Pulling (South)",
  asking_rent_psf: 60.84,
  asking_rent_psf_direction: "rising",
  vacancy_rate_pct: 1.8,
  vacancy_rate_direction: "falling",
  cap_rate_pct: 6.7,
  cap_rate_direction: "rising",
  absorption_sqft: null,
  metrics_period: PERIOD,
  metrics_verified_date: VERIFIED_DATE,
};

const southRow = { ...copyFields, ...SOUTH_OVERRIDES };

if (dryRun) {
  console.log("\n--dry-run: would apply:");
  console.log(
    `  UPDATE  "Naples Airport-Pulling" → "Naples Airport-Pulling (North)"`,
  );
  for (const [k, v] of Object.entries(NORTH_OVERRIDES)) {
    console.log(`    ${k}: ${v}`);
  }
  console.log(`  INSERT  "Naples Airport-Pulling (South)"`);
  for (const [k, v] of Object.entries(SOUTH_OVERRIDES)) {
    console.log(`    ${k}: ${v}`);
  }
  console.log("\n--dry-run: no DB writes performed.");
  process.exit(0);
}

// ── 3. Rename existing row → North ──────────────────────────────────────────
const { error: updateErr, count: updateCount } = await sb
  .from("corridor_profiles")
  .update(NORTH_OVERRIDES, { count: "exact" })
  .eq("corridor_name", "Naples Airport-Pulling")
  .is("deleted_at", null);

if (updateErr) {
  console.error("FAIL  rename → North:", updateErr.message);
  process.exit(1);
}
console.log(
  `OK    renamed → "Naples Airport-Pulling (North)" (rows=${updateCount ?? "?"})`,
);

// ── 4. Insert South row ─────────────────────────────────────────────────────
const { error: insertErr } = await sb
  .from("corridor_profiles")
  .insert(southRow);

if (insertErr) {
  console.error("FAIL  insert South:", insertErr.message);
  // Don't exit — North rename already committed; log for manual fix
  process.exit(1);
}
console.log(`OK    inserted  "Naples Airport-Pulling (South)"`);

console.log("\nDone. Run: npm run refinery:cre");
