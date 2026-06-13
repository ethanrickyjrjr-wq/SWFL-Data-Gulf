/**
 * Svix-style webhook signature verification — Resend signs inbound webhooks with
 * Svix, whose scheme is a documented HMAC-SHA256 over `${id}.${timestamp}.${body}`
 * keyed by the base64 secret behind the `whsec_` prefix. We verify it inline with
 * `node:crypto` rather than pull in the `svix` SDK (the lockfile gate makes every
 * new dependency expensive, and this is ~30 lines).
 *
 * Pure + synchronous: the route reads the raw body + the three `svix-*` headers
 * and hands them here. Returns a boolean — never throws on a bad signature.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** Default replay window: reject signatures whose timestamp is older/newer than this. */
const DEFAULT_TOLERANCE_MS = 5 * 60 * 1000;

function constantTimeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export interface SvixHeaders {
  id?: string | null;
  timestamp?: string | null;
  signature?: string | null;
}

/**
 * Verify a Svix webhook signature.
 *
 * @param secret   the signing secret, `whsec_<base64>` (or a bare base64 secret).
 * @param payload  the RAW request body string (must NOT be re-serialized JSON).
 * @param headers  the `svix-id`, `svix-timestamp`, `svix-signature` header values.
 * @param now      injectable clock for tests (defaults to Date.now()).
 */
export function verifySvixSignature(
  secret: string,
  payload: string,
  headers: SvixHeaders,
  now: number = Date.now(),
  toleranceMs: number = DEFAULT_TOLERANCE_MS,
): boolean {
  const id = headers.id?.trim();
  const timestamp = headers.timestamp?.trim();
  const signature = headers.signature?.trim();
  if (!secret || !id || !timestamp || !signature) return false;

  // Replay guard: the timestamp (unix seconds) must be within tolerance.
  const tsSec = Number(timestamp);
  if (!Number.isFinite(tsSec)) return false;
  if (Math.abs(now - tsSec * 1000) > toleranceMs) return false;

  // The secret is base64 behind the `whsec_` prefix.
  const rawSecret = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  let key: Buffer;
  try {
    key = Buffer.from(rawSecret, "base64");
  } catch {
    return false;
  }

  const signedContent = `${id}.${timestamp}.${payload}`;
  const expected = createHmac("sha256", key).update(signedContent).digest("base64");

  // The header is a space-delimited list of `v1,<sig>` entries; any match passes.
  for (const part of signature.split(" ")) {
    const comma = part.indexOf(",");
    const sig = comma === -1 ? part : part.slice(comma + 1);
    if (sig && constantTimeEquals(sig, expected)) return true;
  }
  return false;
}
