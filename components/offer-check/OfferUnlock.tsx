"use client";
// components/offer-check/OfferUnlock.tsx
// Lock panel for the Offer Check — same one-time hosted Stripe Checkout as the
// Should I Sell spread (one $19 pass, 30 days on this device, both reports).
// Renders only when address+offer are entered but unpaid — so no comp lookup
// (and no vendor API spend) happens before payment.
import { useState } from "react";
import { SectionTitle } from "../../app/r/_components/report-shell";

interface Props {
  zip: string;
  address: string;
  offer: number;
  sqft: number | null;
  priceUsd: number;
}

export default function OfferUnlock({ zip, address, offer, sqft, priceUsd }: Props) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function buy() {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch("/api/stripe/report-checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          zip,
          address,
          product: "offer_check",
          offer: String(offer),
          sqft: sqft == null ? "" : String(sqft),
        }),
      });
      const data = (await res.json().catch(() => null)) as { url?: string } | null;
      if (data?.url) {
        window.location.assign(data.url);
        return;
      }
      setFailed(true);
      setBusy(false);
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <section className="mt-10">
      <SectionTitle>Your offer check is ready to run</SectionTitle>
      <div className="mt-4 max-w-2xl rounded-xl glass-card-modern border border-white/10 px-6 py-7">
        <p className="text-sm leading-7 text-gray-300">
          Offer in hand on <span className="font-semibold text-white">{address}</span>. Before you
          sign anything, see where ${offer.toLocaleString("en-US")} actually lands:
        </p>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-gray-300">
          <li>• Recent recorded sales of comparable homes near you — every comp cited and dated</li>
          <li>• How many of those sales closed above your offer, and how many below</li>
          <li>• Recorded sales kept separate from model estimates — a fact is never an opinion</li>
        </ul>
        <button
          type="button"
          onClick={buy}
          disabled={busy}
          className="btn-gradient mt-5 inline-flex items-center rounded-lg px-6 py-3 text-sm font-semibold text-navy-dark transition-all hover:opacity-90 disabled:opacity-60"
        >
          {busy ? "Opening secure checkout…" : `Check my offer — $${priceUsd}`}
        </button>
        <p className="mt-3 text-xs leading-5 text-gray-500">
          One-time payment via Stripe. No account, no subscription. You land right back here,
          unlocked for 30 days on this device — the full Should I Sell spread unlocks with it.
        </p>
        {failed && (
          <p className="mt-2 text-sm text-[#e08158]">
            Checkout didn&rsquo;t open — try again in a moment.
          </p>
        )}
      </div>
    </section>
  );
}
