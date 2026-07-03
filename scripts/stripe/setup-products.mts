// scripts/stripe/setup-products.mts
/**
 * Idempotent: creates the 3 products × 2 prices with the lookup keys from
 * lib/billing/tiers.ts, in whatever mode STRIPE_SECRET_KEY belongs to
 * (run against test keys first). Re-runs find-by-lookup-key and skip.
 * Usage: bun scripts/stripe/setup-products.mts [--dry-run]
 */
import Stripe from "stripe";
import { BILLING_TIERS } from "../../lib/billing/tiers.ts";

const dryRun = process.argv.includes("--dry-run");
const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("STRIPE_SECRET_KEY unset (put the test key in .env.local).");
  process.exit(1);
}
const stripe = new Stripe(key);
const mode = key.startsWith("sk_live") ? "LIVE" : "test";
console.log(`Mode: ${mode}${dryRun ? " (dry-run)" : ""}`);

const allKeys = BILLING_TIERS.flatMap((t) => [t.lookupKeyMonthly, t.lookupKeyAnnual]);
const existing = await stripe.prices.list({ lookup_keys: allKeys, limit: 100 });
const have = new Set(existing.data.map((p) => p.lookup_key));

for (const tier of BILLING_TIERS) {
  const wanted = [
    { lookupKey: tier.lookupKeyMonthly, usd: tier.priceMonthlyUsd, interval: "month" as const },
    { lookupKey: tier.lookupKeyAnnual, usd: tier.priceAnnualUsd, interval: "year" as const },
  ].filter((w) => !have.has(w.lookupKey));

  if (wanted.length === 0) {
    console.log(`= ${tier.name}: both prices exist, skipping`);
    continue;
  }
  if (dryRun) {
    for (const w of wanted) console.log(`+ would create ${w.lookupKey} — $${w.usd}/${w.interval}`);
    continue;
  }

  // Reuse the product if a surviving price already points at one.
  const sibling = existing.data.find(
    (p) => p.lookup_key === tier.lookupKeyMonthly || p.lookup_key === tier.lookupKeyAnnual,
  );
  const productId =
    typeof sibling?.product === "string"
      ? sibling.product
      : (
          await stripe.products.create({
            name: `SWFL Data Gulf — ${tier.name}`,
            metadata: { tier: tier.slug, sends_per_month: String(tier.sendsPerMonth) },
          })
        ).id;

  for (const w of wanted) {
    const price = await stripe.prices.create({
      product: productId,
      currency: "usd",
      unit_amount: w.usd * 100,
      recurring: { interval: w.interval },
      lookup_key: w.lookupKey,
      transfer_lookup_key: true,
    });
    console.log(`+ created ${w.lookupKey} → ${price.id} ($${w.usd}/${w.interval})`);
  }
}
console.log("Done.");
