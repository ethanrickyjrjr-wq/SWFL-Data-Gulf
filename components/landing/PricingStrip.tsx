import { BILLING_TIERS, FREE_SENDS_PER_MONTH } from "@/lib/billing/tiers";

/**
 * Pricing strip (Lane B spec §5 / spine D1). Slim strip, not full cards.
 * EVERY dollar renders from lib/billing/tiers.ts — the declared single price
 * root — no price literal may appear in this file. /billing owns checkout.
 */
export default function PricingStrip() {
  return (
    <section className="pricing-strip" id="pricing">
      <div className="pricing-head">
        <div className="cap-eyebrow">Builds are free — you pay to send</div>
        <h2 className="pricing-headline">Simple pricing, no contract</h2>
      </div>
      <div className="pricing-row">
        <div className="pricing-cell">
          <div className="pricing-name">Free</div>
          <div className="pricing-price">$0</div>
          <div className="pricing-sends">{FREE_SENDS_PER_MONTH} sends/mo</div>
          <div className="pricing-note">Build anything. Try the engine.</div>
        </div>
        {BILLING_TIERS.map((t) => (
          <div className="pricing-cell" key={t.slug}>
            <div className="pricing-name">{t.name}</div>
            <div className="pricing-price">
              ${t.priceMonthlyUsd}
              <span className="pricing-per">/mo</span>
            </div>
            <div className="pricing-sends">{t.sendsPerMonth.toLocaleString("en-US")} sends/mo</div>
            <div className="pricing-note">${t.priceAnnualUsd}/yr on annual — 2 months free</div>
          </div>
        ))}
      </div>
      <div className="pricing-foot">
        <span>No contract. Cancel anytime.</span>
        <a className="pricing-link" href="/billing">
          See full pricing →
        </a>
      </div>
    </section>
  );
}
