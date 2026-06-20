/**
 * POST /api/email/contacts/phone
 *
 * Receives contacts picked on a phone via the Contact Picker API on the
 * token-gated mobile page (/m/contacts/[token]). The phone is NOT in the user's
 * Supabase session, so authorization comes from the signed import token (issued
 * on the authenticated desktop page) — verified here, claimed SINGLE-USE, then
 * the upsert runs under the service-role client with `user_id` taken from the
 * token's verified claim.
 *
 * Hardening: per-IP rate limit (this route isn't in the middleware prefix list),
 * a pre-parse body-size cap, and a single-use claim so a captured token can't be
 * replayed within its TTL.
 *
 * INPUT: JSON `{ token: string, contacts: { email: string, name?: string }[] }`
 * RESPONSE: 200 { imported, skipped, skippedPersonal } | 400 | 401 | 409 | 413 | 429
 */
import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { verifyContactImportToken } from "@/lib/email/contact-import-token";
import { claimOnce } from "@/lib/email/idempotency";
import { partitionContacts } from "@/lib/email/work-email-filter";
import { upsertContacts } from "@/lib/email/upsert-contacts";
import { syncUserAudiences, makeSupabaseAudienceStore } from "@/lib/email/audience-sync";
import { getMarketingResend } from "@/lib/email/marketing-client";
import { checkRateLimit, clientIpFromHeaders, rateLimitHeaders } from "@/lib/rate-limit";
import type { ContactRow } from "@/lib/email/parse-contacts-csv";

export const runtime = "nodejs";

const MAX_PICKED = 10_000;
const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5 MB — mirrors app/api/contacts/import

export async function POST(req: NextRequest) {
  // Per-IP rate limit — public/token-only endpoint, not covered by the middleware
  // RATE_LIMITED_PREFIXES, so guard inline (house pattern: app/api/converse).
  const rl = checkRateLimit(clientIpFromHeaders(req.headers));
  if (rl.limited) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  // Body-size guard BEFORE parsing — never pull a multi-MB JSON into memory.
  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const { token, contacts } = body as { token?: unknown; contacts?: unknown };
  if (typeof token !== "string") {
    return NextResponse.json({ error: "missing token" }, { status: 400 });
  }

  const verified = verifyContactImportToken(token);
  if (!verified.ok) {
    return NextResponse.json({ error: `token ${verified.reason}` }, { status: 401 });
  }

  if (!Array.isArray(contacts)) {
    return NextResponse.json({ error: "contacts must be an array" }, { status: 400 });
  }

  // Map the picker payload → ContactRow[], tagged "phone" for provenance.
  const rows: ContactRow[] = [];
  for (const c of contacts.slice(0, MAX_PICKED)) {
    if (!c || typeof c !== "object") continue;
    const email = typeof (c as { email?: unknown }).email === "string" ? (c as { email: string }).email : "";
    if (!email) continue;
    const name = typeof (c as { name?: unknown }).name === "string" ? (c as { name: string }).name : null;
    rows.push({ email, name, tags: ["phone"] });
  }

  const { kept, skippedPersonal } = partitionContacts(rows, { workOnly: verified.workOnly });

  // Service-role: the phone has no session, so RLS auth.uid() is unavailable.
  // The token IS the authorization — user_id comes from its verified claim.
  const supabase = createServiceRoleClient();

  // SINGLE-USE: claim the token's nid before writing. A replay (captured token,
  // leaked URL) loses the atomic claim and is rejected. Reuses the email_send_ledger
  // UNIQUE(idempotency_key) seam — exactly the proposal-nonce single-use pattern.
  // (If the ledger migration isn't applied, claimOnce degrades to a win → falls
  // back to TTL-only behavior; never worse than before.)
  const won = await claimOnce(supabase, `contact-import:${verified.nid}`, {
    userId: verified.uid,
    kind: "contact-import",
  });
  if (!won) {
    return NextResponse.json({ error: "token_already_used" }, { status: 409 });
  }

  const result = await upsertContacts(supabase, verified.uid, kept);

  // Best-effort: materialize the "phone" tag into a pickable Resend audience now,
  // since the phone can't reach the session-gated /sync route. Never fatal — the
  // contacts are already saved; a sync failure just delays the audience appearing.
  const imported = result.inserted + result.updated;
  if (imported > 0) {
    try {
      await syncUserAudiences(
        getMarketingResend(),
        makeSupabaseAudienceStore(supabase, verified.uid),
        verified.uid,
      );
    } catch {
      /* swallow — audience can be re-synced from desktop */
    }
  }

  return NextResponse.json(
    {
      imported,
      skipped: result.skipped,
      skippedPersonal,
    },
    { status: 200 },
  );
}
