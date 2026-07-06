// scripts/project-feed/lifecycle-nudges.mts
//
// Daily cron adapter for PLATFORM_ARC auto-advance nudges (spec
// 2026-07-06-platform-arc-auto-advance-nudges-design.md). NOT a Next route — a standalone Bun
// process the GHA cron invokes after listing-lifecycle-daily has committed the day's transitions.
//
// Reads every ARMED email_sequences row with a resolved address_key, joins the matching
// data_lake.listing_state/listing_transitions rows, runs the pure decision core
// (lib/project/lifecycle-nudge.ts), and inserts new lifecycle_nudges rows
// (ON CONFLICT (dedup_key) DO NOTHING — idempotent across daily reruns).
//
// NUDGE-ONLY: this script NEVER writes to email_sequences.steps and NEVER calls any send path.
//
// Run: bun scripts/project-feed/lifecycle-nudges.mts [--dry-run]

// KNOWN-DEBT(data_lake: listing_state/listing_transitions live in the data_lake schema (typed public only))
import {
  createServiceRoleClient,
  createServiceRoleClientUntyped,
} from "@/utils/supabase/service-role";
import { SequenceStepsSchema } from "@/lib/email/sequence/types";
import {
  decideLifecycleNudges,
  type LifecycleTransition,
  type SequenceForNudge,
} from "@/lib/project/lifecycle-nudge";

const DRY_RUN = process.argv.includes("--dry-run");

interface ArmedSequenceRow {
  id: string;
  user_id: string;
  project_id: string;
  address_key: string | null;
  steps: unknown;
}

async function main(): Promise<number> {
  console.log(`[lifecycle-nudges] start · DRY_RUN=${DRY_RUN}`);
  const db = createServiceRoleClient();
  const lake = createServiceRoleClientUntyped();

  const { data: sequences, error } = await db
    .from("email_sequences")
    .select("id, user_id, project_id, address_key, steps")
    .eq("status", "armed")
    .not("address_key", "is", null);
  if (error) {
    console.error(`FATAL: email_sequences query failed — ${error.message}`);
    return 1;
  }
  const rows = (sequences ?? []) as ArmedSequenceRow[];
  if (rows.length === 0) {
    console.log("  no armed sequences with a resolved address_key — nothing to do.");
    return 0;
  }

  const today = new Date();
  const toInsert: Record<string, unknown>[] = [];
  let skipped = 0;

  for (const row of rows) {
    const parsedSteps = SequenceStepsSchema.safeParse(row.steps);
    if (!parsedSteps.success) {
      console.warn(`  skip sequence ${row.id}: steps failed to parse`);
      skipped++;
      continue;
    }
    const seq: SequenceForNudge = {
      id: row.id,
      project_id: row.project_id,
      user_id: row.user_id,
      address_key: row.address_key as string,
      steps: parsedSteps.data.map((s) => ({
        key: s.key,
        state: s.state,
        sent_at: s.sent_at ?? null,
      })),
    };

    const { data: transRows, error: transErr } = await lake
      .schema("data_lake")
      .from("listing_transitions")
      .select("from_state, to_state, at, price, price_delta")
      .eq("address_key", seq.address_key)
      .eq("sale_or_rent", "sale")
      .eq("source_name", "api_feed");
    if (transErr) {
      console.warn(
        `  skip sequence ${row.id}: listing_transitions query failed — ${transErr.message}`,
      );
      skipped++;
      continue;
    }
    const transitions = (transRows ?? []) as LifecycleTransition[];

    const { data: stateRow } = await lake
      .schema("data_lake")
      .from("listing_state")
      .select("state")
      .eq("address_key", seq.address_key)
      .eq("sale_or_rent", "sale")
      .eq("source_name", "api_feed")
      .maybeSingle();
    const currentState = (stateRow as { state: string } | null)?.state ?? null;

    const nudges = decideLifecycleNudges(seq, transitions, currentState, today);
    for (const n of nudges) toInsert.push(n);
  }

  console.log(
    `  ${rows.length} armed sequence(s) checked (${skipped} skipped) · ${toInsert.length} candidate nudge(s)`,
  );

  if (DRY_RUN) {
    for (const n of toInsert) console.log("  [dry-run] would insert", n);
    return 0;
  }
  if (toInsert.length === 0) return 0;

  const { data: inserted, error: insErr } = await db
    .from("lifecycle_nudges")
    .upsert(toInsert as never[], { onConflict: "dedup_key", ignoreDuplicates: true })
    .select("id");
  if (insErr) {
    console.error(`FATAL: lifecycle_nudges insert failed — ${insErr.message}`);
    return 1;
  }
  const newCount = inserted?.length ?? 0;
  console.log(
    `  inserted ${newCount} new row(s) (${toInsert.length - newCount} already existed — idempotent)`,
  );
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error("FATAL:", e);
    process.exit(1);
  });
