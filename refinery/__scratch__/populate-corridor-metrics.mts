/**
 * Populate test-scaffolding cap_rate / vacancy_rate metrics on the 25 verified
 * SWFL corridor_profiles rows. Designed so the cre-swfl producer votes bullish
 * (17 of 21 with-data corridors carry a falling signal, no rising contradiction
 * — 0.81 ratio, well above the 0.60 floor).
 *
 * Values are PLAUSIBLE SWFL CRE numbers, not market-verified. They are stamped
 * with metrics_period = "2026-Q1-TEST" and metrics_verified_date = "2026-05-15"
 * so the user can identify and overwrite them when real market reads land.
 *
 * Run after applying docs/sql/20260515_corridor_metrics_migration.sql.
 *
 * Usage:
 *   bun refinery/__scratch__/populate-corridor-metrics.mts --dry-run    # show plan
 *   bun refinery/__scratch__/populate-corridor-metrics.mts              # write
 */
import { createClient } from "@supabase/supabase-js";

type Dir = "rising" | "falling" | "stable" | null;
interface MetricRow {
  cap_rate_pct: number | null;
  cap_rate_direction: Dir;
  vacancy_rate_pct: number | null;
  vacancy_rate_direction: Dir;
}

const PERIOD = "2026-Q1-TEST";
const VERIFIED_DATE = "2026-05-15";

const PLAN: Record<string, MetricRow & { _vote: string }> = {
  // ----- bullish (17) — falling, no rising ----------------------------------
  "5th Ave South / 3rd Street South": {
    cap_rate_pct: 5.25,
    cap_rate_direction: "falling",
    vacancy_rate_pct: 1.5,
    vacancy_rate_direction: "falling",
    _vote: "bullish",
  },
  "Ben Hill Griffin Pkwy": {
    cap_rate_pct: 6.25,
    cap_rate_direction: "falling",
    vacancy_rate_pct: 7.0,
    vacancy_rate_direction: "falling",
    _vote: "bullish",
  },
  "Bonita Beach Rd (US-41 to Sanibel Causeway)": {
    cap_rate_pct: 6.0,
    cap_rate_direction: "falling",
    vacancy_rate_pct: 6.0,
    vacancy_rate_direction: "falling",
    _vote: "bullish",
  },
  "Cape Coral – Coral Pointe": {
    cap_rate_pct: 6.5,
    cap_rate_direction: "falling",
    vacancy_rate_pct: 4.5,
    vacancy_rate_direction: "falling",
    _vote: "bullish",
  },
  "Cape Coral Pkwy E": {
    cap_rate_pct: 6.75,
    cap_rate_direction: "falling",
    vacancy_rate_pct: 6.0,
    vacancy_rate_direction: "stable",
    _vote: "bullish",
  },
  "Collier Blvd / CR-951": {
    cap_rate_pct: 6.25,
    cap_rate_direction: "falling",
    vacancy_rate_pct: 5.0,
    vacancy_rate_direction: "falling",
    _vote: "bullish",
  },
  "Colonial Blvd East (US-41 to I-75)": {
    cap_rate_pct: 6.25,
    cap_rate_direction: "falling",
    vacancy_rate_pct: 5.5,
    vacancy_rate_direction: "falling",
    _vote: "bullish",
  },
  "Daniels Pkwy (I-75 to Ben Hill Griffin)": {
    cap_rate_pct: 6.0,
    cap_rate_direction: "falling",
    vacancy_rate_pct: 5.0,
    vacancy_rate_direction: "falling",
    _vote: "bullish",
  },
  "Davis Blvd East Naples": {
    cap_rate_pct: 6.0,
    cap_rate_direction: "falling",
    vacancy_rate_pct: 5.5,
    vacancy_rate_direction: "falling",
    _vote: "bullish",
  },
  "Immokalee Rd North Naples": {
    cap_rate_pct: 5.75,
    cap_rate_direction: "falling",
    vacancy_rate_pct: 4.0,
    vacancy_rate_direction: "falling",
    _vote: "bullish",
  },
  "Pine Island Rd Cape Coral": {
    cap_rate_pct: 6.25,
    cap_rate_direction: "falling",
    vacancy_rate_pct: 4.0,
    vacancy_rate_direction: "falling",
    _vote: "bullish",
  },
  "Six Mile Cypress Pkwy": {
    cap_rate_pct: 7.0,
    cap_rate_direction: "falling",
    vacancy_rate_pct: 6.0,
    vacancy_rate_direction: "stable",
    _vote: "bullish",
  },
  "Summerlin Rd Fort Myers": {
    cap_rate_pct: 6.5,
    cap_rate_direction: "falling",
    vacancy_rate_pct: 4.5,
    vacancy_rate_direction: "stable",
    _vote: "bullish",
  },
  "Three Oaks Pkwy / Coconut Rd (Estero/Bonita boundary)": {
    cap_rate_pct: 6.5,
    cap_rate_direction: "falling",
    vacancy_rate_pct: 7.5,
    vacancy_rate_direction: "falling",
    _vote: "bullish",
  },
  "US-41 Bonita Springs": {
    cap_rate_pct: 6.5,
    cap_rate_direction: "stable",
    vacancy_rate_pct: 8.0,
    vacancy_rate_direction: "falling",
    _vote: "bullish",
  },
  "US-41 Tamiami Trail Naples": {
    cap_rate_pct: 5.5,
    cap_rate_direction: "falling",
    vacancy_rate_pct: 2.5,
    vacancy_rate_direction: "falling",
    _vote: "bullish",
  },
  "Vanderbilt Beach Rd / Mercato": {
    cap_rate_pct: 5.75,
    cap_rate_direction: "falling",
    vacancy_rate_pct: 4.5,
    vacancy_rate_direction: "falling",
    _vote: "bullish",
  },

  // ----- bearish (3) — at least one rising, no falling ----------------------
  "Estero Blvd Fort Myers Beach": {
    cap_rate_pct: 7.25,
    cap_rate_direction: "rising",
    vacancy_rate_pct: 8.5,
    vacancy_rate_direction: "stable",
    _vote: "bearish",
  },
  "US-41 / Cleveland Ave Fort Myers": {
    cap_rate_pct: 7.5,
    cap_rate_direction: "rising",
    vacancy_rate_pct: 12.0,
    vacancy_rate_direction: "rising",
    _vote: "bearish",
  },
  "Veterans Pkwy / Colonial Blvd (Midpoint Bridge Corridor)": {
    cap_rate_pct: 6.75,
    cap_rate_direction: "stable",
    vacancy_rate_pct: 7.0,
    vacancy_rate_direction: "rising",
    _vote: "bearish",
  },

  // ----- neutral (1) — stable + stable --------------------------------------
  "Pine Ridge Rd Naples": {
    cap_rate_pct: 6.25,
    cap_rate_direction: "stable",
    vacancy_rate_pct: 5.5,
    vacancy_rate_direction: "stable",
    _vote: "neutral",
  },

  // ----- no-data (4) — thin-data placeholder corridors, leave NULL ----------
  "Coconut Point Mall": {
    cap_rate_pct: null,
    cap_rate_direction: null,
    vacancy_rate_pct: null,
    vacancy_rate_direction: null,
    _vote: "no-data",
  },
  "Gulf Coast Town Center": {
    cap_rate_pct: null,
    cap_rate_direction: null,
    vacancy_rate_pct: null,
    vacancy_rate_direction: null,
    _vote: "no-data",
  },
  "Naples Airport-Pulling": {
    cap_rate_pct: null,
    cap_rate_direction: null,
    vacancy_rate_pct: null,
    vacancy_rate_direction: null,
    _vote: "no-data",
  },
  "Waterside Shops": {
    cap_rate_pct: null,
    cap_rate_direction: null,
    vacancy_rate_pct: null,
    vacancy_rate_direction: null,
    _vote: "no-data",
  },
};

