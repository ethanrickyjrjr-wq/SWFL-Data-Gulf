// scripts/email/run-activation.mts
//
// Phase C runner for the "It's Alive" activation-delta sequence (the runner half;
// all decision logic lives in the unit-tested `lib/email/activation/*` core).
//
// SAFE BY DEFAULT — DRY_RUN unless DRY_RUN=false is explicitly set. In DRY_RUN it
// does a READ-ONLY select of due step-2 rows, re-assembles each report, computes the
// honest delta against the FROZEN v1 snapshot, renders email #2, and LOGS the
// would-send — it never sends and never mutates a row.
//
// LIVE SEND IS PHASE D, NOT WIRED HERE. The 1:1 send mechanism (broadcast-to-
// segment-of-one so the {{{RESEND_UNSUBSCRIBE_URL}}} merge tag resolves, OR a
// transactional emails.send with a real List-Unsubscribe header) must be chosen +
// verified against Resend, AND the CAN-SPAM address swapped + secrets set, before a
// real run. Until then a DRY_RUN=false invocation exits 1 with that instruction.
//
// Invoked manually via the activation-sequence GHA workflow (workflow_dispatch only
// — there is deliberately NO schedule cron here; flipping that is Phase D).

import { createServiceRoleClient } from "@/utils/supabase/service-role";
import {
  processActivationStep,
  type ActivationRow,
  type ActivationDeps,
  type SendResult,
} from "@/lib/email/activation/sequence";

const DRY_RUN = process.env.DRY_RUN !== "false"; // default true — must opt OUT to send
const CLAIM_LIMIT = 50;
const CTA_URL = process.env.ACTIVATION_CTA_URL ?? "https://www.swfldatagulf.com/pricing";

function liveSendNotWired(): Promise<SendResult> {
  throw new Error(
    "Live activation send is not wired (Phase D). Choose + verify the 1:1 send mechanism " +
      "(broadcast segment-of-one for the unsubscribe merge tag, or transactional + List-Unsubscribe), " +
      "swap the CAN-SPAM address, and set the secrets first. Re-run with DRY_RUN unset for now.",
  );
}

async function main(): Promise<void> {
  if (!DRY_RUN) {
    console.error("[activation] live send refused — see run-activation.mts header (Phase D).");
    process.exit(1);
  }

  const supabase = createServiceRoleClient();
  const nowIso = new Date().toISOString();

  // DRY_RUN: plain read-only select of due step-2 rows (no claim, no mutation).
  const { data, error } = await supabase
    .from("prospect_activation")
    .select("id, email, scope, brand, step, snapshot, next_send_at, status")
    .eq("status", "active")
    .eq("step", 1)
    .lte("next_send_at", nowIso)
    .limit(CLAIM_LIMIT);

  if (error) {
    console.error(`[activation] due-row query failed: ${error.message}`);
    process.exit(1);
  }

  const rows = (data ?? []) as ActivationRow[];
  console.log(`[activation] DRY_RUN — ${rows.length} due step-2 row(s) at ${nowIso}.`);

  const deps: ActivationDeps = {
    dryRun: true,
    send: liveSendNotWired,
    insertEnrollment: async () => {
      throw new Error("insertEnrollment must not be called in DRY_RUN");
    },
    completeStep: async () => {
      throw new Error("completeStep must not be called in DRY_RUN");
    },
    ctaUrl: CTA_URL,
    now: new Date(),
    log: (line) => console.log(line),
  };

  let withChange = 0;
  for (const row of rows) {
    const outcome = await processActivationStep(row, deps);
    if ((outcome.kind === "dry-run" || outcome.kind === "sent") && outcome.hadChange) withChange++;
  }
  console.log(`[activation] DRY_RUN complete — ${withChange}/${rows.length} would surface a real change.`);
}

main().catch((err) => {
  console.error(`[activation] FATAL: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
