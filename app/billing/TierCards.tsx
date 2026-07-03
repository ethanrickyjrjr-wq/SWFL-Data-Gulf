// app/billing/TierCards.tsx
"use client";

import { useState } from "react";
import { BILLING_TIERS, FREE_SENDS_PER_MONTH } from "@/lib/billing/tiers";

type Interval = "monthly" | "annual";

async function go(path: string, body?: unknown) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => null)) as { url?: string } | null;
  if (res.ok && data?.url) window.location.assign(data.url);
  else alert("Could not open billing — try again in a moment.");
}

export function TierCards({
  currentTier,
  hasCustomer,
}: {
  currentTier: string;
  hasCustomer: boolean;
}) {
  const [interval, setInterval] = useState<Interval>("annual");

  return (
    <div>
      <div className="mb-6 flex items-center gap-2 text-sm">
        <button
          type="button"
          onClick={() => setInterval("monthly")}
          className={`rounded-full px-4 py-1.5 border ${interval === "monthly" ? "border-neutral-800 font-medium" : "border-neutral-200 text-neutral-500"}`}
        >
          Monthly
        </button>
        <button
          type="button"
          onClick={() => setInterval("annual")}
          className={`rounded-full px-4 py-1.5 border ${interval === "annual" ? "border-neutral-800 font-medium" : "border-neutral-200 text-neutral-500"}`}
        >
          Annual <span className="ml-1 text-xs text-emerald-600">2 months free</span>
        </button>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-neutral-200 px-5 py-4">
          <div>
            <p className="font-medium">Free</p>
            <p className="text-sm text-neutral-500">{FREE_SENDS_PER_MONTH} sends / month</p>
          </div>
          <span className="text-sm text-neutral-500">
            {currentTier === "free" ? "Current plan" : "$0"}
          </span>
        </div>

        {BILLING_TIERS.map((t) => {
          const price = interval === "annual" ? t.priceAnnualUsd : t.priceMonthlyUsd;
          const suffix = interval === "annual" ? "/yr" : "/mo";
          const isCurrent = currentTier === t.slug;
          return (
            <div
              key={t.slug}
              className="flex items-center justify-between rounded-lg border border-neutral-200 px-5 py-4"
            >
              <div>
                <p className="font-medium">{t.name}</p>
                <p className="text-sm text-neutral-500">
                  {t.sendsPerMonth.toLocaleString()} sends / month
                </p>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium">
                  ${price.toLocaleString()}
                  {suffix}
                </span>
                {isCurrent ? (
                  <span className="text-sm text-neutral-500">Current plan</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void go("/api/stripe/checkout", { tier: t.slug, interval })}
                    className="rounded-full bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white"
                  >
                    Upgrade
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {hasCustomer && (
        <button
          type="button"
          onClick={() => void go("/api/stripe/portal")}
          className="mt-6 text-sm underline text-neutral-600"
        >
          Manage subscription
        </button>
      )}
    </div>
  );
}
