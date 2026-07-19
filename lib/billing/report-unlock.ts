// lib/billing/report-unlock.ts
/**
 * HMAC-signed unlock cookie for the paid Should I Sell spread. No account,
 * no DB row — the Stripe Checkout session is the receipt; this cookie is the
 * key. Key material derives from STRIPE_SECRET_KEY so no new env var is
 * needed anywhere the checkout itself already works.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const UNLOCK_COOKIE = "sis_unlock";
export const UNLOCK_DAYS = 30;

function sig(exp: number): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY unset");
  return createHmac("sha256", key).update(`sis-unlock:${exp}`).digest("hex").slice(0, 32);
}

/** Token = <unix-exp>.<hmac>. Minted only after Stripe confirms payment. */
export function mintUnlock(nowMs: number): string {
  const exp = Math.floor(nowMs / 1000) + UNLOCK_DAYS * 86400;
  return `${exp}.${sig(exp)}`;
}

export function verifyUnlock(token: string | undefined, nowMs: number = Date.now()): boolean {
  if (!token) return false;
  const [expStr, mac = ""] = token.split(".");
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp * 1000 < nowMs) return false;
  try {
    return timingSafeEqual(Buffer.from(mac), Buffer.from(sig(exp)));
  } catch {
    return false;
  }
}
