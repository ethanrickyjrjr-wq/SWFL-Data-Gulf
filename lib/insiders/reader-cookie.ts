// lib/insiders/reader-cookie.ts
//
// Signed reader cookie for the Insiders gated read (spec:
// docs/superpowers/specs/2026-07-26-insiders-issue001-gated-read-design.md).
// HMAC-SHA256 over the normalized email — forgeable only with the server
// secret. verifyReader fails CLOSED: missing secret, malformed value, or bad
// signature all read as "not a subscriber".
import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "ins_reader";

const b64url = (buf: Buffer): string => buf.toString("base64url");

function hmac(email: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(email, "utf8").digest();
}

export function signReader(email: string, secret: string): string {
  return `${b64url(Buffer.from(email, "utf8"))}.${b64url(hmac(email, secret))}`;
}

export function verifyReader(value: string | undefined, secret: string | undefined): boolean {
  if (!value || !secret) return false;
  const dot = value.indexOf(".");
  if (dot <= 0 || dot === value.length - 1) return false;
  let email: string;
  let sig: Buffer;
  try {
    email = Buffer.from(value.slice(0, dot), "base64url").toString("utf8");
    sig = Buffer.from(value.slice(dot + 1), "base64url");
  } catch {
    return false;
  }
  const expected = hmac(email, secret);
  return sig.length === expected.length && timingSafeEqual(sig, expected);
}

export function buildReaderSetCookie(email: string, secret: string): string {
  return `${COOKIE_NAME}=${signReader(email, secret)}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`;
}

export function readerCookieFromHeader(cookieHeader: string | null): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === COOKIE_NAME) {
      return part.slice(eq + 1).trim();
    }
  }
  return undefined;
}
