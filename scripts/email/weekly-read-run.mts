// scripts/email/weekly-read-run.mts
//
// Market-area alerts runner (spec 2026-07-10-market-area-alerts-design.md —
// supersedes the 07/03 AI content path; subscriber/send plumbing unchanged).
// A standalone Bun process on outreach-demo-run.mts's safety ladder:
//   1. DRY_RUN default true (opt OUT with DRY_RUN=false).
//   2. Previews written unconditionally BEFORE any live block: no preview, no send.
//   3. Gate failures SKIP the subscriber (reported, never auto-fixed).
//   4. Live additionally requires WEEKLY_READ_APPROVED=1 + a postal address + a
//      verified From. The agent never sends; live runs are operator commands.
//
// CONTENT (operator ruling 07/10/2026): DETERMINISTIC — zero LLM calls. A daily
// pass assembles fresh per-ZIP snapshots for the 58-ZIP footprint, diffs them
// against market_event_snapshots, and classifies typed events. Each subscriber
// then gets AT MOST one email per run:
//   baseline (issues_sent=0, the welcome snapshot — 83.63% open-rate slot)
//   > alert  (an alert-class event fired in their market area today)
//   > weekly (cadence due + movement gate passes; flat week = reported skip).
// An alert send advances the cadence cursor, so it absorbs the next roundup
// (Zillow pattern). Snapshots advance ONLY after a confirmed live send; missing
// rows seed on live runs (or DRY with MARKET_ALERTS_SEED=1) — a seed emits no
// events, so nothing is ever swallowed. Cost scales with the 58-ZIP geography,
// never subscriber count.
//
// Usage:
//   bun scripts/email/weekly-read-run.mts
//   env: DRY_RUN (default true), WEEKLY_READ_APPROVED (must be "1" for live),
//        WEEKLY_READ_POSTAL_ADDRESS (fallback OUTREACH_POSTAL_ADDRESS),
//        WEEKLY_READ_FROM_NAME/WEEKLY_READ_FROM_EMAIL (fallback DIGEST_SENDER_*),
//        WEEKLY_READ_BATCH_LIMIT (default 200), SITE_ORIGIN,
//        MARKET_ALERTS_SEED=1 (DRY-mode opt-in: seed missing snapshot rows),
//        WEEKLY_READ_PREVIEW_ZIP (write sample baseline+weekly previews for a
//        ZIP even with zero subscribers — operator eyeball without a list)

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterSend, shouldSend } from "@/lib/email/weekly-read/cadence";
import {
  buildWeeklyReadBatches,
  sendWeeklyReadBatches,
  type BatchSender,
  type WeeklyReadOutgoing,
} from "@/lib/email/weekly-read/send";
import { finalizeIssueHtml } from "@/lib/email/weekly-read/issue";
import { UNSUBSCRIBE_TOKEN } from "@/lib/email/scheduler";
import { renderEmailDocHtml } from "@/lib/email/render-email-doc";
import type { EmailDoc } from "@/lib/email/doc/types";
import { resolveZip } from "@/refinery/lib/zip-resolver.mts";
import { getMarketingResend } from "@/lib/email/marketing-client";
import {
  createServiceRoleClient,
  createServiceRoleClientUntyped,
} from "@/utils/supabase/service-role";
import { areaForZip, loadMarketAreas, type MarketArea } from "@/lib/email/zip-events/market-areas";
import {
  detectLifecycleBurst,
  detectNearbyNews,
  detectRankFlip,
  detectThresholdCross,
  type AreaNewsItem,
} from "@/lib/email/zip-events/detect";
import {
  areaHeatInputs,
  detectHeatShift,
  rankAreaHeat,
  type AreaHeatRank,
} from "@/lib/email/zip-events/heat";
import { pickDailyAlert, selectWeeklyContent } from "@/lib/email/zip-events/gate";
import {
  baselineSubject,
  composeAlertDoc,
  composeBaselineDoc,
  composeWeeklyDoc,
  shouldIncludeInsider,
  subjectFor,
  type InsiderCard,
} from "@/lib/email/zip-events/compose";
import {
  advanceSnapshots,
  assembleFreshSnapshots,
  assembleLifecycleCounts,
  loadStoredSnapshots,
} from "@/lib/email/zip-events/state";
import { loadPulseNearby } from "@/lib/pulse/nearby";
import type { MarketEvent, ZipMetricsSnapshot } from "@/lib/email/zip-events/types";

