/**
 * Self-describing signed token for per-link click routing.
 *
 * A wrapped email link is `${origin}/api/r/<token>`. The token carries its own
 * destination + context (which recipient, campaign, step, button), HMAC-signed, so
 * the redirect route can 302 the recipient AND know what to log WITHOUT a database
 * read on the critical path (design decision 3). The signature is the authorization:
 * the redirect target is always something WE signed, so a forged token can never turn
 * the route into an open redirect.
 *
 * Mirrors the proven `contact-import-token.ts` / `proposal-nonce.ts` seam:
 *   - HMAC-SHA256 keyed on `SDG_COOKIE_SECRET` (already set in prod — no new secret),
 *     domain-separated so it can't be cross-replayed against the other token uses.
 *   - Integrity verified with `crypto.timingSafeEqual` on the raw digest Buffers,
 *     BEFORE any payload field is parsed or trusted (never a string `===`).
 *   - No secret configured → `signLinkToken` returns null and wrapping becomes a
 *     no-op (env-gated, non-breaking): the raw link ships untracked rather than broken.
 *
 * NO TTL. Unlike the QR/nonce tokens, a link lives inside an email a recipient may
 * open weeks later. An old-but-valid link must still route to its destination — a
 * stale link should never dead-end a recipient (design decision, Error handling). The
 * token authorizes nothing sensitive (the destination is a public URL), so expiry
 * would only degrade the experience, never add security.
 */
import crypto from "node:crypto";

const DOMAIN = "tracked-link:v1"; // HMAC-key domain separation

/** Which recipient / campaign / step / button a wrapped link belongs to. */
export interface LinkContext {
  /** outreach_recipients.id — the `rid` the send path already tags. */
  rid: string;
  /** campaign_id, or null when the send path doesn't carry one. */
  cid: string | null;
  /** Drip step at mint time, or null. */
  step: number | null;
  /** Which link in the email — 'cta' for the drip's single button today. */
  bk: string;
  /** Channel — 'email' for now (the ledger reserves room for others). */
  ch: "email";
}

interface TokenPayload {
  v: 1;
  d: string; // destination URL
  c: LinkContext;
  iat: number; // epoch ms — recorded, NOT enforced (no TTL)
}

function getSecret(): string | null {
  const s = process.env.SDG_COOKIE_SECRET;
  return s && s.length > 0 ? s : null;
}

function hmac(payloadB64: string, secret: string): Buffer {
  return crypto
    .createHmac("sha256", DOMAIN + secret)
    .update(payloadB64)
    .digest();
}

/** Sign a destination + context into a `<payload>.<sig>` token, or null when no secret is set. */
export function signLinkToken(dest: string, ctx: LinkContext, nowMs?: number): string | null {
  const secret = getSecret();
  if (!secret) return null;
  const payload: TokenPayload = { v: 1, d: dest, c: ctx, iat: nowMs ?? Date.now() };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = hmac(payloadB64, secret).toString("base64url");
  return `${payloadB64}.${sig}`;
}

export type LinkVerifyResult =
  | { ok: true; dest: string; ctx: LinkContext }
  | { ok: false; reason: "missing_secret" | "malformed" | "bad_signature" };

/** Verify a token: integrity (timing-safe) FIRST, then extract the destination + context. */
export function verifyLinkToken(token: string): LinkVerifyResult {
  const secret = getSecret();
  if (!secret) return { ok: false, reason: "missing_secret" };
  if (typeof token !== "string") return { ok: false, reason: "malformed" };

  const dot = token.lastIndexOf(".");
  if (dot <= 0 || dot >= token.length - 1) return { ok: false, reason: "malformed" };
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);
  // A stray extra dot means it isn't one of our two-segment tokens.
  if (payloadB64.includes(".")) return { ok: false, reason: "malformed" };

  // 1) Integrity FIRST — timing-safe digest comparison, never a string compare.
  const expected = hmac(payloadB64, secret);
  let provided: Buffer;
  try {
    provided = Buffer.from(sigB64, "base64url");
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return { ok: false, reason: "bad_signature" };
  }

  // 2) The payload is now trustworthy enough to parse + shape-check.
  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as TokenPayload;
  } catch {
    return { ok: false, reason: "malformed" };
  }
  const c = payload?.c;
  if (
    payload?.v !== 1 ||
    typeof payload.d !== "string" ||
    !c ||
    typeof c.rid !== "string" ||
    typeof c.bk !== "string" ||
    c.ch !== "email"
  ) {
    return { ok: false, reason: "malformed" };
  }
  return { ok: true, dest: payload.d, ctx: c };
}
