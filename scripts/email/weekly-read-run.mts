// scripts/email/weekly-read-run.mts
//
// Weekly-read send runner (Lane D). A standalone Bun process modeled on
// outreach-demo-run.mts's safety ladder:
//   1. DRY_RUN default true (opt OUT with DRY_RUN=false).
//   2. Previews written unconditionally BEFORE any live block: no preview, no send.
//   3. Gate failures SKIP the subscriber (reported, never auto-fixed).
//   4. Live additionally requires WEEKLY_READ_APPROVED=1 + a postal address + a
//      verified From. The agent never sends; live runs are operator commands.
//
// CONTENT (operator ruling 07/03/2026): routed through the FULL deliverable engine.
// Due subscribers are grouped by ZIP; each distinct ZIP gets ONE real engine build —
// buildContentDoc (the ONE Email Lab build root, mode:"quality" = Sonnet, the tier
// the scheduled lane runs) + renderEmailDocHtml (the ONE render root) — then the
// issue fans out to that ZIP's subscribers with per-subscriber unsubscribe links.
// Cost scales with distinct ZIPs (≤57 SWFL), never subscriber count. A ZIP whose AI
// fill doesn't apply is SKIPPED (reported), never sent as a bare skeleton. Without
// ANTHROPIC_API_KEY the engine runs deterministically mocked (free DRY previews).
// At >25 distinct due ZIPs per window, the parked batch-authoring spec's volume
// trigger fires — flip the transport per that spec, don't grow this file.
//
// Usage:
//   bun scripts/email/weekly-read-run.mts
//   env: DRY_RUN (default true), WEEKLY_READ_APPROVED (must be "1" for live),
//        WEEKLY_READ_POSTAL_ADDRESS (fallback OUTREACH_POSTAL_ADDRESS),
//        WEEKLY_READ_FROM_NAME/WEEKLY_READ_FROM_EMAIL (fallback DIGEST_SENDER_*),
//        WEEKLY_READ_BATCH_LIMIT (default 200), SITE_ORIGIN

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterSend, shouldSend } from "@/lib/email/weekly-read/cadence";
import { buildWeeklyIssue, type WeeklyIssue } from "@/lib/email/weekly-read/issue";
import {
  buildWeeklyReadBatches,
  sendWeeklyReadBatches,
  type BatchSender,
  type WeeklyReadOutgoing,
} from "@/lib/email/weekly-read/send";
import { UNSUBSCRIBE_TOKEN } from "@/lib/email/scheduler";
import { buildContentDoc } from "@/lib/email/build-doc";
import { renderEmailDocHtml } from "@/lib/email/render-email-doc";
import type { EmailDoc } from "@/lib/email/doc/types";
import { resolveZip } from "@/refinery/lib/zip-resolver.mts";
import { getMarketingResend } from "@/lib/email/marketing-client";
import { createServiceRoleClient } from "@/utils/supabase/service-role";

const DRY_RUN = process.env.DRY_RUN !== "false"; // default true — must opt OUT to send
const APPROVED = process.env.WEEKLY_READ_APPROVED === "1";
const SITE_ORIGIN = (process.env.SITE_ORIGIN ?? "https://www.swfldatagulf.com").replace(/\/$/, "");
const BATCH_LIMIT = Number(process.env.WEEKLY_READ_BATCH_LIMIT ?? "200");
const POSTAL_ADDRESS =
  process.env.WEEKLY_READ_POSTAL_ADDRESS ?? process.env.OUTREACH_POSTAL_ADDRESS;

// The tier the scheduled EmailDoc lane runs (run-schedules.mts SCHEDULE_BUILD_MODE):
// a recurring customer-facing email warrants the better content fill.
const BUILD_MODE = "quality";

interface DueRow {
  id: string;
  email: string;
  zip: string;
  status: string;
  next_send_at: string | null;
  issues_sent: number;
}

interface RunRow {
  email: string;
  zip: string;
  outcome: "would_send" | "sent" | "skipped";
  reason?: string;
  subject?: string;
  preview?: string;
}

