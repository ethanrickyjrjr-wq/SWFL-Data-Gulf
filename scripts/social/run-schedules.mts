// scripts/social/run-schedules.mts
//
// Social scheduler cron WORKER (build 04). A standalone Bun process invoked by
// the GHA cron (social-scheduler.yml) every N minutes. Mirrors the email worker
// (`scripts/email/run-schedules.mts`) exactly in structure; swaps email seams for
// social seams.
//
// ARCHITECTURE:
//   - Claims due social_schedules rows via `claim_due_social_schedules` RPC
//     (FOR UPDATE SKIP LOCKED + park-on-claim).
//   - Per claimed row: freshness gate → idempotency claim → compose → render →
//     publish gate → postToChannel (or dry_run record) → re-arm.
//   - Self-healing reaper re-arms crash-orphaned rows (parked > 1h).
//
// DRY_RUN = process.env.DRY_RUN === "true"
//   A true read-only run: SELECT instead of claim RPC, no writes, no platform calls.
//
// SOCIAL_PUBLISH_ENABLED = process.env.SOCIAL_PUBLISH_ENABLED === "true"
//   When false (the default): compose + render + claim + record run, but
//   postToChannel is short-circuited and the post is written with status='dry_run'.
//   When true: postToChannel fires and platform_post_id is recorded.
//
// EXIT CODES:
//   0 — clean (including zero-due)
//   1 — top-level fatal only (missing env, claim unreachable, can't build client)
//   Per-row errors NEVER change the exit code.

import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { computeNextRunAt } from "@/lib/email/schedule-cadence";
import { claimSocialOnce } from "@/lib/social/idempotency";
import { buildTargetsFromSchedules, buildIdempotencyKey } from "@/lib/social/targets";
import { composePosts } from "@/lib/social/compose";
import { buildSocialContent } from "@/lib/social/build-content";
import { buildContentDeps } from "@/lib/social/brain-fetch";
import { passesFreshnessGate } from "@/lib/social/lifecycle";
import { renderSocialImage } from "@/lib/social/render-social-image";
import { composedPostToSocialModel } from "@/lib/social/render-model";
import { uploadSocialImage } from "@/lib/social/media-upload";
import { postToChannel } from "@/lib/social/channels/index";
import { frozenPublishPayload } from "@/lib/social/frozen-post";
import type { SocialSchedule, SocialTarget, SocialContent } from "@/lib/social/types";
import type { BuildSocialContentDeps } from "@/lib/social/build-content";

const DRY_RUN = process.env.DRY_RUN === "true";
const PUBLISH_ENABLED = process.env.SOCIAL_PUBLISH_ENABLED === "true";
const CLAIM_LIMIT = 50;

// Crash-orphan reaper window: a parked row (next_run_at=NULL) whose last_run_at
// is older than this is a genuine crash-orphan, safe to re-arm. A freshly-claimed
// row has last_run_at=now, so it will NOT be reaped mid-flight by a concurrent run.
const ORPHAN_STALE_MS = 60 * 60 * 1000; // 1 hour

// ── main ───────────────────────────────────────────────────────────────────────

function requireEnv(): void {
  // SDG_CRYPTO_KEY is required for token decryption (refreshAccessToken reads it).
  // Only enforce on a real publish run (a DRY_RUN with PUBLISH_ENABLED=false never
  // calls token refresh); but SDG_CRYPTO_KEY is also needed for local dry-runs in CI
  // if we're claiming + reading account rows. Warn rather than hard-block so a pure
  // dry-run smoke pass without crypto secrets still exits 0 and logs the gap.
  if (!DRY_RUN && PUBLISH_ENABLED && !process.env.SDG_CRYPTO_KEY) {
    throw new Error("SDG_CRYPTO_KEY is required for live publish runs (token decryption).");
  }
  if (!DRY_RUN && !process.env.SUPABASE_URL) {
    throw new Error("SUPABASE_URL is required for a real run.");
  }
}

