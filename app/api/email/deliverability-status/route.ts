/**
 * /api/email/deliverability-status — read-only aggregator for the
 * deliverability diagnostic panel (app/settings/deliverability/).
 *
 * GET only. Registration/polling stays exactly where it is
 * (app/api/email/domain-verify/route.ts) — this route only reads: the
 * already-fresh email_sender_config row (SPF/DKIM, from Resend's dns_records),
 * a live DMARC TXT lookup (the one genuinely new live check — Resend doesn't
 * track DMARC at all), a bounded window of this tenant's email_events
 * (populated by the blast-send webhook branch, app/api/webhooks/resend/route.ts),
 * and the CAN-SPAM address presence off user_brand_profiles.
 *
 * Full design + the corrected architecture note on why bounce/complaint isn't
 * a pure read: docs/superpowers/specs/2026-07-08-deliverability-diagnostic-panel-design.md.
 *
 * AUTH: cookie/RLS client only (same pattern as domain-verify/route.ts).
 *   RLS `auth.uid() = user_id` IS the authorization on both email_sender_config
 *   and the new email_events_owner_select policy.
 */

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { checkDmarc, type DmarcPolicy } from "@/lib/email/deliverability/dmarc";
import {
  classifyBounceRate,
  classifyDmarcPolicy,
  classifySpamRate,
  type StatusColor,
} from "@/lib/email/deliverability/thresholds";
import { tallyRateEvents } from "@/lib/email/deliverability/window-tally";

export const runtime = "nodejs";

const WINDOW_ROWS = 1000;
const WINDOW_DAYS = 30;

type RateStatus = { known: false } | { known: true; rate: number; color: StatusColor };

type DmarcStatus =
  | { status: "not_set"; color: "red" }
  | { status: "error" }
  | { status: "set"; policy: DmarcPolicy | null; color: StatusColor };

export interface DeliverabilityStatusResponse {
  domain: string | null;
  domainRegistered: boolean;
  domainVerified: boolean;
  dnsRecords: unknown;
  dmarc: DmarcStatus | null;
  bounce: RateStatus;
  spam: RateStatus;
  windowDelivered: number;
  oneClickUnsubscribe: true;
  canSpamAddressPresent: boolean;
}

export async function GET() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: sender, error: senderErr } = await supabase
    .from("email_sender_config")
    .select("domain, domain_verified, dns_records")
    .eq("user_id", user.id)
    .maybeSingle();
  if (senderErr) {
    return NextResponse.json(
      { error: "database error", detail: senderErr.message },
      { status: 500 },
    );
  }

  // No domain registered yet: one CTA, not five red lines (per spec's error-handling section).
  if (!sender?.domain) {
    return NextResponse.json(
      {
        domain: null,
        domainRegistered: false,
        domainVerified: false,
        dnsRecords: null,
        dmarc: null,
        bounce: { known: false },
        spam: { known: false },
        windowDelivered: 0,
        oneClickUnsubscribe: true,
        canSpamAddressPresent: false,
      } satisfies DeliverabilityStatusResponse,
      { status: 200 },
    );
  }

  const [dmarcResult, events, brandRow] = await Promise.all([
    checkDmarc(sender.domain),
    loadWindowEvents(supabase, user.id),
    supabase
      .from("user_brand_profiles")
      .select("business_address")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const dmarc: DmarcStatus =
    dmarcResult.status === "not_set"
      ? { status: "not_set", color: "red" }
      : dmarcResult.status === "error"
        ? { status: "error" }
        : {
            status: "set",
            policy: dmarcResult.policy,
            color: classifyDmarcPolicy(dmarcResult.policy),
          };

  // Bounce rate's denominator is ATTEMPTED sends (delivered + bounced) — a
  // bounced message never became "delivered", so dividing by delivered alone
  // would overstate the rate. Spam rate's denominator is delivered only — a
  // complaint can only happen on mail that reached the inbox (Postmaster
  // Tools' own definition).
  const attempted = events.delivered + events.bounced;
  const bounce: RateStatus =
    attempted === 0
      ? { known: false }
      : (() => {
          const rate = events.bounced / attempted;
          return { known: true, rate, color: classifyBounceRate(rate) };
        })();
  const spam: RateStatus =
    events.delivered === 0
      ? { known: false }
      : (() => {
          const rate = events.complained / events.delivered;
          return { known: true, rate, color: classifySpamRate(rate) };
        })();

  return NextResponse.json(
    {
      domain: sender.domain,
      domainRegistered: true,
      domainVerified: sender.domain_verified,
      dnsRecords: sender.dns_records,
      dmarc,
      bounce,
      spam,
      windowDelivered: events.delivered,
      oneClickUnsubscribe: true,
      canSpamAddressPresent: Boolean(brandRow.data?.business_address?.trim()),
    } satisfies DeliverabilityStatusResponse,
    { status: 200 },
  );
}

/**
 * Bounded window: last WINDOW_ROWS events or WINDOW_DAYS, whichever is
 * smaller. No full-table scan.
 *
 * Filtered to delivered/bounced/complained ONLY. opened/clicked also land in
 * email_events (the webhook's blast branch logs the full mapResendOutbound
 * vocabulary) but arrive AFTER delivery and, for an engaged list, outnumber
 * deliveries — if they consumed window slots, the counted `delivered`
 * denominator would shrink and OVERSTATE both rates, exactly for the bulk
 * senders (5,000+/day) these thresholds target. tallyRateEvents ignores
 * anything else too, as a second guard if this filter is ever loosened.
 */
async function loadWindowEvents(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<{ delivered: number; bounced: number; complained: number }> {
  const sinceIso = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("email_events")
    .select("event")
    .eq("user_id", userId)
    .in("event", ["delivered", "bounced", "complained"])
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(WINDOW_ROWS);
  if (error || !data) return { delivered: 0, bounced: 0, complained: 0 };
  return tallyRateEvents(data);
}
