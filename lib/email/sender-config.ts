/**
 * Per-tenant sender resolution — the single source of truth for the
 * verified-gating rule (plan.md "Unit D" + correctness flag #2).
 *
 * A tenant's custom `from_email` is honored ONLY when their sending domain is
 * verified (`domain_verified = true`). Until then, sends go out under the
 * platform default sender, but ALWAYS carry the tenant's `reply_to` (captured
 * at registration time, before verification) so replies still reach them.
 *
 * Unit F (the cron worker) imports `resolveSender()` — it must NOT re-derive
 * this rule inline, or the gate drifts. The route in
 * `app/api/email/domain-verify/route.ts` only RECORDS state into
 * `email_sender_config`; this helper READS it back into a send decision.
 */

/** The verified-sender row shape (subset of `public.email_sender_config`). */
export interface SenderConfigRow {
  domain: string | null;
  resend_domain_id: string | null;
  from_name: string | null;
  from_email: string | null;
  reply_to: string | null;
  domain_verified: boolean;
}

/** Platform fallback identity used when a tenant is unverified or unconfigured. */
export interface PlatformSenderDefaults {
  fromName: string;
  fromEmail: string;
}

/** A fully resolved sender, ready to hand to the broadcast route as overrides. */
export interface ResolvedSender {
  fromName: string;
  fromEmail: string;
  /** Always the tenant's reply-to when present, even on the platform fallback. */
  replyTo: string | null;
  /** True when the tenant's own verified domain is being used to send. */
  usingTenantDomain: boolean;
}

/**
 * Resolve the `from` identity for a tenant send under the verified-gating rule.
 *
 * - Verified tenant with a `from_email` → send AS the tenant (their from_name /
 *   from_email), reply-to = their reply_to (falling back to their from_email).
 * - Unverified, missing config, or missing from_email → platform default
 *   sender, reply-to = the tenant's reply_to if we captured one (else null).
 *
 * Pure + synchronous so Unit F can unit-test the gate without a DB.
 */
export function resolveSender(
  config: SenderConfigRow | null | undefined,
  platform: PlatformSenderDefaults,
): ResolvedSender {
  const verified = config?.domain_verified === true;
  const tenantFromEmail = config?.from_email?.trim() || null;

  if (verified && tenantFromEmail) {
    return {
      fromName: config?.from_name?.trim() || platform.fromName,
      fromEmail: tenantFromEmail,
      replyTo: config?.reply_to?.trim() || tenantFromEmail,
      usingTenantDomain: true,
    };
  }

  return {
    fromName: platform.fromName,
    fromEmail: platform.fromEmail,
    replyTo: config?.reply_to?.trim() || null,
    usingTenantDomain: false,
  };
}
