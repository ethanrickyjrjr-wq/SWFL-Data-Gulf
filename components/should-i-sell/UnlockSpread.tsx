"use client";
// components/should-i-sell/UnlockSpread.tsx
// The lock panel for Section 3: one-time hosted Stripe Checkout, no account
// needed. Renders only when an address is entered but the spread is unpaid —
// so no comp lookup (and no vendor API spend) happens before payment.
import { useState } from "react";
import { SectionTitle } from "../../app/r/_components/report-shell";

interface Props {
  zip: string;
  address: string;
  priceUsd: number;
}

export default function UnlockSpread({ zip, address, priceUsd }: Props) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function buy() {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch("/api/stripe/report-checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ zip, address }),
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
      <SectionTitle>Your spread is ready to run</SectionTitle>
      <div className="mt-4 max-w-2xl rounded-xl glass-card-modern border border-white/10 px-6 py-7">
        <p className="text-sm leading-7 text-gray-300">
          We found <span className="font-semibold text-white">{address}</span>. The full spread lays
          out, line by line:
        </p>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-gray-300">
          <li>• Your home&rsquo;s value estimated from nearby recorded sales — every comp cited</li>
          <li>
            • What holding 6 or 12 more months could cost or gain, on your area&rsquo;s own trend
          </li>
          <li>
            • Your Save Our Homes cap &amp; portability math — the tax number most sellers miss
          </li>
        </ul>
        <button
          type="button"
          onClick={buy}
          disabled={busy}
          className="btn-gradient mt-5 inline-flex items-center rounded-lg px-6 py-3 text-sm font-semibold text-navy-dark transition-all hover:opacity-90 disabled:opacity-60"
        >
          {busy ? "Opening secure checkout…" : `Unlock my full spread — $${priceUsd}`}
        </button>
        <p className="mt-3 text-xs leading-5 text-gray-500">
          One-time payment via Stripe. No account, no subscription. Instant — you land right back on
          this report, unlocked for 30 days on this device.
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
