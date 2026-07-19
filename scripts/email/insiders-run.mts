// scripts/email/insiders-run.mts
//
// Insiders Edition issue runner — the safety ladder, cloned from
// weekly-read-run.mts (Lane D):
//   1. DRY_RUN default true (opt OUT with DRY_RUN=false) — gates SENDING only.
//   2. Preview + run-report (with the full spend ledger) written unconditionally
//      BEFORE any live branch: no preview, no send.
//   3. Lint failures abort loudly (reported, never auto-fixed).
//   4. Live send additionally requires INSIDERS_APPROVED=1 + a postal address +
//      a verified From + an explicit INSIDERS_TEST_RECIPIENTS list (Phase B: the
//      subscriber fan-out is Phase C). The agent never sends; live runs are
//      operator commands.
//
// PAID AUTHORING is separately belted: it happens ONLY when INSIDERS_LIVE_AUTHOR=1
// AND a real ANTHROPIC_API_KEY is present (lib/email/insiders/author.ts). Without
// both, the run uses the deterministic mock — full pipeline, $0. Spend rides the
// metered client (call type insiders_author) under the per-issue IssueBudget cap
// (INSIDERS_MAX_SPEND_USD, default $20 — operator ruling 07/10/2026).
//
// Usage:
//   bun scripts/email/insiders-run.mts [--month YYYY-MM] [--mini <headline substring>]
//   env: DRY_RUN (default true), INSIDERS_LIVE_AUTHOR, INSIDERS_MAX_SPEND_USD,
//        INSIDERS_EFFORT (default xhigh), INSIDERS_SINGLE_PASS, INSIDERS_APPROVED,
//        INSIDERS_TEST_RECIPIENTS (comma list), INSIDERS_POSTAL_ADDRESS (fallback
//        OUTREACH_POSTAL_ADDRESS), INSIDERS_FROM_NAME/INSIDERS_FROM_EMAIL (fallback
//        DIGEST_SENDER_*), SITE_ORIGIN, INSIDERS_MINIS (minis land in Phase D)

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { authorIssue, liveAuthoringEnabled } from "@/lib/email/insiders/author";
import type { LedgerEntry } from "@/lib/email/insiders/budget";
import { assembleIssueDossier, supabaseNewsFetcher } from "@/lib/email/insiders/dossier";
import { materializeIssue } from "@/lib/email/insiders/materialize";
import { UNSUBSCRIBE_TOKEN } from "@/lib/email/scheduler";
import { getMarketingResend } from "@/lib/email/marketing-client";
import { PER_PACK_REGISTRY } from "@/refinery/packs/index.mts";
import { fetchSpendWindow, spendCaps } from "@/refinery/agents/anthropic.mts";
import { createServiceRoleClient } from "@/utils/supabase/service-role";

const DRY_RUN = process.env.DRY_RUN !== "false"; // default true — must opt OUT to send
const APPROVED = process.env.INSIDERS_APPROVED === "1";
const SITE_ORIGIN = (process.env.SITE_ORIGIN ?? "https://www.swfldatagulf.com").replace(/\/$/, "");
const POSTAL_ADDRESS = process.env.INSIDERS_POSTAL_ADDRESS ?? process.env.OUTREACH_POSTAL_ADDRESS;

function insidersFrom(): string {
  const name = process.env.INSIDERS_FROM_NAME ?? process.env.DIGEST_SENDER_NAME ?? "SWFL Data Gulf";
  const email = process.env.INSIDERS_FROM_EMAIL ?? process.env.DIGEST_SENDER_ADDRESS;
  if (!email) {
    throw new Error("INSIDERS_FROM_EMAIL (or DIGEST_SENDER_ADDRESS) required for a live send.");
  }
  return `${name} <${email}>`;
}

/** Mechanical pre-send gates. Failures refuse the send, never auto-fix. */
export function preSendGates(html: string, subject: string): string[] {
  const failures: string[] = [];
  if (!html.includes(UNSUBSCRIBE_TOKEN)) failures.push("unsubscribe token missing");
  if (!subject.trim()) failures.push("empty subject");
  return failures;
}

