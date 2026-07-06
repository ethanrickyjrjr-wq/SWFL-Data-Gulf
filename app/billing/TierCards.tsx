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
              {/* Postiz-style: always show the per-MONTH figure big; on annual it's the
                  yearly price ÷ 12 with the whole-year charge stated underneath. */}
              <p className="mt-5">
                <span className="metric-value text-3xl font-semibold text-text-primary">
                  $
                  {interval === "annual"
                    ? (t.priceAnnualUsd / 12).toFixed(2)
                    : t.priceMonthlyUsd.toLocaleString()}
                </span>
                <span className="ml-1 text-sm text-text-tertiary">/mo</span>
              </p>
              <p className="mt-1 text-xs text-text-tertiary">
                {interval === "annual"
                  ? `billed as $${t.priceAnnualUsd.toLocaleString()}/year`
                  : "billed monthly"}
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

      {/* Socials — included on every plan (build is free; send is the paywall).
          Sits directly under the paid tiers so it reads as a headline value, not a
          footnote. Honest claim: we BUILD ready-to-post content for every format from
          the same live data as the email. Auto-posting is a roadmap item (gated on
          per-platform app review) — do NOT claim it here. */}
      <div className="mt-6 rounded-xl glass-card-modern border border-gulf-teal/30 px-6 py-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-gulf-teal">
          Included on every plan
        </p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-text-primary">
          Every campaign builds your socials, too
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-text-secondary">
          The same live local data behind your email becomes ready-to-post content — in every
          format: square feed, portrait, landscape, and 9:16 story. Caption and hashtags done. Build
          it here, post it anywhere.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {["Square feed", "Portrait", "Landscape", "9:16 story"].map((f) => (
            <span
              key={f}
              className="rounded-full border border-white/10 bg-gulf-deep px-3 py-1 text-xs text-text-secondary"
            >
              {f}
            </span>
          ))}
        </div>
        <p className="mt-4 text-xs text-text-tertiary">
          Social media is the #1 source of quality leads for agents — 54% rank it their top tool,
          ahead of the CRM and the MLS.{" "}
          <span className="text-text-tertiary/80">Source: NAR agent technology survey, 2026.</span>
        </p>
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
