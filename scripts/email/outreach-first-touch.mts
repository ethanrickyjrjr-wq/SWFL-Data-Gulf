// scripts/email/outreach-first-touch.mts
//
// Send the PLAIN first-touch cold email (lib/email/outreach/first-touch.ts) to a list of
// drafted recipients. The drafts come from the GTM scout → refute → pull → draft →
// compliance roster (09/02/2026); this script is the send floor beneath it — every draft
// passes validateFirstTouchDraft IN CODE before anything renders, so a reviewer's miss
// cannot reach Resend.
//
// SAFE BY DEFAULT — DRY_RUN unless DRY_RUN=false. In DRY_RUN it validates, renders every
// email, writes a run-report + per-recipient HTML previews under runs/outreach-runs/, and
// prints a summary. It NEVER sends and NEVER mutates.
//
// LIVE SEND (DRY_RUN=false), for each valid draft:
//   1. Upserts the outreach_recipients row (unsubscribe id; rides the email as `rid`).
//      step is set to OUTREACH_MAX_STEPS (default 4) so the SCHEDULED legacy drip
//      (outreach-drip-run.mts, GHA) never follows a first touch with the branded drip —
//      a first touch is one email, Ricky answers the replies himself.
//   2. Sends via Resend batch (chunks of 100, CAN-SPAM List-Unsubscribe headers).
//   3. Records a `sent` event.
// Refuses to run live without OUTREACH_POSTAL_ADDRESS and OUTREACH_FROM_EMAIL.
//
// Usage:
//   bun scripts/email/outreach-first-touch.mts --drafts <drafts.json> [--campaign first-touch-001]
//   drafts.json: an array of FirstTouchDraft, or { drafts: [...] }.
//   env: DRY_RUN (default true), SITE_ORIGIN, OUTREACH_POSTAL_ADDRESS, OUTREACH_FROM_NAME,
//        OUTREACH_FROM_EMAIL, RESEND_AUDIENCES_KEY, SUPABASE_URL + SUPABASE_SERVICE_KEY.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ComposedMessage } from "@/lib/email/outreach/campaign";
import {
  toComposedMessage,
  validateFirstTouchDraft,
  type FirstTouchDraft,
} from "@/lib/email/outreach/first-touch";
import { buildBatchMessages, sendBatches, type BatchSender } from "@/lib/email/outreach/send";
import { upsertRecipient } from "@/lib/email/outreach/recipient-upsert";
import { getMarketingResend } from "@/lib/email/marketing-client";
import { createServiceRoleClient } from "@/utils/supabase/service-role";

const DRY_RUN = process.env.DRY_RUN !== "false"; // default true — must opt OUT to send
const SITE_ORIGIN = process.env.SITE_ORIGIN ?? "https://www.swfldatagulf.com";
const POSTAL_ADDRESS = process.env.OUTREACH_POSTAL_ADDRESS;
const MAX_STEPS = Number(process.env.OUTREACH_MAX_STEPS ?? "4"); // mirrors outreach-drip-run.mts

function arg(name: string): string | undefined {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === `--${name}`) return argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : "";
    if (a.startsWith(`--${name}=`)) return a.slice(name.length + 3);
  }
  return undefined;
}

function outreachFrom(): string {
  const name = process.env.OUTREACH_FROM_NAME ?? "SWFL Data Gulf";
  const email = process.env.OUTREACH_FROM_EMAIL;
  if (!email)
    throw new Error("OUTREACH_FROM_EMAIL is required for a live send (a verified sender).");
  return `${name} <${email}>`;
}

