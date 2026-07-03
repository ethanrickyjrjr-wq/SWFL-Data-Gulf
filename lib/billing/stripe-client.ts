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
