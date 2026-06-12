/**
 * /api/email/domain-verify — per-tenant sending-domain registration + verification.
 *
 * Unit D of the multi-tenant email build
 * (docs/superpowers/plans/2026-06-12-email-product-multitenant/plan.md).
 *
 * This route ONLY RECORDS state into `public.email_sender_config`. It never
 * decides whether a tenant's `from_email` is actually used to send — that
 * decision (the verified-gating rule, correctness flag #2) lives in
 * `lib/email/sender-config.ts#resolveSender` and is applied by Unit F (cron
 * worker). Here we just keep `domain_verified` honest: false until Resend
 * reports the domain verified, true once it does. `reply_to` is captured at
 * registration time — before verification — so the platform fallback can always
 * route replies to the tenant.
 *
 * ─── METHODS ────────────────────────────────────────────────────────────────
 * POST  { domain, from_name?, from_email?, reply_to? }
 *   → register (or re-fetch) the tenant's sending domain in Resend, persist the
 *     sender config, and return the DNS records the user must add.
 *   First-time: calls Resend `domains.create({ name: domain })`.
 *   Already-registered (row has resend_domain_id): refreshes via `domains.get`.
 *   Always upserts: domain, resend_domain_id, dns_records (JSONB), from_name,
 *   from_email, reply_to, domain_verified (mirrors current Resend status).
 *
 * POST  { action: "poll" }   (also: GET)
 *   → re-check verification: triggers Resend `domains.verify` (async re-check),
 *     reads the live status + records via `domains.get`, flips
 *     `domain_verified = true` when status is "verified", refreshes dns_records.
 *
 * GET   → same as the poll path (read-only re-check of the stored domain).
 *
 * RESPONSE: 200 { domain, resend_domain_id, status, domain_verified, dns_records }
 *           400 missing / invalid body or no domain registered yet (poll)
 *           401 unauthenticated
 *           502 Resend API error
 *           500 database error
 *
 * AUTH: cookie/RLS client only (copy pattern from app/api/projects/route.ts).
 *   RLS `auth.uid() = user_id` IS the authorization. Never use the service-role
 *   client here.
 *
 * VENDOR-FIRST (verified live against Resend Node SDK v6.12.3 + the live
 * Domains API docs, in-session 2026-06-12):
 *   - resend.domains.create(payload)  → CreateDomainResponse = { data, error }
 *       data: { id, name, status, created_at, region, records: DomainRecords[], ... }
 *   - resend.domains.get(id: string)  → GetDomainResponse = { data, error }
 *       data: { id, name, status, records: DomainRecords[], ... }
 *   - resend.domains.verify(id: string) → VerifyDomainsResponse = { data, error }
 *       data: { object: "domain", id }  ← NO records, NO status. It only TRIGGERS
 *       the async re-check, so we always read status/records back via .get().
 *   - DomainStatus enum: "pending" | "verified" | "failed" | "not_started"
 *       | "partially_verified" | "partially_failed".
 *   - Each DNS record: { record, name, value, type, ttl, status, priority? }.
 */

import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getMarketingResend } from "@/lib/email/marketing-client";

export const runtime = "nodejs";

/** Live Resend DomainStatus enum (SDK v6.12.3). "verified" is the only gate-open value. */
const VERIFIED_STATUS = "verified";

interface SenderConfigRow {
  resend_domain_id: string | null;
  domain: string | null;
  from_name: string | null;
  from_email: string | null;
  reply_to: string | null;
  domain_verified: boolean;
}

/** Shape of the JSON we hand back to the caller on success. */
function successPayload(args: {
  domain: string | null;
  resendDomainId: string | null;
  status: string;
  verified: boolean;
  dnsRecords: unknown;
}) {
  return NextResponse.json(
    {
      domain: args.domain,
      resend_domain_id: args.resendDomainId,
      status: args.status,
      domain_verified: args.verified,
      dns_records: args.dnsRecords,
    },
    { status: 200 },
  );
}

