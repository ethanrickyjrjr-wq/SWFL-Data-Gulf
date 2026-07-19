// scripts/stripe/setup-report-product.mts
/**
 * Idempotent: creates the one-time Should I Sell spread product + price with
 * the lookup key from lib/billing/tiers.ts, in whatever mode STRIPE_SECRET_KEY
 * belongs to (run against test keys first). Re-runs find-by-lookup-key and skip.
 * Usage: bun scripts/stripe/setup-report-product.mts [--dry-run]
 */
import Stripe from "stripe";
import { SELLER_REPORT } from "../../lib/billing/tiers.ts";

const dryRun = process.argv.includes("--dry-run");
const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("STRIPE_SECRET_KEY unset (put the test key in .env.local).");
  process.exit(1);
}
const stripe = new Stripe(key);
const mode = key.startsWith("sk_live") ? "LIVE" : "test";
console.log(`Mode: ${mode}${dryRun ? " (dry-run)" : ""}`);

const existing = await stripe.prices.list({ lookup_keys: [SELLER_REPORT.lookupKey], limit: 1 });
if (existing.data[0]) {
  console.log(`= ${SELLER_REPORT.lookupKey} exists (${existing.data[0].id}), skipping`);
  process.exit(0);
}
if (dryRun) {
  console.log(`+ would create ${SELLER_REPORT.lookupKey} — $${SELLER_REPORT.priceUsd} one-time`);
  process.exit(0);
}

const product = await stripe.products.create({
  name: `SWFL Data Gulf — ${SELLER_REPORT.name}`,
  metadata: { kind: "seller_report" },
});
const price = await stripe.prices.create({
  product: product.id,
  currency: "usd",
  unit_amount: SELLER_REPORT.priceUsd * 100,
  lookup_key: SELLER_REPORT.lookupKey,
  transfer_lookup_key: true,
});
console.log(
  `+ created ${SELLER_REPORT.lookupKey} → ${price.id} ($${SELLER_REPORT.priceUsd} one-time)`,
);
console.log("Done.");