const DRY_RUN = process.env.DRY_RUN !== "false"; // default true — must opt OUT to send
const APPROVED = process.env.WEEKLY_READ_APPROVED === "1";
const SEED_SNAPSHOTS = process.env.MARKET_ALERTS_SEED === "1";
const PREVIEW_ZIP = process.env.WEEKLY_READ_PREVIEW_ZIP;
const SITE_ORIGIN = (process.env.SITE_ORIGIN ?? "https://www.swfldatagulf.com").replace(/\/$/, "");
const BATCH_LIMIT = Number(process.env.WEEKLY_READ_BATCH_LIMIT ?? "200");
const POSTAL_ADDRESS =
  process.env.WEEKLY_READ_POSTAL_ADDRESS ?? process.env.OUTREACH_POSTAL_ADDRESS;

type SendClass = "baseline" | "alert" | "weekly";

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
  class?: SendClass;
  trigger?: string;
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
function preSendGates(html: string, subject: string): string[] {
  const failures: string[] = [];
  if (!html.includes(UNSUBSCRIBE_TOKEN)) failures.push("unsubscribe token missing");
  if (!subject.trim()) failures.push("empty subject");
  return failures;
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function asOfMMDDYYYY(now: Date): string {
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  return `${mm}/${dd}/${now.getUTCFullYear()}`;
}

function placeFor(zip: string): string | null {
  const res = resolveZip(zip);
  if (!res.in_scope) return null;
  return (res.places.find((p) => p.match === "primary") ?? res.places[0])?.place ?? null;
}

/** Deterministic insider morsel from the ZIP's held internals — no invention:
 *  every row requires the underlying figure; too few held rows ⇒ no card. */
function insiderFor(
  place: string | null,
  zip: string,
  snap: ZipMetricsSnapshot | undefined,
): InsiderCard | null {
  if (!snap) return null;
  const rows: { label: string; value: string }[] = [];
  if (snap.heat.absorption_rate_pct != null) {
    rows.push({
      label: "30-day absorption rate",
      value: `${snap.heat.absorption_rate_pct}% of inventory`,
    });
  }
  if (snap.metrics.actives != null) {
    rows.push({ label: "Active listings", value: snap.metrics.actives.toLocaleString("en-US") });
  }
  if (snap.metrics.sold_count_30d != null) {
    rows.push({
      label: "Sold in 30 days",
      value: snap.metrics.sold_count_30d.toLocaleString("en-US"),
    });
  }
  if (rows.length < 2) return null;
  return {
    title: `Market internals for ${place ?? zip}: how fast inventory is actually moving`,
    rows,
    source: "SWFL Data Gulf listing lifecycle",
  };
}

async function main(): Promise<void> {
  const db = createServiceRoleClient();
  const lake = createServiceRoleClientUntyped();
  const now = new Date();
  const asOf = asOfMMDDYYYY(now);
  const issueId = `ma-${now.toISOString().slice(0, 10)}`;

  // ── FOOTPRINT PASS — subscriber-independent, scales with the 58 ZIPs ───────
  const areas = loadMarketAreas();
  const areaLabelsById = Object.fromEntries(areas.map((a) => [a.area_id, a.label]));
  const allZips = areas.flatMap((a) => a.zips);

  console.log(
    `[market-alerts] ${DRY_RUN ? "DRY_RUN " : ""}footprint=${allZips.length} ZIPs · ${areas.length} areas`,
  );

  const [stored, fresh, lifecycle] = await Promise.all([
    loadStoredSnapshots(lake, allZips),
    assembleFreshSnapshots(lake, allZips, now),
    assembleLifecycleCounts(lake, allZips, now),
  ]);

  const events: MarketEvent[] = [];
  for (const area of areas) {
    const areaMedian = median(
      area.zips
        .map((z) => fresh.get(z)?.metrics.median_sale_price)
        .filter((v): v is number => v != null),
    );
    for (const zip of area.zips) {
      const f = fresh.get(zip);
      if (!f) continue;
      const prev = stored.get(zip) ?? null;
      events.push(...detectThresholdCross(prev, f, area));
      const flip = detectRankFlip(prev?.rank_position ?? null, f.rank_position, zip, area);
      if (flip) events.push(flip);
      const c = lifecycle.get(zip);
      if (c) {
        events.push(
          ...detectLifecycleBurst(
            {
              zip,
              price_cuts: c.price_cuts,
              new_listings: c.new_listings,
              trailing_weekly_new_listings: c.trailing_weekly_new_listings,
              notable_sale:
                c.max_sold_price != null
                  ? { sold_price: c.max_sold_price, area_median_sale_price: areaMedian }
                  : null,
            },
            area,
          ),
        );
      }
    }
    // Area news — anchor-ZIP pulse items, capped, empty-tolerant.
    try {
      const items = (await loadPulseNearby(area.zips[0])).slice(0, 3).map((i): AreaNewsItem => ({
        title: i.fact,
        zip: i.zip_code ?? area.zips[0],
        distance_band: i.geo_grain ?? "",
        published_at: i.captured_at.slice(0, 10),
      }));
      events.push(...detectNearbyNews(items, area));
    } catch {
      // pulse unavailable — news fill simply absent this run
    }
  }

  const prevRanks: AreaHeatRank[] = rankAreaHeat(
    areas
      .map((a) => areaHeatInputs(a, stored))
      .filter((i): i is NonNullable<typeof i> => i !== null),
  );
  const freshRanks: AreaHeatRank[] = rankAreaHeat(
    areas
      .map((a) => areaHeatInputs(a, fresh))
      .filter((i): i is NonNullable<typeof i> => i !== null),
  );
  events.push(...detectHeatShift(prevRanks, freshRanks));

  const byClass = { alert: 0, weekly: 0 };
  for (const e of events) if (e.class === "alert" || e.class === "weekly") byClass[e.class]++;
  console.log(
    `[market-alerts] events: ${events.length} (alert=${byClass.alert} weekly=${byClass.weekly}) · heat-ranked areas: ${freshRanks.length}`,
  );

  // ── SUBSCRIBER PASS ─────────────────────────────────────────────────────────
  const { data, error } = await db
    .from("weekly_read_subscribers")
    .select("id, email, zip, status, next_send_at, issues_sent")
    .eq("status", "active")
    .order("next_send_at", { ascending: true, nullsFirst: true })
    .limit(BATCH_LIMIT);
  if (error) throw new Error(`select weekly-read subscribers: ${error.message}`);
  const subscribers = (data ?? []) as DueRow[];

  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const outDir = join("runs", "weekly-read-runs", stamp);
  await mkdir(outDir, { recursive: true });

  const rows: RunRow[] = [];
  const sendable: Array<{ rec: DueRow; cls: SendClass; out: WeeklyReadOutgoing; zip: string }> = [];
  const previewWritten = new Set<string>();

  async function buildFor(
    rec: DueRow,
    area: MarketArea,
  ): Promise<
    { cls: SendClass; doc: EmailDoc; subject: string; trigger: string } | { skip: string }
  > {
    const place = placeFor(rec.zip);
    const f = fresh.get(rec.zip);
    if (rec.issues_sent === 0) {
      if (!f) return { skip: "no_fresh_snapshot" };
      const areaEvents = events.filter((e) => e.area_id === area.area_id && e.class !== "baseline");
      const heatPos = freshRanks.find((r) => r.area_id === area.area_id)?.position ?? null;
      return {
        cls: "baseline",
        doc: composeBaselineDoc({
          subscriberZip: rec.zip,
          subscriberPlace: place,
          area,
          asOf,
          reportUrl: `${SITE_ORIGIN}/r/zip-report/${rec.zip}`,
          snapshot: f,
          heatPosition: heatPos,
          recentEvents: areaEvents,
        }),
        subject: baselineSubject(place, area.label),
        trigger: "baseline",
      };
    }
    const alerts = pickDailyAlert(events, rec.zip, area);
    if (alerts.length > 0) {
      return {
        cls: "alert",
        doc: composeAlertDoc({
          events: alerts,
          subscriberZip: rec.zip,
          subscriberPlace: place,
          area,
          asOf,
          reportUrl: `${SITE_ORIGIN}/r/zip-report/${rec.zip}`,
        }),
        subject: subjectFor(alerts, place, area.label),
        trigger: alerts[0].type,
      };
    }
    if (!shouldSend({ status: "active", next_send_at: rec.next_send_at }, now)) {
      return { skip: "not_due" };
    }
    const sel = selectWeeklyContent(rec.zip, area, events);
    if (!sel.send) return { skip: "flat_week" }; // cursor NOT advanced — first mover next run
    return {
      cls: "weekly",
      doc: composeWeeklyDoc({
        events: sel.used,
        subscriberZip: rec.zip,
        subscriberPlace: place,
        area,
        asOf,
        reportUrl: `${SITE_ORIGIN}/r/zip-report/${rec.zip}`,
        heatRanks: freshRanks,
        areaLabelsById,
        insider: shouldIncludeInsider(rec.issues_sent) ? insiderFor(place, rec.zip, f) : null,
      }),
      subject: subjectFor(sel.used, place, area.label),
      trigger: sel.used[0].type,
    };
  }

  for (const rec of subscribers) {
    const area = areaForZip(rec.zip);
    if (!area) {
      rows.push({ email: rec.email, zip: rec.zip, outcome: "skipped", reason: "out_of_footprint" });
      continue;
    }
    let built: Awaited<ReturnType<typeof buildFor>>;
    try {
      built = await buildFor(rec, area);
    } catch (err) {
      rows.push({
        email: rec.email,
        zip: rec.zip,
        outcome: "skipped",
        reason: `build failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue; // one subscriber's failure never sinks the run
    }
    if ("skip" in built) {
      rows.push({ email: rec.email, zip: rec.zip, outcome: "skipped", reason: built.skip });
      continue;
    }
    const rendered = await renderEmailDocHtml(built.doc);
    const html = finalizeIssueHtml(rendered, {
      ctaUrl: `${SITE_ORIGIN}/r/zip-report/${rec.zip}`,
      ...(POSTAL_ADDRESS ? { postalAddress: POSTAL_ADDRESS } : {}),
    });
    // Preview FIRST — one per zip+class. No preview, no send.
    const previewName = `zip-${rec.zip}-${built.cls}.html`;
    if (!previewWritten.has(previewName)) {
      await writeFile(join(outDir, previewName), html);
      previewWritten.add(previewName);
    }
    const failures = preSendGates(html, built.subject);
    if (failures.length > 0) {
      rows.push({
        email: rec.email,
        zip: rec.zip,
        class: built.cls,
        trigger: built.trigger,
        outcome: "skipped",
        reason: `gates: ${failures.join(" | ")}`,
        subject: built.subject,
        preview: previewName,
      });
      continue;
    }
    rows.push({
      email: rec.email,
      zip: rec.zip,
      class: built.cls,
      trigger: built.trigger,
      outcome: DRY_RUN ? "would_send" : "sent",
      subject: built.subject,
      preview: previewName,
    });
    sendable.push({
      rec,
      cls: built.cls,
      zip: rec.zip,
      out: {
        subscriberId: rec.id,
        email: rec.email,
        subject: built.subject,
        html,
        tags: [
          { name: "ma", value: issueId },
          { name: "trigger", value: built.trigger },
          { name: "area", value: area.area_id },
          { name: "class", value: built.cls },
        ],
      },
    });
  }

  // ── Operator sample previews (no subscriber needed) ─────────────────────────
  if (PREVIEW_ZIP) {
    const area = areaForZip(PREVIEW_ZIP);
    const f = fresh.get(PREVIEW_ZIP);
    if (area && f) {
      const place = placeFor(PREVIEW_ZIP);
      const heatPos = freshRanks.find((r) => r.area_id === area.area_id)?.position ?? null;
      const baseDoc = composeBaselineDoc({
        subscriberZip: PREVIEW_ZIP,
        subscriberPlace: place,
        area,
        asOf,
        reportUrl: `${SITE_ORIGIN}/r/zip-report/${PREVIEW_ZIP}`,
        snapshot: f,
        heatPosition: heatPos,
        recentEvents: events.filter((e) => e.area_id === area.area_id && e.class !== "baseline"),
      });
      await writeFile(
        join(outDir, `sample-${PREVIEW_ZIP}-baseline.html`),
        await renderEmailDocHtml(baseDoc),
      );
      const sel = selectWeeklyContent(PREVIEW_ZIP, area, events);
      if (sel.send) {
        const weeklyDoc = composeWeeklyDoc({
          events: sel.used,
          subscriberZip: PREVIEW_ZIP,
          subscriberPlace: place,
          area,
          asOf,
          reportUrl: `${SITE_ORIGIN}/r/zip-report/${PREVIEW_ZIP}`,
          heatRanks: freshRanks,
          areaLabelsById,
          insider: insiderFor(place, PREVIEW_ZIP, f),
        });
        await writeFile(
          join(outDir, `sample-${PREVIEW_ZIP}-weekly.html`),
          await renderEmailDocHtml(weeklyDoc),
        );
      }
      console.log(
        `[market-alerts] sample previews written for ${PREVIEW_ZIP} (weekly ${sel.send ? "yes" : "flat"})`,
      );
    } else {
      console.log(
        `[market-alerts] PREVIEW_ZIP ${PREVIEW_ZIP} out of footprint or no snapshot — no sample`,
      );
    }
  }

  const summary = {
    footprint_zips: allZips.length,
    events: events.length,
    heat_ranked_areas: freshRanks.length,
    subscribers: subscribers.length,
    sendable: sendable.length,
    by_class: {
      baseline: sendable.filter((s) => s.cls === "baseline").length,
      alert: sendable.filter((s) => s.cls === "alert").length,
      weekly: sendable.filter((s) => s.cls === "weekly").length,
    },
    skipped: rows.filter((r) => r.outcome === "skipped").length,
  };
  await writeFile(
    join(outDir, "run-report.json"),
    JSON.stringify(
      { generated_at: now.toISOString(), dry_run: DRY_RUN, issue_id: issueId, summary, rows },
      null,
      2,
    ),
  );

  console.log("\n========================================================================");
  console.log(`RUN REPORT: ${join(outDir, "run-report.json")}`);
  console.log(`SUMMARY: ${JSON.stringify(summary)}`);
  for (const r of rows) {
    console.log(
      `  ${r.outcome.toUpperCase().padEnd(11)} ${r.zip} ${(r.class ?? "-").padEnd(8)} ${r.email}`,
    );
    if (r.subject) console.log(`    subject: ${r.subject}`);
    if (r.reason) console.log(`    reason: ${r.reason}`);
  }
  console.log("========================================================================\n");

  // Snapshot seeding: rows that don't exist yet emit no events, so writing them
  // loses nothing. Live runs always seed; DRY seeds only on explicit opt-in.
  if (!DRY_RUN || SEED_SNAPSHOTS) {
    const missing = allZips.filter((z) => !stored.has(z) && fresh.has(z));
    if (missing.length > 0) {
      await advanceSnapshots(
        lake,
        missing.map((z) => fresh.get(z)!),
        // seeded, not sent: advanced_at reflects seed time — first-run semantics
        now.toISOString(),
      );
      console.log(`[market-alerts] seeded ${missing.length} first-run snapshot row(s).`);
    }
  }

  if (DRY_RUN) {
    console.log(
      "[market-alerts] DRY_RUN — previews written, nothing sent, cadence/snapshots untouched.",
    );
    return;
  }

  // ── live send: the operator's approval ladder, refused loudly when incomplete ──
  if (!APPROVED) {
    console.error(
      "[market-alerts] LIVE SEND REFUSED — operator approval required: review the previews, then set WEEKLY_READ_APPROVED=1.",
    );
    process.exit(1);
  }
  if (!POSTAL_ADDRESS) {
    console.error("[market-alerts] LIVE SEND REFUSED — set WEEKLY_READ_POSTAL_ADDRESS (CAN-SPAM).");
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
  console.log(`[market-alerts] sent=${result.sent} failed=${result.failed}`);
  for (const e of result.errors) console.error(`  send error: ${e}`);

  // Advance cadence cursors (an alert advances too — it absorbs the next roundup)
  // and snapshot state for the ZIPs that actually reached a subscriber.
  const sentZips = new Set(sendable.map((s) => s.zip));
  await advanceSnapshots(
    lake,
    [...sentZips].map((z) => fresh.get(z)).filter((s): s is ZipMetricsSnapshot => !!s),
    now.toISOString(),
  );
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
  console.log(
    `[market-alerts] advanced ${sendable.length} cadence cursor(s) + ${sentZips.size} snapshot(s).`,
  );
}

main().catch((err) => {
  console.error(`[market-alerts] FATAL: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