function summary(): void {
  const tally: Record<string, number> = {};
  for (const v of Object.values(PLAN)) {
    tally[v._vote] = (tally[v._vote] ?? 0) + 1;
  }
  console.log("Plan tally:", JSON.stringify(tally));
  const total = Object.keys(PLAN).length;
  const withData = total - (tally["no-data"] ?? 0);
  const bullish = tally["bullish"] ?? 0;
  console.log(
    `Coverage: ${withData} of ${total} corridors have metrics. Bullish ratio: ${(
      bullish / withData
    ).toFixed(2)} (must be >= 0.60 to vote bullish).`,
  );
}

const dryRun = process.argv.includes("--dry-run");

summary();
if (dryRun) {
  console.log("\n--dry-run: no DB writes performed.");
  process.exit(0);
}

const sb = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_READONLY_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

// One UPDATE per corridor — PostgREST doesn't expose bulk-by-name UPDATEs.
let ok = 0;
let fail = 0;
for (const [name, row] of Object.entries(PLAN)) {
  const { _vote, ...metrics } = row;
  const payload =
    metrics.cap_rate_pct == null
      ? {
          cap_rate_pct: null,
          cap_rate_direction: null,
          vacancy_rate_pct: null,
          vacancy_rate_direction: null,
          metrics_period: null,
          metrics_verified_date: null,
        }
      : {
          ...metrics,
          metrics_period: PERIOD,
          metrics_verified_date: VERIFIED_DATE,
        };
  const { error, count } = await sb
    .from("corridor_profiles")
    .update(payload, { count: "exact" })
    .eq("corridor_name", name)
    .is("deleted_at", null)
    .eq("verification_status", "verified");
  if (error) {
    console.log(`FAIL  ${name} — ${error.message}`);
    fail += 1;
  } else {
    console.log(`OK    ${name}  (${_vote}, rows=${count ?? "?"})`);
    ok += 1;
  }
}
console.log(`\nDone: ${ok} ok, ${fail} failed.`);
process.exit(fail > 0 ? 1 : 0);
