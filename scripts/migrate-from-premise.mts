/**
 * One-shot data migration: Premise Engine → Brains Supabase.
 *
 * Run AFTER pasting docs/sql/20260517_brains_data_tables.sql into the
 * Brains SQL editor and confirming all 4 tables + the RPC exist.
 *
 *   npx tsx scripts/migrate-from-premise.mts
 *
 * Safe to re-run: each table is truncated before insert, so no duplicates.
 * The script is read-only on Premise (service_role readonly key) and
 * write-only on Brains (service_role key).
 *
 * Tables migrated:
 *   corridor_profiles          → Brains corridor_profiles
 *   fl_dor_tdt_collections     → Brains fl_dor_tdt_collections
 *   sba_loans_by_naics_county  → Brains sba_loans_by_naics_county
 *   get_franchise_outcomes_aggregated (RPC) → Brains sba_loans_franchise_outcomes
 */

// Load .env.local before anything else.
try {
  process.loadEnvFile(".env.local");
} catch {
  // CI / no .env.local
}

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function requireVar(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function premiseClient(): SupabaseClient {
  return createClient(
    requireVar("PREMISE_SUPABASE_URL"),
    requireVar("PREMISE_SUPABASE_READONLY_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

function brainsClient(): SupabaseClient {
  return createClient(
    requireVar("BRAINS_SUPABASE_URL"),
    requireVar("BRAINS_SUPABASE_SERVICE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fetch all rows with pagination to bypass the PostgREST 1000-row default. */
async function fetchAll(
  premise: SupabaseClient,
  table: string,
  select = "*",
): Promise<Record<string, unknown>[]> {
  const PAGE = 1000;
  const all: Record<string, unknown>[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await premise
      .from(table)
      .select(select)
      .range(from, from + PAGE - 1);
    if (error)
      throw new Error(`Premise fetch ${table} failed: ${error.message}`);
    // Supabase's `.select(string)` overload widens `data` to include
    // GenericStringError[]; that union doesn't directly cast to
    // Record<string, unknown>[]. We've already short-circuited on `error`
    // above, so funnel through unknown to silence TS2352.
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    all.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

/** Delete all rows via a filter on a required column, then bulk insert. */
async function clearAndInsert(
  brains: SupabaseClient,
  table: string,
  deleteCol: string,
  rows: Record<string, unknown>[],
): Promise<void> {
  if (rows.length === 0) {
    console.log(`  ${table}: 0 rows from Premise — skipping.`);
    return;
  }
  const { error: delErr } = await brains
    .from(table)
    .delete()
    .not(deleteCol, "is", null);
  if (delErr)
    console.warn(
      `  ${table}: clear warning — ${delErr.message}. Inserting anyway.`,
    );

  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await brains.from(table).insert(chunk);
    if (error)
      throw new Error(
        `Brains insert ${table} chunk ${i} failed: ${error.message}`,
      );
  }
  console.log(`  ${table}: ${rows.length} rows written.`);
}

// ---------------------------------------------------------------------------
// Per-table migrations
// ---------------------------------------------------------------------------

// Explicit column lists — Premise tables may have extra columns (e.g. centerline)
// that the Brains DDL doesn't define. We project only what Brains expects.
// id, created_at, updated_at omitted — not on Premise; Brains DDL has defaults.
const CORRIDOR_COLS = [
  "corridor_name",
  "city",
  "corridor_type",
  "seasonal_index",
  "character",
  "evolution_direction",
  "tenant_mix",
  "active_flags",
  "source_url",
  "verification_status",
  "deleted_at",
  "cap_rate_pct",
  "cap_rate_direction",
  "vacancy_rate_pct",
  "vacancy_rate_direction",
  "metrics_period",
  "metrics_verified_date",
].join(",");

const TDT_COLS = [
  "id",
  "county",
  "county_fips",
  "period",
  "collections_usd",
  "returns_filed",
  "source_url",
  "retrieved_at",
].join(",");

// Only the columns the sector-credit source actually reads; chargeoff_pct /
// total_chargeoff_amount / project_state may not exist on all MV versions.
const SBA_NAICS_COLS = [
  "project_county",
  "naics_code",
  "naics_description",
  "approval_fy",
  "n_loans",
  "total_approved",
  "n_chargeoffs",
  "n_paid_in_full",
].join(",");

async function migrateCorridorProfiles(
  premise: SupabaseClient,
  brains: SupabaseClient,
): Promise<void> {
  console.log("\ncorridor_profiles");
  const rows = await fetchAll(premise, "corridor_profiles", CORRIDOR_COLS);
  console.log(`  Fetched ${rows.length} rows from Premise.`);
  await clearAndInsert(brains, "corridor_profiles", "corridor_name", rows);
}

async function migrateTdtCollections(
  premise: SupabaseClient,
  brains: SupabaseClient,
): Promise<void> {
  console.log("\nfl_dor_tdt_collections");
  const rows = await fetchAll(premise, "fl_dor_tdt_collections", TDT_COLS);
  console.log(`  Fetched ${rows.length} rows from Premise.`);
  await clearAndInsert(brains, "fl_dor_tdt_collections", "id", rows);
}

async function migrateSbaNaics(
  premise: SupabaseClient,
  brains: SupabaseClient,
): Promise<void> {
  console.log("\nsba_loans_by_naics_county");
  const rows = await fetchAll(
    premise,
    "sba_loans_by_naics_county",
    SBA_NAICS_COLS,
  );
  console.log(`  Fetched ${rows.length} rows from Premise.`);
  await clearAndInsert(brains, "sba_loans_by_naics_county", "naics_code", rows);
}

async function migrateFranchiseOutcomes(
  premise: SupabaseClient,
  brains: SupabaseClient,
): Promise<void> {
  console.log("\nsba_loans_franchise_outcomes (via Premise RPC)");
  const { data, error } = await premise.rpc(
    "get_franchise_outcomes_aggregated",
  );
  if (error)
    throw new Error(
      `Premise RPC get_franchise_outcomes_aggregated failed: ${error.message}`,
    );
  const rows = (Array.isArray(data) ? data : []) as Record<string, unknown>[];
  console.log(`  Fetched ${rows.length} rows from Premise RPC.`);
  await clearAndInsert(
    brains,
    "sba_loans_franchise_outcomes",
    "franchise_code",
    rows,
  );
}

// ---------------------------------------------------------------------------
// Verification — quick row-count comparison
// ---------------------------------------------------------------------------

async function verify(
  premise: SupabaseClient,
  brains: SupabaseClient,
): Promise<void> {
  console.log("\n--- Verification (row counts) ---");
  const tables = [
    "corridor_profiles",
    "fl_dor_tdt_collections",
    "sba_loans_by_naics_county",
    "sba_loans_franchise_outcomes",
  ];
  for (const t of tables) {
    const { count: pCount } = await premise
      .from(t)
      .select("*", { count: "exact", head: true });
    const { count: bCount } = await brains
      .from(t)
      .select("*", { count: "exact", head: true });
    const match = pCount === bCount ? "✓" : "✗ MISMATCH";
    console.log(
      `  ${t}: Premise=${pCount ?? "?"} Brains=${bCount ?? "?"} ${match}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const premise = premiseClient();
const brains = brainsClient();

console.log("=== Brains migration from Premise Engine ===");
console.log(
  `Premise: ${requireVar("PREMISE_SUPABASE_URL")}\nBrains:  ${requireVar("BRAINS_SUPABASE_URL")}\n`,
);

try {
  await migrateCorridorProfiles(premise, brains);
  await migrateTdtCollections(premise, brains);
  await migrateSbaNaics(premise, brains);
  await migrateFranchiseOutcomes(premise, brains);
  await verify(premise, brains);
  console.log("\n✓ Migration complete.");
} catch (err) {
  console.error("\n✗ Migration failed:", err);
  process.exit(1);
}