function weeklyReadFrom(): string {
  const name =
    process.env.WEEKLY_READ_FROM_NAME ?? process.env.DIGEST_SENDER_NAME ?? "SWFL Data Gulf";
  const email = process.env.WEEKLY_READ_FROM_EMAIL ?? process.env.DIGEST_SENDER_ADDRESS;
  if (!email) {
    throw new Error("WEEKLY_READ_FROM_EMAIL (or DIGEST_SENDER_ADDRESS) required for a live send.");
  }
  return `${name} <${email}>`;
}

/** Mechanical pre-send gates. Failures skip, never auto-fix. */
function preSendGates(issue: WeeklyIssue): string[] {
  const failures: string[] = [];
  if (!issue.html.includes(UNSUBSCRIBE_TOKEN)) failures.push("unsubscribe token missing");
  if (!issue.subject.trim()) failures.push("empty subject");
  return failures;
}

async function main(): Promise<void> {
  const db = createServiceRoleClient();
  const now = new Date();

  const { data, error } = await db
    .from("weekly_read_subscribers")
    .select("id, email, zip, status, next_send_at, issues_sent")
    .eq("status", "active")
    .order("next_send_at", { ascending: true, nullsFirst: true })
    .limit(BATCH_LIMIT);
  if (error) throw new Error(`select due weekly-read subscribers: ${error.message}`);

  const due = ((data ?? []) as DueRow[]).filter((r) =>
    shouldSend({ status: "active", next_send_at: r.next_send_at }, now),
  );
  console.log(`[weekly-read] ${DRY_RUN ? "DRY_RUN " : ""}${due.length} due · limit=${BATCH_LIMIT}`);

  // ── ONE engine build per distinct due ZIP ─────────────────────────────────
  const zips = [...new Set(due.map((r) => r.zip))];
  if (zips.length > 25) {
    console.log(
      `[weekly-read] NOTE: ${zips.length} distinct ZIPs due — the parked batch-authoring ` +
        `spec's volume trigger (>25 builds/window) has fired; see ` +
        `docs/superpowers/specs/2026-07-02-batch-deliverable-authoring-design.md`,
    );
  }

  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const outDir = join("weekly-read-runs", stamp);
  await mkdir(outDir, { recursive: true });

  const issueByZip = new Map<string, WeeklyIssue | null>();
  for (const zip of zips) {
    const res = resolveZip(zip);
    if (!res.in_scope) {
      issueByZip.set(zip, null); // legacy/garbage row — skip, never build out-of-scope
      continue;
    }
    const place = (res.places.find((p) => p.match === "primary") ?? res.places[0])?.place ?? null;
    try {
      const issue = await buildWeeklyIssue(
        zip,
        place,
        {
          async buildDoc({ prompt, rawDoc, scope }) {
            const result = await buildContentDoc({ prompt, rawDoc, scope, mode: BUILD_MODE });
            const doc = result.payload?.doc as EmailDoc | undefined;
            // applied=false (or no doc back) → weekly-read SKIPS: an unfilled house
            // skeleton is not a market read (inverse of the scheduled lane's fallback).
            return { doc: doc ?? rawDoc, applied: Boolean(doc && result.payload?.applied) };
          },
          renderDoc: renderEmailDocHtml,
        },
        {
          ctaUrl: `${SITE_ORIGIN}/r/zip-report/${zip}`,
          ...(POSTAL_ADDRESS ? { postalAddress: POSTAL_ADDRESS } : {}),
        },
      );
      issueByZip.set(zip, issue);
      if (issue) {
        // Preview FIRST — unconditionally, one per ZIP. No preview, no send.
        await writeFile(join(outDir, `zip-${zip}.html`), issue.html);
      }
    } catch (err) {
      console.error(
        `[weekly-read] build failed for ${zip}: ${err instanceof Error ? err.message : String(err)}`,
      );
      issueByZip.set(zip, null); // one ZIP's build failure never sinks the run
    }
  }

  // ── Fan out per subscriber ────────────────────────────────────────────────
  const rows: RunRow[] = [];
  const sendable: Array<{ rec: DueRow; out: WeeklyReadOutgoing }> = [];
  for (const rec of due) {
    const issue = issueByZip.get(rec.zip) ?? null;
    if (!issue) {
      // Skipped, cursor NOT advanced — they're first in line next run.
      rows.push({ email: rec.email, zip: rec.zip, outcome: "skipped", reason: "no_issue_built" });
      continue;
    }
    const failures = preSendGates(issue);
    if (failures.length > 0) {
      rows.push({
        email: rec.email,
        zip: rec.zip,
        outcome: "skipped",
        reason: `gates: ${failures.join(" | ")}`,
        subject: issue.subject,
        preview: `zip-${rec.zip}.html`,
      });
      continue;
    }
    rows.push({
      email: rec.email,
      zip: rec.zip,
      outcome: DRY_RUN ? "would_send" : "sent",
      subject: issue.subject,
      preview: `zip-${rec.zip}.html`,
    });
    sendable.push({
      rec,
      out: { subscriberId: rec.id, email: rec.email, subject: issue.subject, html: issue.html },
    });
  }

  const summary = {
    due: due.length,
    distinct_zips: zips.length,
    issues_built: [...issueByZip.values()].filter(Boolean).length,
    sendable: sendable.length,
    skipped: rows.filter((r) => r.outcome === "skipped").length,
  };
  await writeFile(
    join(outDir, "run-report.json"),
    JSON.stringify({ generated_at: now.toISOString(), dry_run: DRY_RUN, summary, rows }, null, 2),
  );

  console.log("\n========================================================================");
  console.log(`RUN REPORT: ${join(outDir, "run-report.json")}`);
  console.log(`SUMMARY: ${JSON.stringify(summary)}`);
  for (const r of rows) {
    console.log(`  ${r.outcome.toUpperCase().padEnd(11)} ${r.zip} ${r.email}`);
    if (r.subject) console.log(`    subject: ${r.subject}`);
    if (r.reason) console.log(`    reason: ${r.reason}`);
  }
  console.log("========================================================================\n");

  if (DRY_RUN) {
    console.log("[weekly-read] DRY_RUN — previews written, nothing sent, nothing mutated.");
    return;
  }

  // ── live send: the operator's approval ladder, refused loudly when incomplete ──
  if (!APPROVED) {
    console.error(
      "[weekly-read] LIVE SEND REFUSED — operator approval required: review the previews, then set WEEKLY_READ_APPROVED=1.",
    );
    process.exit(1);
  }
  if (!POSTAL_ADDRESS) {
    console.error("[weekly-read] LIVE SEND REFUSED — set WEEKLY_READ_POSTAL_ADDRESS (CAN-SPAM).");
    process.exit(1);
  }
  const from = weeklyReadFrom();
  const resend = getMarketingResend();

  const batches = buildWeeklyReadBatches({
    messages: sendable.map((s) => s.out),
    from,
    unsubBase: SITE_ORIGIN,
  });
  const result = await sendWeeklyReadBatches(resend as unknown as BatchSender, batches);
  console.log(`[weekly-read] sent=${result.sent} failed=${result.failed}`);
  for (const e of result.errors) console.error(`  send error: ${e}`);

  // Advance each cursor: next issue 6–8 days out (jittered), issues_sent+1.
  for (const s of sendable) {
    const cursor = afterSend(s.rec.id, now);
    await db
      .from("weekly_read_subscribers")
      .update({
        next_send_at: cursor.next_send_at,
        issues_sent: s.rec.issues_sent + 1,
        updated_at: now.toISOString(),
      })
      .eq("id", s.rec.id);
  }
  console.log(`[weekly-read] advanced ${sendable.length} cadence cursor(s).`);
}

main().catch((err) => {
  console.error(`[weekly-read] FATAL: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
