/**
 * Signed, single-use proposal nonce for the AI email-schedule command CONFIRM step.
 *
 * The two-step command flow is PROPOSE (parse → validate → summary, no write) then
 * CONFIRM (write). Without a nonce a double-submitted confirm creates two schedules.
 * This module issues an HMAC-signed token at PROPOSE that CONFIRM must echo; the
 * route verifies it and then claims it single-use via the `email_send_ledger`
 * (DB-level UNIQUE — see lib/email/idempotency.ts). The welcome→delta activation
 * sequence and the inbound reply sensor reuse this same signed-single-use seam.
 *
 * SECURITY:
 *   - HMAC-SHA256 keyed on `SDG_COOKIE_SECRET` (already set in prod; also signs the
 *     sdg_cid cookie), domain-separated so the two uses can't be cross-replayed.
 *   - The signature is compared with `crypto.timingSafeEqual` on the raw digest
 *     Buffers — NEVER a string `===` (which is a timing oracle).
 *   - The payload binds the user id, project id, a hash of the exact proposal, and an
 *     issued-at (15-min TTL). A valid nonce can't be reused under a swapped proposal,
 *     a different user, or a different project, and it expires.
 *   - No secret configured → `issueProposalNonce` returns null and the route falls
 *     back to the legacy (non-nonce) confirm path. Env-gated, non-breaking.
 */

import crypto from "node:crypto";

const TTL_MS = 15 * 60 * 1000; // proposals are short-lived
const CLOCK_SKEW_MS = 60 * 1000; // tolerate a minute of clock skew on `iat`
const DOMAIN = "email-proposal:v1"; // HMAC-key domain separation

function getSecret(): string | null {
  const s = process.env.SDG_COOKIE_SECRET;
  return s && s.length > 0 ? s : null;
}

/** Stable JSON: keys sorted recursively, so the proposal hash is order-independent
 *  (the client may echo object keys in any order). */
function canonical(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}
function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o).sort()) out[k] = sortDeep(o[k]);
    return out;
  }
  return v;
}
function sha256hex(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}
function hmac(payloadB64: string, secret: string): Buffer {
  return crypto
    .createHmac("sha256", DOMAIN + secret)
    .update(payloadB64)
    .digest();
}

interface NoncePayload {
  v: 1;
  uid: string;
  pid: string;
  h: string; // sha256(canonical(proposal))
  iat: number; // epoch ms
  nid: string; // single-use id (the ledger key is `nonce:<nid>`)
}

/**
 * Issue a signed nonce for a proposal, or `null` when no signing secret is set (the
 * route then proceeds without nonce enforcement — legacy, env-gated).
 */
export function issueProposalNonce(args: {
  uid: string;
  pid: string;
  proposal: unknown;
  nowMs?: number;
}): string | null {
  const secret = getSecret();
  if (!secret) return null;
  const payload: NoncePayload = {
    v: 1,
    uid: args.uid,
    pid: args.pid,
    h: sha256hex(canonical(args.proposal)),
    iat: args.nowMs ?? Date.now(),
    nid: crypto.randomUUID(),
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = hmac(payloadB64, secret).toString("base64url");
  return `${payloadB64}.${sig}`;
}

export type NonceVerifyResult =
  | { ok: true; nid: string }
  | {
      ok: false;
      reason:
        | "missing_secret"
        | "malformed"
        | "bad_signature"
        | "expired"
        | "uid_mismatch"
        | "pid_mismatch"
        | "proposal_mismatch";
    };

/**
 * Verify a proposal nonce against the caller's identity + the proposal they're
 * confirming. Integrity (HMAC) is checked FIRST, with `crypto.timingSafeEqual` on
 * the raw digest Buffers, before any payload field is trusted.
 */
export function verifyProposalNonce(
  token: string,
  args: { uid: string; pid: string; proposal: unknown; nowMs?: number },
): NonceVerifyResult {
  const secret = getSecret();
  if (!secret) return { ok: false, reason: "missing_secret" };
  if (typeof token !== "string") return { ok: false, reason: "malformed" };

  const dot = token.lastIndexOf(".");
  if (dot <= 0 || dot >= token.length - 1) return { ok: false, reason: "malformed" };
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);

  // 1) Integrity FIRST — timing-safe digest comparison, never a string compare.
  const expected = hmac(payloadB64, secret);
  let provided: Buffer;
  try {
    provided = Buffer.from(sigB64, "base64url");
  } catch {
    return { ok: false, reason: "malformed" };
  }
  // Lengths must match before timingSafeEqual (it throws on a length mismatch). The
  // HMAC length is fixed (32 bytes), so rejecting a wrong-length sig leaks nothing
  // about the secret.
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return { ok: false, reason: "bad_signature" };
  }

  // 2) Only now is the payload trustworthy enough to parse + check the claims.
  let payload: NoncePayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as NoncePayload;
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (payload?.v !== 1 || typeof payload.nid !== "string" || typeof payload.iat !== "number") {
    return { ok: false, reason: "malformed" };
  }

  const now = args.nowMs ?? Date.now();
  if (now - payload.iat > TTL_MS || payload.iat - now > CLOCK_SKEW_MS) {
    return { ok: false, reason: "expired" };
  }
  if (payload.uid !== args.uid) return { ok: false, reason: "uid_mismatch" };
  if (payload.pid !== args.pid) return { ok: false, reason: "pid_mismatch" };
  if (payload.h !== sha256hex(canonical(args.proposal))) {
    return { ok: false, reason: "proposal_mismatch" };
  }
  return { ok: true, nid: payload.nid };
}
