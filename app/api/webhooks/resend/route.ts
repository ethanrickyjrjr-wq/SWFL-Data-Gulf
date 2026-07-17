/**
 * Resend inbound webhook — the return path of the Buyer-Intent Reply Sensor.
 *
 * When a client replies to a branded market-data email, Resend POSTs an
 * `email.received` event here. We verify the Svix signature, then hand the event
 * to the DI orchestrator (`processInboundReply`) which identifies the agent (via
 * the reply token → `email_sends`) and the client (via `from` → `email_contacts`),
 * runs the auto-reply gates, fires the grounded auto-reply, and alerts the agent.
 *
 * This route is the ADAPTER: it builds the real seams (Resend body fetch +
 * transactional send, Supabase lookups + writes, the grounded engine). All
 * decision logic lives in lib/email/process-inbound.ts (unit-tested with mocks).
 */
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { getMarketingResend } from "@/lib/email/marketing-client";
import { resolveSender } from "@/lib/email/sender-config";
import { verifySvixSignature } from "@/lib/email/svix-verify";
import { replyDomain } from "@/lib/email/reply-token";
import { generateGroundedAnswer } from "@/lib/grounded-answer";
import { buildAlertContent } from "@/lib/email/agent-alert";
import {
  processInboundReply,
  type InboundDeps,
  type InboundEvent,
} from "@/lib/email/process-inbound";
import { extractOutreachAction, type ResendWebhookPayload } from "@/lib/email/outreach/lifecycle";
import {
  extractBlastAction,
  extractBroadcastEvent,
  type ResendWebhookPayload as BlastWebhookPayload,
} from "@/lib/email/blast-events";
import { onDemoEvent, type DemoStage } from "@/lib/email/outreach/demo-cadence";
import { extractWeeklyReadAction } from "@/lib/email/weekly-read/webhook";
import { extractMarketAlertEngagement } from "@/lib/email/zip-events/webhook";
import {
  extractCampaignClick,
  buildClickAlertContent,
  type CampaignClickPayload,
} from "@/lib/email/campaign-click-alert";
import { isSwitchInbound } from "@/lib/switch/forward-inbound";
import {
  processForwardEmail,
  MAX_ATTACHMENT_BYTES,
  type ForwardDeps,
  type ForwardEvent,
} from "@/lib/switch/forward-handler";
// KNOWN-DEBT(market_alert_engagement / campaign_click_events are new public tables not yet in
// Database types — regen types, then retype)
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PLATFORM = {
  fromName: process.env.DIGEST_SENDER_NAME ?? "SWFL Data Gulf",
  fromEmail: process.env.DIGEST_SENDER_ADDRESS ?? "hello@swfldatagulf.com",
};

function siteOrigin(req: Request): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? new URL(req.url).origin;
}

/** OUR own sending/reply domains -- an inbound `From` on either is a loop
 *  with ourselves or a spoof, never a real switch/reply target (security
 *  review, Minor f: reply-loop / backscatter guard). */
