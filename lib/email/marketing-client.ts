import { Resend } from "resend";

/**
 * Server-only Resend client holding the **full_access** key — the only key that
 * can touch Segments (formerly Audiences), Contacts, and Broadcasts. The
 * send-only `RESEND_API_KEY` (sending_access) 401s on these endpoints.
 *
 * NEVER import this from a client component or the GHA digest cron. The cron
 * carries the sending-access key only; anything needing full_access (the
 * subscribe + broadcast routes) runs server-side in the Vercel app, which is
 * where this key lives.
 *
 * Env var: canonical `RESEND_AUDIENCES_KEY`, with a fallback to the bare
 * `full_access` name the key was first stored under (README Phase 2 note).
 * Read-canonical-then-legacy mirrors utils/supabase/service-role.ts.
 */
let _client: Resend | null = null;

export function getMarketingResend(): Resend {
  if (_client) return _client;
  const key = process.env.RESEND_AUDIENCES_KEY ?? process.env.full_access;
  if (!key) {
    throw new Error(
      "getMarketingResend: set RESEND_AUDIENCES_KEY (a full_access Resend key) — the bare `full_access` env var is also accepted",
    );
  }
  _client = new Resend(key);
  return _client;
}

/**
 * The Resend Segment id for the daily digest list. Created once via
 * `scripts/email/setup-digest-segment.mts`; the printed id is set as an env var
 * (Vercel + .env.local). Throws loudly if unset so a misconfigured deploy fails
 * fast instead of silently writing contacts to no list.
 */
export function getDigestSegmentId(): string {
  const id = process.env.RESEND_DIGEST_SEGMENT_ID;
  if (!id) {
    throw new Error(
      "getDigestSegmentId: set RESEND_DIGEST_SEGMENT_ID (run scripts/email/setup-digest-segment.mts once and copy the id)",
    );
  }
  return id;
}
