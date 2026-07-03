// app/billing/TierCards.tsx
"use client";

import { useState } from "react";
import { BILLING_TIERS, FREE_SENDS_PER_MONTH } from "@/lib/billing/tiers";

type Interval = "monthly" | "annual";

const TIER_TAGLINES: Record<string, string> = {
  starter: "Your first recurring send",
  growth: "A real audience, every week",
  pro: "Full-scale distribution",
};

export function TierCards({
  currentTier,
  hasCustomer,
  loggedIn,
}: {
  currentTier: string;
  hasCustomer: boolean;
  loggedIn: boolean;
}) {
  const [interval, setInterval] = useState<Interval>("annual");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function go(path: string, key: string, body?: unknown) {
    if (!loggedIn) {
      window.location.assign("/login?next=/billing");
      return;
    }
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = (await res.json().catch(() => null)) as { url?: string } | null;
      if (res.ok && data?.url) {
        window.location.assign(data.url);
        return;
      }
      if (res.status === 401) {
        window.location.assign("/login?next=/billing");
        return;
      }
      setError("Couldn't open checkout — give it a second and try again.");
    } catch {
      setError("Couldn't reach the server — check your connection and try again.");
    }
    setBusy(null);
  }

  return (
    <div>
      {/* interval toggle */}
      <div className="mb-8 flex justify-center">
        <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-gulf-deep p-1">
          <button
            type="button"
            onClick={() => setInterval("monthly")}
            className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
              interval === "monthly"
                ? "bg-gulf-slate-hi font-medium text-text-primary"
                : "text-text-tertiary hover:text-text-secondary"
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setInterval("annual")}
            className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
              interval === "annual"
                ? "bg-gulf-slate-hi font-medium text-text-primary"
                : "text-text-tertiary hover:text-text-secondary"
            }`}
          >
            Annual
            <span className="ml-1.5 text-xs font-medium text-gulf-teal">2 months free</span>
          </button>
        </div>
      </div>

      {error && (
        <p className="mb-6 text-center text-sm text-sunset-coral" role="alert">
          {error}
        </p>
      )}

      {/* paid tiers */}
      <div className="grid gap-4 sm:grid-cols-3">
        {BILLING_TIERS.map((t) => {
          const price = interval === "annual" ? t.priceAnnualUsd : t.priceMonthlyUsd;
          const suffix = interval === "annual" ? "/yr" : "/mo";
          const isCurrent = currentTier === t.slug;
          const featured = t.slug === "growth";
          return (
            <div
              key={t.slug}
              className={`relative flex flex-col rounded-xl glass-card-modern p-6 ${
                featured ? "border !border-gulf-teal/40" : "border border-white/10"
              }`}
            >
              {featured && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gulf-teal px-3 py-0.5 text-xs font-semibold text-text-on-accent">
                  Most popular
                </span>
              )}
              <p className="font-semibold text-text-primary">{t.name}</p>
              <p className="mt-1 text-sm text-text-tertiary">{TIER_TAGLINES[t.slug]}</p>
              <p className="mt-5">
                <span className="metric-value text-3xl font-semibold text-text-primary">
                  ${price.toLocaleString()}
                </span>
                <span className="ml-1 text-sm text-text-tertiary">{suffix}</span>
              </p>
              <p className="mt-1 text-xs text-text-tertiary">
                {interval === "annual" ? "billed annually" : "billed monthly"}
              </p>
              <p className="mt-4 text-sm text-text-secondary">
                {t.sendsPerMonth.toLocaleString()} sends / month
              </p>
              <div className="mt-6 flex-1" />
              {isCurrent ? (
                <span className="rounded-lg border border-white/10 py-2 text-center text-sm text-text-tertiary">
                  Current plan
                </span>
              ) : (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() =>
                    void go("/api/stripe/checkout", t.slug, { tier: t.slug, interval })
                  }
                  className={`rounded-lg py-2 text-sm font-semibold transition-colors disabled:opacity-60 ${
                    featured
                      ? "bg-gulf-teal text-text-on-accent hover:bg-gulf-teal-dim"
                      : "border border-gulf-teal/40 text-gulf-teal hover:bg-gulf-teal/10"
                  }`}
                >
                  {busy === t.slug
                    ? "Opening checkout…"
                    : loggedIn
                      ? "Upgrade"
                      : "Log in to upgrade"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* free tier */}
      <div className="mt-4 flex items-center justify-between rounded-xl border border-white/10 bg-gulf-deep px-6 py-4">
        <div>
          <p className="font-medium text-text-primary">Free</p>
          <p className="text-sm text-text-tertiary">
            {FREE_SENDS_PER_MONTH} sends / month — every build, no card
          </p>
        </div>
        <span className="text-sm text-text-tertiary">
          {currentTier === "free" && loggedIn ? "Current plan" : "$0"}
        </span>
      </div>

      {hasCustomer && (
        <div className="mt-8 text-center">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void go("/api/stripe/portal", "portal")}
            className="text-sm text-text-secondary underline underline-offset-4 transition-colors hover:text-gulf-teal disabled:opacity-60"
          >
            {busy === "portal" ? "Opening…" : "Manage subscription"}
          </button>
        </div>
      )}
    </div>
  );
}