async function main(): Promise<void> {
  requireEnv();
  const db = createServiceRoleClient(); // throws → top-level fatal
  const now = new Date();
  const nowIso = now.toISOString();
  const contentDeps = buildContentDeps();

  // ── DRY_RUN vs. real claim ────────────────────────────────────────────────
  async function claimDue(): Promise<SocialSchedule[]> {
    if (DRY_RUN) {
      const { data, error } = await db
        .from("social_schedules")
        .select("*")
        .eq("status", "active")
        .not("next_run_at", "is", null)
        .lte("next_run_at", nowIso)
        .order("next_run_at", { ascending: true })
        .limit(CLAIM_LIMIT);
      if (error) throw new Error(`dry-run select due schedules failed: ${error.message}`);
      return (data ?? []) as SocialSchedule[];
    }
    const { data, error } = await db.rpc("claim_due_social_schedules", {
      p_now: nowIso,
      p_limit: CLAIM_LIMIT,
    });
    if (error) throw new Error(`claim_due_social_schedules failed: ${error.message}`);
    return (data ?? []) as SocialSchedule[];
  }

  // ── SELF-HEALING REAPER (real runs only) ──────────────────────────────────
  // Re-arms active rows whose next_run_at was parked (NULL) by a prior crashed
  // worker and never re-armed. The staleness guard (last_run_at older than
  // ORPHAN_STALE_MS) ensures a freshly-claimed row is NOT reaped mid-flight.
  async function reapCrashOrphans(): Promise<void> {
    if (DRY_RUN) return; // never mutate in a dry run
    const staleBeforeIso = new Date(now.getTime() - ORPHAN_STALE_MS).toISOString();
    const { data, error } = await db
      .from("social_schedules")
      .select("*")
      .is("next_run_at", null)
      .eq("status", "active")
      .lt("last_run_at", staleBeforeIso)
      .limit(CLAIM_LIMIT);
    if (error) throw new Error(`reaper select crash-orphans failed: ${error.message}`);
    const orphans = (data ?? []) as SocialSchedule[];
    if (orphans.length === 0) return;

    let reaped = 0;
    for (const row of orphans) {
      try {
        const nextRunAt = computeNextRunAt(row as Parameters<typeof computeNextRunAt>[0], now);
        const { error: upErr } = await db
          .from("social_schedules")
          .update({ next_run_at: nextRunAt?.toISOString() ?? null, updated_at: nowIso })
          .eq("id", row.id);
        if (upErr) throw new Error(upErr.message);
        reaped++;
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.error(`[social] reaper failed for schedule ${row.id}: ${reason}`);
      }
    }
    console.log(
      `[social] reaper re-armed ${reaped} crash-orphaned schedule(s) ` +
        `(of ${orphans.length} stale parked, threshold=${staleBeforeIso}).`,
    );
  }

  await reapCrashOrphans();

  const rows = await claimDue();
  console.log(
    `[social] ${DRY_RUN ? "DRY_RUN " : ""}claimed ${rows.length} due schedule(s) at ${nowIso}.`,
  );
  if (rows.length === 0) {
    console.log("[social] nothing due; exiting clean.");
    return;
  }

  // ── Look up the last freshness_token posted per schedule (freshness gate) ──
  // Batch: one IN query for all claimed schedule IDs.
  const scheduleIds = rows.map((r) => r.id);
  const lastTokenByScheduleId = new Map<number, string | null>();
  if (!DRY_RUN) {
    const { data: posts } = await db
      .from("social_posts")
      .select("post_schedule_id, freshness_token, created_at")
      .in("post_schedule_id", scheduleIds)
      .order("created_at", { ascending: false })
      .limit(scheduleIds.length * 5); // fetch enough rows to cover all schedules
    if (posts) {
      for (const post of posts as Array<{
        post_schedule_id: number | null;
        freshness_token: string | null;
      }>) {
        if (post.post_schedule_id != null && !lastTokenByScheduleId.has(post.post_schedule_id)) {
          lastTokenByScheduleId.set(post.post_schedule_id, post.freshness_token);
        }
      }
    }
  }

  // ── Build targets from schedule rows ──────────────────────────────────────
  const { targets: allTargets, errors: parseErrors } = buildTargetsFromSchedules(
    rows,
    lastTokenByScheduleId,
  );
  for (const e of parseErrors) {
    console.error(`[social] schedule ${e.scheduleId} invalid: ${e.reason}`);
  }

  // ── Process per row (one bad row NEVER aborts the batch) ──────────────────
  const tally = { published: 0, dry_run: 0, skipped: 0, error: 0 };

  for (const row of rows) {
    const target = allTargets.find((t) => t.scheduleId === row.id);
    try {
      if (!target) {
        // parse error already logged above — re-arm and move on.
        tally.skipped++;
        continue;
      }
      const outcome = await processSchedule(row, target, db, now, contentDeps);
      tally[outcome]++;
    } catch (err) {
      // Per-row errors are isolated — never change the exit code.
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`[social] schedule ${row.id} FATAL: ${reason}`);
      tally.error++;
    } finally {
      // Re-arm in `finally` so a crashed process still gets a next_run_at if we
      // were mid-flight; DRY_RUN skip (read-only).
      if (!DRY_RUN) {
        const nextRunAt = computeNextRunAt(row as Parameters<typeof computeNextRunAt>[0], now);
        const { error: rearmErr } = await db
          .from("social_schedules")
          .update({
            next_run_at: nextRunAt?.toISOString() ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        if (rearmErr) {
          console.error(`[social] re-arm schedule ${row.id}: ${rearmErr.message}`);
        }
      }
    }
  }

  console.log(
    `[social] done — published=${tally.published} dry_run=${tally.dry_run} ` +
      `skipped=${tally.skipped} error=${tally.error} (total=${rows.length}).`,
  );
}

type RowOutcome = "published" | "dry_run" | "skipped" | "error";

/**
 * Process one claimed social schedule:
 *   freshness gate → idempotency claim → compose → render → publish gate →
 *   write social_posts.
 *
 * Returns the outcome key for the summary tally.
 * Never throws past its boundary (the caller's try/catch is a safety net, but
 * per-row errors should resolve to "error" or "skipped" here, not propagate).
 */
async function processSchedule(
  row: SocialSchedule,
  target: SocialTarget,
  db: ReturnType<typeof createServiceRoleClient>,
  now: Date,
  contentDeps: BuildSocialContentDeps,
): Promise<RowOutcome> {
  const scheduleId = row.id;
  const log = (msg: string) => console.log(`[social:${scheduleId}] ${msg}`);

  // ── FROZEN CANVAS IMAGE — post verbatim. Skip content build + the freshness gate
  //    (a v1 frozen image is static; the gate would suppress every repeat fire). Keep
  //    the at-most-once idempotency claim and the publish gate. ──
  const frozen = frozenPublishPayload(row);
  if (frozen) {
    const nowIso = now.toISOString();
    const idempotencyKey = buildIdempotencyKey(scheduleId, now);
    if (!DRY_RUN) {
      const won = await claimSocialOnce(db, idempotencyKey, {
        userId: target.userId,
        kind: "post",
        scheduleId,
      });
      if (!won) {
        log(`frozen: already claimed for ${idempotencyKey} — skip duplicate`);
        return "skipped";
      }
    }
    const frozenToken = row.frozen_post?.freshness_token ?? null;
    if (DRY_RUN || !PUBLISH_ENABLED) {
      log(
        DRY_RUN
          ? "DRY_RUN — frozen post (no write)"
          : "publish gate closed — frozen dry_run record",
      );
      if (!DRY_RUN) {
        const { error } = await db.from("social_posts").upsert(
          {
            post_schedule_id: scheduleId,
            social_account_id: target.accountId,
            platform: target.platform,
            platform_post_id: null,
            freshness_token: frozenToken,
            caption: frozen.caption,
            media_url: frozen.media[0]?.url ?? null,
            status: "dry_run",
            error: null,
            idempotency_key: idempotencyKey,
            published_at: null,
            created_at: nowIso,
            updated_at: nowIso,
          },
          { onConflict: "idempotency_key", ignoreDuplicates: true },
        );
        if (error) {
          log(`frozen social_posts upsert (dry_run) failed: ${error.message}`);
          return "error";
        }
      }
      return "dry_run";
    }
    const result = await postToChannel(db, target.userId, {
      platform: target.platform,
      accountId: target.accountId,
      caption: frozen.caption,
      media: frozen.media,
    });
    const { error: insErr } = await db.from("social_posts").upsert(
      {
        post_schedule_id: scheduleId,
        social_account_id: target.accountId,
        platform: target.platform,
        platform_post_id: result.ok ? (result.platform_post_id ?? null) : null,
        freshness_token: frozenToken,
        caption: frozen.caption,
        media_url: frozen.media[0]?.url ?? null,
        status: result.ok ? "published" : "failed",
        error: result.ok ? null : (result.error ?? "unknown error"),
        idempotency_key: idempotencyKey,
        published_at: result.ok ? nowIso : null,
        created_at: nowIso,
        updated_at: nowIso,
      },
      { onConflict: "idempotency_key", ignoreDuplicates: true },
    );
    if (insErr) log(`frozen social_posts upsert failed: ${insErr.message}`);
    if (result.ok) {
      log(`frozen: published to ${target.platform} — post_id=${result.platform_post_id ?? "?"}`);
      return "published";
    }
    log(`frozen: publish failed on ${target.platform}: ${result.error ?? "unknown"}`);
    return "error";
  }

  // 1. Build content first — we need the freshness_token for the gate check.
  const content: SocialContent | null = await buildSocialContent(target, contentDeps);

  if (!content) {
    log(
      `out_of_scope — no in-scope brain data for ${target.scopeKind ?? "region"}:${target.scopeValue ?? ""}`,
    );
    return "skipped";
  }

  // 2. Freshness gate: skip if the brain data hasn't advanced since last post.
  //    If freshness_gate is disabled on this schedule, always proceed.
  if (!passesFreshnessGate(target.freshnessGate, content.freshness, target.lastFreshnessToken)) {
    log(`freshness gate: token unchanged (${content.freshness}) — skip`);
    return "skipped";
  }

  // 3. At-most-once idempotency claim (DRY_RUN: skip — read-only).
  if (!DRY_RUN) {
    const idempotencyKey = buildIdempotencyKey(scheduleId, now);
    const won = await claimSocialOnce(db, idempotencyKey, {
      userId: target.userId,
      kind: "post",
      scheduleId,
    });
    if (!won) {
      log(`already claimed for ${idempotencyKey} — skipping duplicate`);
      return "skipped";
    }
  }

  // 4. Compose (build caption + hashtags). We already have content from step 1,
  //    but we route through composePosts to keep the MOAT gate in one place.
  //    Pass the already-fetched content to avoid a double fetch.
  const { posts } = await composePosts([target], async () => content);
  const composed = posts[0];

  if (composed.status !== "ready" || !composed.post) {
    log(`compose ${composed.status}: ${composed.reason ?? "no post"}`);
    return "skipped";
  }

  // 5. Render social image (build 02) → upload to public Storage → mediaUrl.
  //    Every adapter consumes a URL (Meta/IG fetch server-side from a PUBLIC url;
  //    X v2 upload fetches the bytes from the url too), so the rendered PNG must be
  //    uploaded. Render OR upload failure is NON-FATAL: log and post without an
  //    image rather than skip the row.
  //    DRY_RUN stays read-only (no Storage write); the upload runs on the normal
  //    path (PUBLISH_ENABLED=false still writes a dry_run record carrying media_url).
  let mediaUrl: string | null = null;
  try {
    const imageBuffer = await renderSocialImage({
      model: composedPostToSocialModel(composed.post, target, now),
      format: "square",
      now,
    });
    if (DRY_RUN) {
      log(`rendered image: ${imageBuffer.byteLength} bytes (DRY_RUN — Storage upload skipped)`);
    } else {
      const key = `${scheduleId}/${now.toISOString().slice(0, 10)}.png`;
      mediaUrl = await uploadSocialImage(db, imageBuffer, key);
      log(`rendered + uploaded image: ${imageBuffer.byteLength} bytes → ${mediaUrl}`);
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    // Image render/upload failures are non-fatal: post without an image rather than skip.
    log(`image render/upload failed (non-fatal): ${reason}`);
  }

  // 6. Publish gate + write social_posts.
  const idempotencyKey = buildIdempotencyKey(scheduleId, now);
  const caption = composed.post.caption;
  const nowIso = now.toISOString();

  if (DRY_RUN || !PUBLISH_ENABLED) {
    // DRY or publish gate closed: write status='dry_run', never call postToChannel.
    log(
      DRY_RUN
        ? `DRY_RUN — would post to ${target.platform} (no DB write in dry run)`
        : `SOCIAL_PUBLISH_ENABLED!=true — writing dry_run record`,
    );
    if (!DRY_RUN) {
      const { error } = await db.from("social_posts").upsert(
        {
          post_schedule_id: scheduleId,
          social_account_id: target.accountId,
          platform: target.platform,
          platform_post_id: null,
          freshness_token: content.freshness,
          caption,
          media_url: mediaUrl,
          status: "dry_run",
          error: null,
          idempotency_key: idempotencyKey,
          published_at: null,
          created_at: nowIso,
          updated_at: nowIso,
        },
        { onConflict: "idempotency_key", ignoreDuplicates: true },
      );
      if (error) {
        log(`social_posts upsert (dry_run) failed: ${error.message}`);
        return "error";
      }
    }
    return "dry_run";
  }

  // PUBLISH_ENABLED=true: call postToChannel and record the result.
  const result = await postToChannel(db, target.userId, {
    platform: target.platform,
    accountId: target.accountId,
    caption,
    media: mediaUrl ? [{ url: mediaUrl, ratio: "1:1" }] : [],
  });

  const { error: insertErr } = await db.from("social_posts").upsert(
    {
      post_schedule_id: scheduleId,
      social_account_id: target.accountId,
      platform: target.platform,
      platform_post_id: result.ok ? (result.platform_post_id ?? null) : null,
      freshness_token: content.freshness,
      caption,
      media_url: mediaUrl,
      status: result.ok ? "published" : "failed",
      error: result.ok ? null : (result.error ?? "unknown error"),
      idempotency_key: idempotencyKey,
      published_at: result.ok ? nowIso : null,
      created_at: nowIso,
      updated_at: nowIso,
    },
    { onConflict: "idempotency_key", ignoreDuplicates: true },
  );
  if (insertErr) {
    log(`social_posts upsert failed: ${insertErr.message}`);
    // The post may have published successfully — don't count as "error" from publish's perspective
  }

  if (result.ok) {
    log(`published to ${target.platform} — post_id=${result.platform_post_id ?? "?"}`);
    return "published";
  } else {
    log(`publish failed on ${target.platform}: ${result.error ?? "unknown"}`);
    return "error";
  }
}

main().catch((err) => {
  // Top-level fatal ONLY: missing env, claim unreachable, client construction.
  // Per-schedule errors are isolated inside processSchedule and never reach here.
  console.error("[social] FATAL", err);
  process.exit(1);
});