async function liveSend(messages: ComposedMessage[], campaignId: string): Promise<void> {
  const from = outreachFrom();
  const db = createServiceRoleClient();
  const resend = getMarketingResend();
  const now = new Date().toISOString();

  const idByEmail = new Map<string, string>();
  for (const m of messages) idByEmail.set(m.email, await upsertRecipient(db, campaignId, m));

  const batches = buildBatchMessages({
    messages,
    from,
    replyTo: process.env.OUTREACH_FROM_EMAIL,
    unsubBase: SITE_ORIGIN,
    recipientId: (m) => idByEmail.get(m.email) ?? "",
  });
  const result = await sendBatches(resend as unknown as BatchSender, batches);
  console.log(`[first-touch] live send: sent=${result.sent} failed=${result.failed}`);
  for (const e of result.errors) console.error(`  send error: ${e}`);

  for (const m of messages) {
    const rid = idByEmail.get(m.email);
    if (!rid) continue;
    await db
      .from("outreach_events")
      .insert({ recipient_id: rid, campaign_id: campaignId, event: "sent" });
    await db
      .from("outreach_recipients")
      .update({ step: MAX_STEPS, next_send_at: null, updated_at: now })
      .eq("id", rid);
  }
  console.log(
    `[first-touch] recorded ${messages.length} sent event(s); drip cursor parked at step ${MAX_STEPS}.`,
  );
}

async function main(): Promise<void> {
  const draftsPath = arg("drafts");
  if (!draftsPath) {
    console.error("usage: --drafts <path-to-drafts.json> [--campaign <label>]");
    process.exit(1);
  }
  const campaignId = arg("campaign") || "first-touch-001";

  if (!DRY_RUN && !POSTAL_ADDRESS) {
    console.error(
      "[first-touch] LIVE SEND REFUSED — set OUTREACH_POSTAL_ADDRESS (a physical mailing address; CAN-SPAM requires it in every commercial email).",
    );
    process.exit(1);
  }
  // Dry runs render with a visible placeholder so the preview shows WHERE the address lands.
  const postal = POSTAL_ADDRESS ?? "[postal address — set OUTREACH_POSTAL_ADDRESS]";

  const raw = JSON.parse(await readFile(draftsPath, "utf8")) as
    FirstTouchDraft[] | { drafts: FirstTouchDraft[] };
  const drafts: FirstTouchDraft[] = Array.isArray(raw) ? raw : (raw.drafts ?? []);
  if (drafts.length === 0) {
    console.error("[first-touch] no drafts — nothing to do.");
    process.exit(1);
  }

  // The compliance floor, in code. Any failure and NOTHING sends (fail closed).
  const problems = drafts
    .map((d) => ({ email: d.email, errs: validateFirstTouchDraft(d) }))
    .filter((p) => p.errs.length);
  for (const p of problems) console.error(`  INVALID ${p.email}: ${p.errs.join("; ")}`);

  const seen = new Set<string>();
  const messages: ComposedMessage[] = [];
  for (const d of drafts) {
    if (validateFirstTouchDraft(d).length) continue;
    const key = d.email.trim().toLowerCase();
    if (seen.has(key)) {
      console.error(`  DUPLICATE ${d.email} — skipped`);
      continue;
    }
    seen.add(key);
    messages.push(toComposedMessage(d, postal));
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = join("runs", "outreach-runs", `${stamp}-first-touch`);
  await mkdir(outDir, { recursive: true });
  for (const m of messages) {
    await writeFile(
      join(outDir, `${m.email.replace(/[^a-z0-9]/gi, "_")}.html`),
      m.html ?? "",
      "utf8",
    );
  }
  await writeFile(
    join(outDir, "run-report.json"),
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        campaign: campaignId,
        dry_run: DRY_RUN,
        total: drafts.length,
        valid: messages.length,
        invalid: problems,
        recipients: messages.map((m) => ({
          email: m.email,
          name: m.name,
          zip: m.zip,
          subject: m.subject,
        })),
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(
    `[first-touch] ${drafts.length} draft(s): ${messages.length} valid, ${problems.length} invalid · campaign=${campaignId} · DRY_RUN=${DRY_RUN} · previews → ${outDir}`,
  );

  if (problems.length) {
    console.error(
      "[first-touch] REFUSED — fix or drop the invalid drafts; a run sends all-or-nothing.",
    );
    process.exit(2);
  }
  if (DRY_RUN) {
    console.log(
      "[first-touch] dry run complete — nothing sent. Re-run with DRY_RUN=false to send.",
    );
    return;
  }
  await liveSend(messages, campaignId);
}

main().catch((err) => {
  console.error("[first-touch] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
