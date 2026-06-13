"use client";

import { useState } from "react";

/**
 * Daily-digest subscribe CTA (Email Marketing Phase 2). SEPARATE from the
 * landing Waitlist (launch-notify) — this opts the reader into the free daily
 * SWFL data email. Posts to /api/email/subscribe with a `source` tag.
 *
 * Plain Tailwind (no motion dep) so it drops onto both the landing and the
 * dark /r/ report pages unchanged.
 */
export default function DigestSubscribe({
  source = "landing",
  heading = "Get the free daily SWFL data digest",
  blurb = "ZIP-level prices, permits, and the day's market read — one short email each weekday. Cited, no spam.",
  activation = false,
}: {
  source?: string;
  heading?: string;
  blurb?: string;
  /**
   * Activation mode (the "It's Alive" surface): also collect the prospect's ZIP and
   * an explicit, unchecked opt-in. Off everywhere else — the landing/report forms keep
   * their one-field behavior unchanged.
   */
  activation?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [zip, setZip] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");

  const blocked = activation && (!/^\d{5}$/.test(zip) || !consent);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || blocked) return;
    setStatus("submitting");
    try {
      const res = await fetch("/api/email/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          source,
          ...(activation ? { zip, consent } : {}),
        }),
      });
      setStatus(res.ok ? "done" : "error");
    } catch {
      setStatus("error");
    }
  }

  return (
    <section className="glass-card-modern border border-teal-primary/20 rounded-2xl p-6 sm:p-8">
      <h3 className="text-xl font-bold text-white">{heading}</h3>
      <p className="mt-2 text-sm text-gray-400 leading-relaxed">{blurb}</p>

      {status === "done" ? (
        <p className="mt-4 text-sm font-medium text-teal-primary">
          You&apos;re subscribed. Watch for the next weekday digest.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-3">
            {activation && (
              <input
                type="text"
                inputMode="numeric"
                required
                value={zip}
                onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
                placeholder="Your ZIP (e.g. 33931)"
                disabled={status === "submitting"}
                className="sm:w-44 input-modern rounded-xl px-4 py-3 text-white placeholder-gray-500"
              />
            )}
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={status === "submitting"}
              className="flex-1 input-modern rounded-xl px-4 py-3 text-white placeholder-gray-500"
            />
            <button
              type="submit"
              disabled={status === "submitting" || blocked}
              className="btn-gradient text-navy-dark px-6 py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === "submitting" ? "Sending…" : activation ? "Send my report" : "Subscribe"}
            </button>
          </div>

          {activation && (
            <label className="flex items-start gap-2 text-xs text-gray-400 leading-relaxed">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                disabled={status === "submitting"}
                className="mt-0.5 h-4 w-4 shrink-0 accent-teal-primary"
              />
              <span>
                Yes, send me my SWFL market report and what changes each week. I can unsubscribe
                anytime.
              </span>
            </label>
          )}
        </form>
      )}

      {status === "error" && (
        <p className="mt-3 text-xs text-red-400">Something went wrong. Try again in a moment.</p>
      )}

      <p className="mt-3 text-xs text-gray-500">
        Free. Unsubscribe anytime — every email has a one-click link.{" "}
        <a href="/privacy" className="underline hover:text-gray-300">
          Privacy policy.
        </a>
      </p>
    </section>
  );
}
