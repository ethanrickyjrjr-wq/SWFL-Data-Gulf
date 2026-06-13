/**
 * Reply-token addressing for the Buyer-Intent Reply Sensor.
 *
 * Sends go out as Resend Broadcasts to a Segment, which cannot carry a
 * per-recipient token — so the token encodes AGENT + SEND (one `email_sends`
 * row), NOT the client. The client is identified on inbound by matching the
 * reply's `from` against `email_contacts`.
 *
 * Address shape: `r-{token}@{REPLY_DOMAIN}` where `{token}` is the FULL local
 * part — NOT plus-addressing. `+`-tag preservation through MTAs is undocumented;
 * the local part is guaranteed, so the token rides there.
 *
 * Pure module: no I/O beyond `crypto.randomBytes`. Easy to unit-test the
 * round-trip (generate → address → parse).
 */
import { randomBytes } from "node:crypto";

/** Dedicated receiving subdomain so inbound can't disturb existing @swfldatagulf.com mail. */
export const DEFAULT_REPLY_DOMAIN = "reply.swfldatagulf.com";

/** The receiving domain, overridable per-env. Trimmed; falls back to the default. */
export function replyDomain(): string {
  return process.env.REPLY_DOMAIN?.trim() || DEFAULT_REPLY_DOMAIN;
}

/**
 * A short opaque token: 8 random bytes → 16 lowercase hex chars. 64 bits of
 * entropy makes a collision astronomically unlikely, and hex is always a legal
 * email local-part character set (no quoting, no MTA surprises).
 */
export function generateReplyToken(): string {
  return randomBytes(8).toString("hex");
}

/** Build the monitored reply-to address for a token. */
export function buildReplyAddress(token: string, domain = replyDomain()): string {
  return `r-${token}@${domain}`;
}

// Pull a bare address out of a `Display Name <addr@dom>` or plain `addr@dom`.
function extractEmail(raw: string): string | null {
  const angled = /<([^>]+)>/.exec(raw);
  const addr = (angled ? angled[1] : raw).trim();
  return addr.includes("@") ? addr : null;
}

const TOKEN_RE = /^r-([a-z0-9]+)@(.+)$/i;

/**
 * Parse a token out of an `r-{token}@dom` address. Returns the lowercased token
 * or `null` when the address is not one of ours. Accepts a wrapping display name.
 */
export function parseReplyAddress(raw: string): string | null {
  const addr = extractEmail(raw);
  if (!addr) return null;
  const m = TOKEN_RE.exec(addr);
  return m ? m[1].toLowerCase() : null;
}

/**
 * From an inbound `to[]` (or single string), pick the FIRST entry addressed to
 * our reply domain and parse its token. Resend's webhook `to` is an array; a
 * forwarded/CC'd reply may carry several addresses, only one of which is ours.
 * Returns `null` when no entry belongs to the reply domain.
 */
export function pickReplyEntry(
  to: string[] | string | null | undefined,
  domain = replyDomain(),
): { address: string; token: string } | null {
  const list = Array.isArray(to) ? to : to ? [to] : [];
  const suffix = `@${domain.toLowerCase()}`;
  for (const raw of list) {
    if (typeof raw !== "string") continue;
    const addr = extractEmail(raw);
    if (!addr || !addr.toLowerCase().endsWith(suffix)) continue;
    const token = parseReplyAddress(addr);
    if (token) return { address: addr, token };
  }
  return null;
}
