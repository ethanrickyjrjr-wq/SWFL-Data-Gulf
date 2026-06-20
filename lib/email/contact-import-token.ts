/**
 * Signed, short-lived token for the cross-device QR contact import.
 *
 * The phone that scans the desktop QR is NOT logged into the user's Supabase
 * session, so the token itself must carry the authorization. We mirror the
 * `proposal-nonce.ts` seam: an HMAC-SHA256 token keyed on `SDG_COOKIE_SECRET`
 * (already set in prod), domain-separated, binding the user id + the "work only"
 * choice + a unique `nid` + an issued-at with a 5-minute TTL.
 *
 * SINGLE-USE: the payload carries a random `nid`; the consuming route (the phone
 * import) claims `contact-import:<nid>` via `claimOnce` against `email_send_ledger`
 * (the same single-use seam proposal-nonce uses), so a captured token — the QR is
 * photographed, or the `/m/contacts/<token>` URL leaks via history/referrer/proxy
 * logs — works AT MOST ONCE, and only within the 5-min TTL. Blast radius is
 * additive-only (you can add contacts, never read them). If the ledger migration
 * isn't applied (claimOnce 42P01-degrades to a win), single-use falls back to the
 * TTL-bounded behavior — never worse than before. Integrity is verified with
 * `crypto.timingSafeEqual` on the raw digests before any payload field is read.
 *
 * No signing secret configured → `issueContactImportToken` returns null and the
 * desktop QR section is hidden (env-gated, non-breaking).
 */
import crypto from "node:crypto";

const TTL_MS = 5 * 60 * 1000;
const CLOCK_SKEW_MS = 60 * 1000;
const DOMAIN = "contact-import:v1"; // HMAC-key domain separation

function getSecret(): string | null {
  const s = process.env.SDG_COOKIE_SECRET;
  return s && s.length > 0 ? s : null;
}

function hmac(payloadB64: string, secret: string): Buffer {
  return crypto.createHmac("sha256", DOMAIN + secret).update(payloadB64).digest();
}

interface TokenPayload {
  v: 1;
  uid: string;
  wo: 0 | 1; // work-only flag
  iat: number; // epoch ms
  nid: string; // single-use id (the ledger claim key is `contact-import:<nid>`)
}

/** Issue a token for the signed-in user, or null when no signing secret is set. */
export function issueContactImportToken(args: {
  uid: string;
  workOnly: boolean;
  nowMs?: number;
}): string | null {
  const secret = getSecret();
  if (!secret) return null;
  const payload: TokenPayload = {
    v: 1,
    uid: args.uid,
    wo: args.workOnly ? 1 : 0,
    iat: args.nowMs ?? Date.now(),
    nid: crypto.randomUUID(),
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = hmac(payloadB64, secret).toString("base64url");
  return `${payloadB64}.${sig}`;
}

export type TokenVerifyResult =
  | { ok: true; uid: string; workOnly: boolean; nid: string }
  | { ok: false; reason: "missing_secret" | "malformed" | "bad_signature" | "expired" };

/** Verify a token: integrity (timing-safe) first, then TTL, then extract claims. */
export function verifyContactImportToken(token: string, nowMs?: number): TokenVerifyResult {
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
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return { ok: false, reason: "bad_signature" };
  }

  // 2) Payload is now trustworthy enough to parse.
  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as TokenPayload;
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (
    payload?.v !== 1 ||
    typeof payload.uid !== "string" ||
    typeof payload.iat !== "number" ||
    typeof payload.nid !== "string"
  ) {
    return { ok: false, reason: "malformed" };
  }

  const now = nowMs ?? Date.now();
  if (now - payload.iat > TTL_MS || payload.iat - now > CLOCK_SKEW_MS) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, uid: payload.uid, workOnly: payload.wo === 1, nid: payload.nid };
}