function ourDomains(): string[] {
  const platformDomain = PLATFORM.fromEmail.includes("@")
    ? PLATFORM.fromEmail.slice(PLATFORM.fromEmail.indexOf("@") + 1)
    : PLATFORM.fromEmail;
  return [replyDomain(), platformDomain];
}

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[resend-webhook] RESEND_WEBHOOK_SECRET unset — refusing to process.");
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }

  // Raw body is required for signature verification (must not be re-serialized).
  const raw = await request.text();
  const ok = verifySvixSignature(secret, raw, {
    id: request.headers.get("svix-id"),
    timestamp: request.headers.get("svix-timestamp"),
    signature: request.headers.get("svix-signature"),
  });
  if (!ok) {
    return NextResponse.json({ error: "bad_signature" }, { status: 401 });
  }

  let event: InboundEvent;
  try {
    event = JSON.parse(raw) as InboundEvent;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  // ── Switch forward lane: "bring your own list" competitor migration ────────
  // An operator forwards a competitor contact-export or campaign email to
  // switch@<reply-domain> (spec 2026-07-16-competitor-switch-onboarding-design.md).
  // ALL decision logic lives in lib/switch/forward-handler.ts (unit-tested with
  // mocked deps); this branch only builds the real seams. EARLY RETURN: a
  // switch-addressed event is never also a buyer-intent reply/outreach/blast
  // event. Dead code until the operator wires the switch@ inbound address in
  // the Resend dashboard (same signing secret as this endpoint) — no live
  // event carries that recipient until then, so this is safe to ship ahead of
  // that operator step.
  //
  // SECURITY (07/17/2026 review): the inbound `From` is attacker-claimable,
  // so this branch ONLY STASHES what it parsed (status 'pending') -- it never
  // writes contacts/agent_profile_facts/switch_passes directly. The actual
  // write happens later, from an authenticated session, via
  // POST /api/switch/apply-forward (see lib/switch/forward-handler.ts's
  // `applyForward`).
  //
  // FIX (final whole-branch review, must-fix #1): gate on event.type too, not
  // just the recipient. `isSwitchInbound` only checks `data.to` -- an
  // imported/legacy contact whose OWN address happens to be
  // `switch@<domain>` (e.g. a real person's Gmail alias) generates
  // email.bounced/complained/clicked events with that same `to`, which would
  // otherwise early-return 200 HERE and skip the ma-engagement/suppression/
  // click branches below that a bounce/complaint/click needs to reach. Only
  // an actual inbound email (`email.received`) is a switch forward.
  if (event.type === "email.received" && isSwitchInbound(event)) {
    try {
      const sdb = createServiceRoleClient();
      const switchResend = getMarketingResend();

      const forwardDeps: ForwardDeps = {
        log: (line) => console.log(line),
        ourDomains: ourDomains(),
        siteUrl: siteOrigin(request),

        async findUserIdByEmail(email) {
          // No email->user lookup helper exists anywhere in the repo (grepped
          // listUsers/getUserByEmail/a profiles table — none found), so
          // auth.admin.listUsers is the only surface. Hard page cap (25 pages
          // x 200 = 5,000 users) so a large user base can't hang the webhook;
          // a match past the cap is a known, loud limitation, not a silent one.
          const PAGE_SIZE = 200;
          const MAX_PAGES = 25;
          const target = email.toLowerCase();
          for (let page = 1; page <= MAX_PAGES; page++) {
            const { data, error } = await sdb.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
            if (error) {
              console.error(`[resend-webhook] switch listUsers failed: ${error.message}`);
              return null;
            }
            const hit = data.users.find((u) => u.email?.toLowerCase() === target);
            if (hit) return hit.id;
            if (data.users.length < PAGE_SIZE) break;
          }
          return null;
        },

        async fetchBody(emailId) {
          const { data, error } = await switchResend.emails.receiving.get(emailId);
          if (error || !data) {
            throw new Error(`receiving.get ${emailId}: ${error?.message ?? "no data"}`);
          }
          return {
            from: data.from ?? "",
            html: data.html ?? null,
            text: data.text ?? "",
            headers: (data.headers as Record<string, string | undefined>) ?? {},
            attachments: (data.attachments ?? []).map((a) => ({
              id: a.id,
              filename: a.filename ?? "",
              contentType: a.content_type,
              size: a.size,
            })),
          };
        },

        async fetchAttachmentText(emailId, attachmentId) {
          try {
            const { data, error } = await switchResend.emails.receiving.attachments.get({
              emailId,
              id: attachmentId,
            });
            if (error || !data) {
              console.error(
                `[resend-webhook] switch attachment fetch failed: ${error?.message ?? "no data"}`,
              );
              return null;
            }
            // download_url is signed + expires in 1hr. The pure core already
            // declined anything over MAX_ATTACHMENT_BYTES by Resend's own
            // metadata `size` before this ever runs; Content-Length is a
            // second, defense-in-depth check against the ACTUAL download in
            // case that metadata was missing or understated.
            const res = await fetch(data.download_url);
            if (!res.ok) {
              console.error(`[resend-webhook] switch attachment download failed: ${res.status}`);
              return null;
            }
            const contentLength = res.headers.get("content-length");
            if (contentLength && Number(contentLength) > MAX_ATTACHMENT_BYTES) {
              console.error(
                `[resend-webhook] switch attachment download Content-Length ${contentLength} over cap -- refusing.`,
              );
              return null;
            }
            return await res.text();
          } catch (err) {
            console.error(
              `[resend-webhook] switch attachment fetch error: ${err instanceof Error ? err.message : String(err)}`,
            );
            return null;
          }
        },

        async stashForward(userId, row) {
          const { error } = await sdb.from("switch_forwards").insert({
            user_id: userId,
            message_id: row.messageId,
            kind: row.kind,
            status: "pending",
            platform: row.platform,
            sender_domain: row.senderDomain,
            html: row.html,
            payload: row.payload,
          });
          if (!error) return "inserted";
          // 23505 = message_id already stashed -- Svix (Resend's webhook
          // signer) is at-least-once, so a redelivery of the same event is
          // expected, not an error. Skip, don't re-reply.
          if (error.code === "23505") return "duplicate";
          console.error(`[resend-webhook] switch_forwards stash failed: ${error.message}`);
          return "error";
        },

        async sendReply(to, subject, text) {
          const res = await switchResend.emails.send({
            from: `${PLATFORM.fromName} <${PLATFORM.fromEmail}>`,
            to,
            subject,
            text,
          });
          if (res.error) {
            console.error(`[resend-webhook] switch reply send failed: ${res.error.message}`);
          }
        },
      };

      const outcome = await processForwardEmail(event as ForwardEvent, forwardDeps);
      return NextResponse.json({ ok: true, kind: "switch", outcome }, { status: 200 });
    } catch (err) {
      // Never 500 a webhook (house rule, this route) — log + ack.
      console.error(
        `[resend-webhook] switch forward-lane failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return NextResponse.json({ ok: false, error: "switch_processing_error" }, { status: 200 });
    }
  }

  // ── Market-area alerts: per-recipient × per-trigger engagement ─────────────
  // `ma`-tagged sends record every open/click/delivery/suppression event keyed
  // by recipient + trigger + area (paid-tier prerequisite, pinned in the
  // 07/10/2026 spec — "which contact opened the price-cut alert" stays a query).
  // NO early return: a bounce/complaint continues into the wid suppression flip.
  const maEngagement = extractMarketAlertEngagement(event as unknown as ResendWebhookPayload);
  if (maEngagement) {
    try {
      const mdb = createServiceRoleClientUntyped();
      await mdb.from("market_alert_engagement").insert({
        wid: maEngagement.wid,
        issue_id: maEngagement.issue_id,
        trigger: maEngagement.trigger,
        area_id: maEngagement.area_id,
        event: maEngagement.event,
      });
    } catch (err) {
      console.error(
        `[resend-webhook] ma engagement insert failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ── Campaign click alerts: listing-campaign milestone emails ───────────────
  // Spec 2026-07-15-campaign-click-alerts-design.md. Milestone sends go out as Resend
  // Broadcasts (no did/rid/wid tag), so this keys off data.broadcast_id instead — present on
  // every email.clicked event for a broadcast send. broadcast_id -> email_sends resolves
  // user_id/schedule_id; schedule_id -> email_schedules resolves project_id. A broadcast_id
  // that doesn't match an email_sends row isn't a listing-campaign send (e.g. the digest) —
  // skip silently, not every broadcast is ours to alert on. NO early return on a miss so a
  // non-listing-campaign click still falls through to the branches below (harmless — they key
  // on tags this event doesn't carry, so they no-op too).
  const campaignClick = extractCampaignClick(event as unknown as CampaignClickPayload);
  if (campaignClick) {
    try {
      const cdb = createServiceRoleClientUntyped();
      const { data: sendRow } = await cdb
        .from("email_sends")
        .select("user_id, schedule_id")
        .eq("broadcast_id", campaignClick.broadcastId)
        .maybeSingle();
      const scheduleId = sendRow?.schedule_id as number | null | undefined;
      if (sendRow?.user_id && scheduleId != null) {
        const { data: scheduleRow } = await cdb
          .from("email_schedules")
          .select("project_id")
          .eq("id", scheduleId)
          .maybeSingle();
        const projectId = scheduleRow?.project_id as string | null | undefined;
        if (projectId) {
          const { data: projectRow } = await cdb
            .from("projects")
            .select("title")
            .eq("id", projectId)
            .maybeSingle();
          const { data: contactRow } = await cdb
            .from("email_contacts")
            .select("name")
            .eq("user_id", sendRow.user_id)
            .eq("email", campaignClick.email)
            .maybeSingle();

          // Insert-then-check dedup: the unique index on (schedule_id, contact_email,
          // click_date) rejects a same-day repeat click, so only a genuinely FIRST click
          // today reaches the alert send below.
          const { error: insErr } = await cdb.from("campaign_click_events").insert({
            user_id: sendRow.user_id,
            project_id: projectId,
            schedule_id: scheduleId,
            broadcast_id: campaignClick.broadcastId,
            contact_email: campaignClick.email,
            contact_name: (contactRow?.name as string | null) ?? null,
            link: campaignClick.link,
          });
          if (!insErr) {
            const { data: userRes } = await cdb.auth.admin.getUserById(sendRow.user_id as string);
            const agentEmail = userRes?.user?.email;
            if (agentEmail) {
              const content = buildClickAlertContent({
                contactEmail: campaignClick.email,
                contactName: (contactRow?.name as string | null) ?? null,
                projectTitle: (projectRow?.title as string | null) ?? "your listing",
                link: campaignClick.link,
              });
              const alertResend = getMarketingResend();
              const res = await alertResend.emails.send({
                from: `SWFL Data Gulf Alerts <${PLATFORM.fromEmail}>`,
                to: agentEmail,
                subject: content.subject,
                text: content.text,
              });
              if (res.error) {
                console.error(`[resend-webhook] click alert send failed: ${res.error.message}`);
              }
            }
          } else if (insErr.code !== "23505") {
            // 23505 = unique_violation = already alerted today for this schedule+contact,
            // the expected/silent dedup path. Anything else is a real failure to log.
            console.error(`[resend-webhook] click event insert failed: ${insErr.message}`);
          }
        }
      }
    } catch (err) {
      console.error(
        `[resend-webhook] campaign click alert failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ── Weekly-read (Lane D): suppression only ─────────────────────────────────
  // A bounce/complaint on a `wid`-tagged send flips the subscriber terminal. The
  // status guard makes it idempotent and never resurrects an unsubscribed row.
  // Weekly-read messages carry `wid` (never `rid`), so this and the outreach
  // branch below can't both match one event.
  const weeklyAction = extractWeeklyReadAction(event as unknown as ResendWebhookPayload);
  if (weeklyAction) {
    try {
      const wdb = createServiceRoleClient();
      await wdb
        .from("weekly_read_subscribers")
        .update({ status: weeklyAction.suppressTo, updated_at: new Date().toISOString() })
        .eq("id", weeklyAction.wid)
        .eq("status", "active");
    } catch (err) {
      console.error(
        `[resend-webhook] weekly-read suppression failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return NextResponse.json({ ok: true, kind: "weekly-read" }, { status: 200 });
  }

  // ── Outreach Increment 2: outbound tracking ───────────────────────────────
  // A tagged outreach event (delivered/opened/clicked/bounced/complained) → record it
  // for our internal numbers + apply suppression (click → 'engaged' stops the drip),
  // then ack. Non-outreach events (e.g. the reply sensor's email.received) fall through.
  const outreachAction = extractOutreachAction(event as unknown as ResendWebhookPayload);
  if (outreachAction) {
    try {
      const odb = createServiceRoleClient();
      // General event log — all tracked emails (upsert; dedupe index prevents duplicates).
      await odb.from("email_events").upsert(
        {
          resend_email_id: outreachAction.emailId,
          rid: outreachAction.rid,
          event: outreachAction.event,
        },
        { onConflict: "resend_email_id,event", ignoreDuplicates: true },
      );
      // Outreach-specific: recipient ledger + suppression.
      await odb.from("outreach_events").insert({
        recipient_id: outreachAction.rid,
        event: outreachAction.event,
        resend_email_id: outreachAction.emailId,
      });
      if (outreachAction.suppressTo) {
        await odb
          .from("outreach_recipients")
          .update({ status: outreachAction.suppressTo, updated_at: new Date().toISOString() })
          .eq("id", outreachAction.rid);
      }
      // Demo cadence: the same rid drives stage transitions (a click EARNS the
      // daily trial; complaint/bounce/unsub retire; claimed → converted arrives
      // via /api/claim, not here). Legacy drip rows have track NULL and skip this.
      const { data: demoRec } = await odb
        .from("outreach_recipients")
        .select("stage, track")
        .eq("id", outreachAction.rid)
        .maybeSingle();
      if (demoRec?.track && demoRec.stage) {
        const evt =
          outreachAction.event === "clicked" ||
          outreachAction.event === "bounced" ||
          outreachAction.event === "complained" ||
          outreachAction.event === "unsubscribed"
            ? outreachAction.event
            : null;
        const change = evt ? onDemoEvent(demoRec.stage as DemoStage, evt, new Date()) : null;
        if (change) {
          await odb
            .from("outreach_recipients")
            .update({
              stage: change.stage,
              next_send_at: change.next_send_at,
              updated_at: new Date().toISOString(),
            })
            .eq("id", outreachAction.rid);
        }
      }
    } catch (err) {
      console.error(
        `[resend-webhook] outreach tracking failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return NextResponse.json(
      { ok: true, kind: "outreach", event: outreachAction.event },
      { status: 200 },
    );
  }

  // -- Blast (Task 1 -- subject/CTA split-test) + Deliverability diagnostic
  // panel: did-tagged deliverable sends -------------------------------------
  // A `did`-tagged event (app/api/deliverables/[id]/blast/route.ts, tags set
  // by lib/email/blast-tags.ts) resolves the sending tenant via
  // deliverables.user_id (so the deliverability-status aggregator's
  // bounce/complaint rate can scope to that tenant -- docs/superpowers/specs/
  // 2026-07-08-deliverability-diagnostic-panel-design.md) and logs the
  // `variant` cohort tag (so the split-test results route, Task 12, can
  // group by it). No suppression/status ledger here -- blast recipients are
  // one-shot sends, not a drip.
  const blastAction = extractBlastAction(event as unknown as BlastWebhookPayload);
  if (blastAction) {
    try {
      const bdb = createServiceRoleClient();
      const { data: deliverable } = await bdb
        .from("deliverables")
        .select("user_id")
        .eq("id", blastAction.did)
        .maybeSingle();
      if (deliverable?.user_id) {
        await bdb.from("email_events").upsert(
          {
            resend_email_id: blastAction.emailId,
            did: blastAction.did,
            user_id: deliverable.user_id,
            event: blastAction.event,
            variant: blastAction.variant ?? null,
            // Per-recipient engagement linkage (cid tag) — blast-stagger's corpus.
            contact_id: blastAction.contactId ?? null,
          },
          { onConflict: "resend_email_id,event", ignoreDuplicates: true },
        );
      } else {
        console.error(`[resend-webhook] blast event for unknown deliverable ${blastAction.did}`);
      }
    } catch (err) {
      console.error(
        `[resend-webhook] blast tracking failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return NextResponse.json(
      { ok: true, kind: "blast", event: blastAction.event },
      { status: 200 },
    );
  }

  // ── Scheduled-broadcast engagement → email_events (hub mission-control) ────
  // Broadcast sends carry no did tag; resolve broadcast_id → email_sends →
  // email_schedules.deliverable_id so scheduled campaigns accrue the same
  // stored, deduped engagement rows manual blasts already get (the campaigns
  // dashboard reads both identically). NO early return: like the ma-engagement
  // branch above, a non-matching or unresolvable event falls through unchanged
  // (e.g. the campaign-click alert already handled clicks; this branch is the
  // general per-event ledger and they key off the same broadcast_id).
  const broadcastEvent = extractBroadcastEvent(event as unknown as BlastWebhookPayload);
  if (broadcastEvent) {
    try {
      const sdb = createServiceRoleClient();
      const { data: sendRow } = await sdb
        .from("email_sends")
        .select("user_id, schedule_id")
        .eq("broadcast_id", broadcastEvent.broadcastId)
        .maybeSingle();
      if (sendRow?.user_id && sendRow.schedule_id != null) {
        const { data: sch } = await sdb
          .from("email_schedules")
          .select("deliverable_id")
          .eq("id", sendRow.schedule_id)
          .maybeSingle();
        if (sch?.deliverable_id) {
          await sdb.from("email_events").upsert(
            {
              resend_email_id: broadcastEvent.emailId,
              did: sch.deliverable_id,
              user_id: sendRow.user_id,
              event: broadcastEvent.event,
            },
            { onConflict: "resend_email_id,event", ignoreDuplicates: true },
          );
        }
      }
    } catch (err) {
      console.error(
        `[resend-webhook] broadcast engagement failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const db = createServiceRoleClient();
  const resend = getMarketingResend();
  const origin = siteOrigin(request);

  const deps: InboundDeps = {
    replyDomain: replyDomain(),
    now: new Date(),
    log: (line) => console.log(line),

    async fetchBody(emailId) {
      const { data, error } = await resend.emails.receiving.get(emailId);
      if (error || !data)
        throw new Error(`receiving.get ${emailId}: ${error?.message ?? "no data"}`);
      return {
        from: data.from ?? "",
        subject: data.subject ?? "",
        // Prefer plain text; fall back to a crude HTML strip so a text-less reply
        // (some clients send HTML only) still yields a question for the model.
        text:
          data.text ??
          (data.html
            ? data.html
                .replace(/<[^>]+>/g, " ")
                .replace(/\s+/g, " ")
                .trim()
            : ""),
        headers: (data.headers as Record<string, string | undefined>) ?? {},
      };
    },

    async lookupSend(token) {
      const { data: send, error } = await db
        .from("email_sends")
        .select("user_id, schedule_id")
        .eq("reply_token", token)
        .maybeSingle();
      if (error) throw new Error(`lookup email_sends: ${error.message}`);
      if (!send) return null;
      // Resolve the agent's branded sender the SAME way the cron does (Unit D
      // verified-gating), so the auto-reply goes out as the agent, not platform.
      const { data: cfg } = await db
        .from("email_sender_config")
        .select("domain, resend_domain_id, from_name, from_email, reply_to, domain_verified")
        .eq("user_id", send.user_id)
        .maybeSingle();
      const sender = resolveSender(cfg ?? null, PLATFORM);
      return {
        userId: send.user_id as string,
        scheduleId: (send.schedule_id as number | null) ?? null,
        fromName: sender.fromName,
        fromEmail: sender.fromEmail,
      };
    },

    async lookupContact(userId, email) {
      const { data, error } = await db
        .from("email_contacts")
        .select("name, tags")
        .eq("user_id", userId)
        .eq("email", email)
        .maybeSingle();
      if (error) throw new Error(`lookup email_contacts: ${error.message}`);
      if (!data) return null;
      return { name: (data.name as string | null) ?? null, tags: (data.tags as string[]) ?? [] };
    },

    async countSenderRecent(userId, email, sinceIso) {
      const { count } = await db
        .from("buyer_intent_events")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("contact_email", email)
        .eq("answer_sent", true)
        .gte("created_at", sinceIso);
      return count ?? 0;
    },

    async countThread(token, email) {
      const { count } = await db
        .from("buyer_intent_events")
        .select("id", { count: "exact", head: true })
        .eq("reply_token", token)
        .eq("contact_email", email)
        .eq("answer_sent", true);
      return count ?? 0;
    },

    async countAgentDay(userId, sinceIso) {
      const { count } = await db
        .from("buyer_intent_events")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("answer_sent", true)
        .gte("created_at", sinceIso);
      return count ?? 0;
    },

    async generateAnswer(message) {
      return generateGroundedAnswer({ message, reportId: "master", origin });
    },

    async sendAutoReply(args) {
      const res = await resend.emails.send({
        from: `${args.fromName} <${args.fromEmail}>`,
        to: args.to,
        replyTo: args.replyTo,
        subject: args.subject || "Re: your question",
        text: args.text,
      });
      if (res.error) throw new Error(`auto-reply send: ${res.error.message}`);
    },

    async recordEvent(row) {
      const { data, error } = await db
        .from("buyer_intent_events")
        .insert({
          user_id: row.userId,
          reply_token: row.replyToken,
          schedule_id: row.scheduleId,
          contact_email: row.contactEmail,
          contact_name: row.contactName,
          contact_tags: row.contactTags,
          parsed_zip: row.intent.zip,
          parsed_place: row.intent.place,
          parsed_topic: row.intent.topic,
          raw_reply: row.rawReply,
          answer_sent: row.answerSent,
        })
        .select("id")
        .single();
      if (error) {
        console.error(`[resend-webhook] recordEvent failed: ${error.message}`);
        return null;
      }
      return (data?.id as number) ?? null;
    },

    async sendAgentAlert(args) {
      // The alert goes to the agent's REAL inbox (auth.users.email), never the
      // newsletter sender_address.
      const { data: userRes } = await db.auth.admin.getUserById(args.userId);
      const agentEmail = userRes?.user?.email;
      if (!agentEmail) {
        console.error(`[resend-webhook] no auth email for agent ${args.userId}; alert skipped.`);
        return;
      }
      const content = buildAlertContent({
        contactEmail: args.contactEmail,
        contactName: args.contactName,
        intent: args.intent,
        rawReply: args.rawReply,
        answerText: args.answerText,
        knownContact: args.knownContact,
        blockedReason: args.blockedReason,
        alertUrl: args.eventId ? `${origin}/alerts/${args.eventId}` : null,
      });
      const res = await resend.emails.send({
        from: `SWFL Data Gulf Alerts <${PLATFORM.fromEmail}>`,
        to: agentEmail,
        subject: content.subject,
        text: content.text,
      });
      if (res.error) {
        console.error(`[resend-webhook] agent alert send failed: ${res.error.message}`);
      }
    },
  };

  try {
    const outcome = await processInboundReply(event, deps);
    return NextResponse.json({ ok: true, outcome });
  } catch (err) {
    // Never 500 a webhook on a per-reply failure (Resend would retry the same
    // event into the same error). Log + 200 so the event is acked; the alert/
    // event row is the durable record of what we did.
    console.error(
      `[resend-webhook] processing error: ${err instanceof Error ? err.message : String(err)}`,
    );
    return NextResponse.json({ ok: false, error: "processing_error" }, { status: 200 });
  }
}
