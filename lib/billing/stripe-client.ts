// lib/billing/stripe-client.ts
/**
 * ONE Stripe client. Server-only. Hosted Checkout + portal means no
 * publishable key and no Stripe.js anywhere in the app.
 * No apiVersion pin: the SDK's bundled version is the one its types match.
 */
import Stripe from "stripe";

let client: Stripe | null = null;

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY unset");
  client ??= new Stripe(key);
  return client;
}

/**
 * True only when Stripe itself says the requested object genuinely doesn't
 * exist (`code: "resource_missing"` — https://docs.stripe.com/error-codes).
 * Everything else — network blips, rate limits, Stripe 5xx — is transient
 * and must NOT be treated as "safe to ignore": the caller needs to know the
 * difference so it can ask Stripe to retry instead of silently acking.
 */
export function isResourceMissing(err: unknown): boolean {
  return err instanceof Stripe.errors.StripeInvalidRequestError && err.code === "resource_missing";
}