/** Human-readable spend ledger for the run report + console. */
export function ledgerReport(
  entries: LedgerEntry[],
  capUsd: number,
): { totalUsd: number; lines: string[] } {
  const lines = entries.map((e) => {
    const inTok = e.usage.input_tokens.toLocaleString("en-US");
    const outTok = e.usage.output_tokens.toLocaleString("en-US");
    const cacheRead = e.usage.cache_read_input_tokens ?? 0;
    const cache = cacheRead > 0 ? ` (+${cacheRead.toLocaleString("en-US")} cache-read)` : "";
    return `${e.pass.padEnd(7)} ${e.model}  ${inTok}in/${outTok}out${cache}  $${e.costUsd.toFixed(2)}`;
  });
  const totalUsd = entries.reduce((s, e) => s + e.costUsd, 0);
  lines.push(`TOTAL $${totalUsd.toFixed(2)} of $${capUsd.toFixed(2)} cap`);
  return { totalUsd, lines };
}

function parseArgs(argv: string[]): { month: string; mini: string | null } {
  let month = new Date().toISOString().slice(0, 7);
  let mini: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--month" && argv[i + 1]) month = argv[++i];
    else if (argv[i] === "--mini" && argv[i + 1]) mini = argv[++i];
  }
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error(`--month must be YYYY-MM, got "${month}"`);
  return { month, mini };
}