/** Read this user's single sender-config row (RLS scopes it to them). */
async function loadConfig(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<{ row: SenderConfigRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from("email_sender_config")
    .select("resend_domain_id, domain, from_name, from_email, reply_to, domain_verified")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return { row: null, error: error.message };
  return { row: (data as SenderConfigRow | null) ?? null, error: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — register/refresh (default) OR poll (action: "poll")
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid body: expected JSON object" }, { status: 400 });
  }

  const { action } = body as { action?: unknown };
  if (action === "poll") {
    return handlePoll(supabase, user.id);
  }

  // --- Register / refresh path ---
  const {
    domain: domainRaw,
    from_name: fromNameRaw,
    from_email: fromEmailRaw,
    reply_to: replyToRaw,
  } = body as {
    domain?: unknown;
    from_name?: unknown;
    from_email?: unknown;
    reply_to?: unknown;
  };

  const domain = typeof domainRaw === "string" ? domainRaw.trim().toLowerCase() : "";
  if (!domain) {
    return NextResponse.json(
      { error: "invalid body: 'domain' must be a non-empty string" },
      { status: 400 },
    );
  }

  const fromName = typeof fromNameRaw === "string" ? fromNameRaw.trim() || null : null;
  const fromEmail = typeof fromEmailRaw === "string" ? fromEmailRaw.trim() || null : null;
  const replyTo = typeof replyToRaw === "string" ? replyToRaw.trim() || null : null;

  // Existing row? If we already created a Resend domain, refresh it instead of
  // creating a duplicate (Resend would create a second domain for the same name).
  const { row: existing, error: loadErr } = await loadConfig(supabase, user.id);
  if (loadErr) {
    return NextResponse.json({ error: "database error", detail: loadErr }, { status: 500 });
  }

  const resend = getMarketingResend();

  let resendDomainId: string;
  let status: string;
  let records: unknown;

  if (existing?.resend_domain_id) {
    // Re-fetch the already-registered domain (idempotent register).
    const { data, error } = await resend.domains.get(existing.resend_domain_id);
    if (error || !data) {
      return NextResponse.json(
        { error: "resend get-domain failed", detail: error?.message ?? "no data" },
        { status: 502 },
      );
    }
    resendDomainId = data.id;
    status = data.status;
    records = data.records;
  } else {
    // First-time registration.
    const { data, error } = await resend.domains.create({ name: domain });
    if (error || !data) {
      return NextResponse.json(
        { error: "resend create-domain failed", detail: error?.message ?? "no data" },
        { status: 502 },
      );
    }
    resendDomainId = data.id;
    status = data.status;
    records = data.records;
  }

  const verified = status === VERIFIED_STATUS;

  // Persist. UNIQUE(user_id) → upsert onConflict user_id. RLS client = authz.
  const { error: upsertErr } = await supabase.from("email_sender_config").upsert(
    {
      user_id: user.id,
      domain,
      resend_domain_id: resendDomainId,
      from_name: fromName,
      from_email: fromEmail,
      reply_to: replyTo,
      domain_verified: verified,
      dns_records: records,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (upsertErr) {
    return NextResponse.json(
      { error: "database error on upsert", detail: upsertErr.message },
      { status: 500 },
    );
  }

  return successPayload({
    domain,
    resendDomainId,
    status,
    verified,
    dnsRecords: records,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// GET — re-check verification (read-only poll)
// ─────────────────────────────────────────────────────────────────────────────
export async function GET() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return handlePoll(supabase, user.id);
}

/**
 * Poll path: trigger Resend's async re-check, then read live status + records.
 *
 * `.verify()` returns only { object, id } — it does NOT carry status or records,
 * so the source of truth for the flip is always a fresh `.get()`. We flip
 * domain_verified to true on "verified" and refresh dns_records either way.
 */
async function handlePoll(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<NextResponse> {
  const { row, error: loadErr } = await loadConfig(supabase, userId);
  if (loadErr) {
    return NextResponse.json({ error: "database error", detail: loadErr }, { status: 500 });
  }
  if (!row?.resend_domain_id) {
    return NextResponse.json(
      { error: "no domain registered: POST { domain } first" },
      { status: 400 },
    );
  }

  const resend = getMarketingResend();

  // Trigger the async re-check. A failure here is non-fatal to reading status —
  // .get() below still reports the current state — but surface it if .get() also
  // has nothing useful. We don't hard-fail solely on a verify trigger error.
  await resend.domains.verify(row.resend_domain_id).catch(() => undefined);

  const { data, error } = await resend.domains.get(row.resend_domain_id);
  if (error || !data) {
    return NextResponse.json(
      { error: "resend get-domain failed", detail: error?.message ?? "no data" },
      { status: 502 },
    );
  }

  const verified = data.status === VERIFIED_STATUS;

  // Refresh stored status fields. Only touch verification-related columns —
  // never clobber the user's from_name / from_email / reply_to on a poll.
  const { error: updateErr } = await supabase
    .from("email_sender_config")
    .update({
      domain_verified: verified,
      dns_records: data.records,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  if (updateErr) {
    return NextResponse.json(
      { error: "database error on update", detail: updateErr.message },
      { status: 500 },
    );
  }

  return successPayload({
    domain: row.domain,
    resendDomainId: row.resend_domain_id,
    status: data.status,
    verified,
    dnsRecords: data.records,
  });
}
