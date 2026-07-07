// scripts/stripe/reprice-tier.mts
/**
 * Repricing companion to setup-products.mts, which only CREATES prices for
 * lookup keys that don't exist yet — pointed at a tier whose price changed,
 * it finds the lookup key already live (on the OLD amount) and silently
 * skips, never comparing amounts. This script does the other half: for a
 * given tier slug, diff lib/billing/tiers.ts against the live Stripe price
 * on each lookup key, and if they differ, create a new Price with the SAME
 * lookup_key + transfer_lookup_key: true. Verified live via
 * docs.stripe.com/products-prices/manage-prices (crawl4ai 07/07/2026):
 * Stripe atomically moves the lookup key off the old price onto the new
 * one. The old price is untouched and keeps billing any subscriber still
 * attached to it by price ID — this changes what NEW checkouts get, never
 * retroactively changes what an existing subscriber is charged.
 * Usage: bun scripts/stripe/reprice-tier.mts <starter|growth|pro> [--dry-run]
 */
import Stripe from "stripe";
import { BILLING_TIERS } from "../../lib/billing/tiers.ts";

const [, , slugArg] = process.argv;
const dryRun = process.argv.includes("--dry-run");
const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("STRIPE_SECRET_KEY unset (put it in .env.local).");
  process.exit(1);
}
const tier = BILLING_TIERS.find((t) => t.slug === slugArg);
if (!tier) {
  console.error(
    `usage: bun scripts/stripe/reprice-tier.mts <${BILLING_TIERS.map((t) => t.slug).join("|")}> [--dry-run]`,
  );
  process.exit(1);
}
const stripe = new Stripe(key);
const mode = key.startsWith("sk_live") ? "LIVE" : "test";
console.log(`Mode: ${mode}${dryRun ? " (dry-run)" : ""} — repricing ${tier.name}`);

const wanted = [
  { lookupKey: tier.lookupKeyMonthly, usd: tier.priceMonthlyUsd, interval: "month" as const },
  { lookupKey: tier.lookupKeyAnnual, usd: tier.priceAnnualUsd, interval: "year" as const },
];

for (const w of wanted) {
  const existing = await stripe.prices.list({ lookup_keys: [w.lookupKey], limit: 1 });
  const current = existing.data[0];
  const wantCents = Math.round(w.usd * 100);

  if (current && current.unit_amount === wantCents) {
    console.log(`= ${w.lookupKey}: already $${w.usd}/${w.interval} (${current.id}), no change`);
    continue;
  }
  if (!current) {
    console.error(
      `  ABORT: ${w.lookupKey} has no existing price — run setup-products.mts first to create the tier.`,
    );
    process.exit(1);
  }
  console.log(
    `~ ${w.lookupKey}: live is $${(current.unit_amount ?? 0) / 100}/${w.interval}, code wants $${w.usd} — repricing`,
  );
  if (dryRun) continue;

  const productId = typeof current.product === "string" ? current.product : current.product.id;
  const price = await stripe.prices.create({
    product: productId,
    currency: "usd",
    unit_amount: wantCents,
    recurring: { interval: w.interval },
    lookup_key: w.lookupKey,
    transfer_lookup_key: true,
  });
  console.log(
    `  -> created ${price.id} at $${w.usd}/${w.interval}, lookup_key transferred from ${current.id}`,
  );
}
console.log("Done.");