async function readOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const { month, mini } = parseArgs(process.argv.slice(2));
  if (mini && process.env.INSIDERS_MINIS !== "1") {
    console.error("[insiders] --mini lands in Phase D (set INSIDERS_MINIS=1 to develop it).");
    process.exit(1);
  }

  const live = liveAuthoringEnabled();
  const capUsd = Number(process.env.INSIDERS_MAX_SPEND_USD ?? 20);
  console.log(
    `[insiders] ${DRY_RUN ? "DRY_RUN " : ""}month=${month} authoring=${live ? `LIVE (cap $${capUsd})` : "mock ($0)"}`,
  );

  // ── Spend-headroom hint (the metered client enforces; this just warns) ─────
  if (live) {
    const [window, caps] = [await fetchSpendWindow(), spendCaps()];
    if (window && window.dayUsd + capUsd >= caps.dailyUsd) {
      console.log(
        `[insiders] HINT: today's logged spend $${window.dayUsd.toFixed(2)} + issue cap $${capUsd} >= daily cap $${caps.dailyUsd} — ` +
          `run with ANTHROPIC_DAILY_SPEND_CAP_USD=${Math.ceil(caps.dailyUsd + capUsd)} if this is issue day.`,
      );
    }
  }

  // ── Stage 2a: dossier (deterministic) ──────────────────────────────────────
  const db = createServiceRoleClient();
  const deskMd = await readOptional(join("_FABLE5", "desk", `${month}.md`));
  const playbookMd = (await readOptional(join("_FABLE5", "playbook.md"))) ?? "";
  const dossier = await assembleIssueDossier({
    month,
    deskMd,
    playbookMd,
    fetchNews: supabaseNewsFetcher(db),
    brainSlugs: [...Object.keys(PER_PACK_REGISTRY), "master"],
  });
  if (!dossier.deskOk)
    console.warn(
      `[insiders] desk file missing/malformed for ${month} — raw scored news backstop in use; repair _FABLE5/desk/${month}.md`,
    );
  console.log(
    `[insiders] dossier: ${dossier.brainOutputs.length} outputs · ${dossier.news.length} news (${dossier.news.filter((n) => n.deskWeight).length} desk picks) · ${dossier.anchors.length} anchors`,
  );

  // ── Stage 2b: authoring (the ONLY model stage) ─────────────────────────────
  const authored = await authorIssue(dossier);
  console.log(
    `[insiders] authored: passes=${authored.passes.join("+")} served-by=${authored.servedBy.join(",")}`,
  );

  // ── Stage 2c: materialize (charts + lint gate + render) ───────────────────
  const result = await materializeIssue(authored.doc, dossier, {
    origin: SITE_ORIGIN,
    slug: authored.doc.issue_slug,
  });

  // ── Preview + report FIRST — unconditionally, before any live branch ──────
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = join("runs", "insiders-runs", stamp);
  await mkdir(outDir, { recursive: true });
  const ledger = ledgerReport(authored.ledger, capUsd);
  const report = {
    generated_at: new Date().toISOString(),
    dry_run: DRY_RUN,
    mode: live ? "live-author" : "mock",
    month,
    issue_slug: authored.doc.issue_slug,
    subject: authored.doc.subject,
    passes: authored.passes,
    served_by: authored.servedBy,
    ledger: authored.ledger,
    ledger_lines: ledger.lines,
    total_usd: ledger.totalUsd,
    cap_usd: capUsd,
    warnings: result.warnings,
    ...(result.ok
      ? { charts: result.charts, preview: `issue-${authored.doc.issue_slug}.html` }
      : { blocked: result.blocked }),
  };
  await writeFile(join(outDir, "run-report.json"), JSON.stringify(report, null, 2));
  if (result.ok)
    await writeFile(join(outDir, `issue-${authored.doc.issue_slug}.html`), result.html);

  console.log("\n========================================================================");
  console.log(`RUN REPORT: ${join(outDir, "run-report.json")}`);
  for (const line of ledger.lines) console.log(`  ${line}`);
  for (const w of result.warnings) console.log(`  WARN: ${w}`);
  if (!result.ok) {
    console.error(
      `  BLOCKED (${result.blocked.length} violation(s)) — nothing renders, nothing sends:`,
    );
    for (const b of result.blocked) console.error(`    ✗ ${b}`);
    console.log("========================================================================\n");
    process.exit(1);
  }
  console.log(
    `  PREVIEW: ${join(outDir, `issue-${authored.doc.issue_slug}.html`)} (${result.charts} chart(s))`,
  );
  console.log("========================================================================\n");

  if (DRY_RUN) {
    console.log("[insiders] DRY_RUN — preview written, nothing sent, nothing mutated.");
    return;
  }

  // ── Live send: the operator's approval ladder, refused loudly ─────────────
  if (!APPROVED) {
    console.error(
      "[insiders] LIVE SEND REFUSED — operator approval required: review the preview, then set INSIDERS_APPROVED=1.",
    );
    process.exit(1);
  }
  if (!POSTAL_ADDRESS) {
    console.error("[insiders] LIVE SEND REFUSED — set INSIDERS_POSTAL_ADDRESS (CAN-SPAM).");
    process.exit(1);
  }
  const recipients = (process.env.INSIDERS_TEST_RECIPIENTS ?? "")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);
  if (recipients.length === 0) {
    console.error(
      "[insiders] LIVE SEND REFUSED — Phase B sends only to INSIDERS_TEST_RECIPIENTS (subscriber fan-out is Phase C).",
    );
    process.exit(1);
  }
  const gateFailures = preSendGates(result.html, authored.doc.subject);
  if (gateFailures.length > 0) {
    console.error(`[insiders] LIVE SEND REFUSED — gates: ${gateFailures.join(" | ")}`);
    process.exit(1);
  }

  const from = insidersFrom();
  const html = result.html.replace(
    UNSUBSCRIBE_TOKEN,
    `${POSTAL_ADDRESS} · Reply "unsubscribe" to opt out`,
  );
  const resend = getMarketingResend();
  let sent = 0;
  let failed = 0;
  for (const to of recipients) {
    const { error } = await resend.emails.send({
      from,
      to,
      subject: authored.doc.subject,
      html,
    });
    if (error) {
      failed++;
      console.error(`  send error (${to}): ${error.message ?? error}`);
    } else {
      sent++;
    }
  }
  console.log(`[insiders] sent=${sent} failed=${failed} (seed list of ${recipients.length})`);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(`[insiders] FATAL: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
