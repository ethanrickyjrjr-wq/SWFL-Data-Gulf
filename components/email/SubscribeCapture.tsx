"use client";

import { useState } from "react";

/**
 * Pure helpers exported for bun:test (this repo has no DOM test environment).
 * A valid presetZip wins over activation: the caller already knows the ZIP
 * (e.g. from the /r/zip-report/[zip] URL), so the ZIP input and consent
 * checkbox are suppressed and the ZIP rides silently in the POST body.
 */
export function activationFieldsVisible(activation: boolean, presetZip?: string): boolean {
  return activation && !(presetZip && /^\d{5}$/.test(presetZip.trim()));
}

export function buildSubscribeBody(input: {
  email: string;
  source: string;
  activation: boolean;
  presetZip?: string;
  zip: string;
  consent: boolean;
}): Record<string, unknown> {
  const preset = input.presetZip?.trim();
  if (preset && /^\d{5}$/.test(preset)) {
    return { email: input.email, source: input.source, zip: preset };
  }
  return {
    email: input.email,
    source: input.source,
    ...(input.activation ? { zip: input.zip, consent: input.consent } : {}),
  };
}

/**
 * Generic email-capture CTA. Every product decision arrives via props — the
 * caller names the POST target, heading, blurb, and success copy. (The daily
 * digest this component was born for was killed 07/16 and its generator
 * deleted 07/19, so there are deliberately NO product defaults left here.)
 *
 * Plain Tailwind (no motion dep) so it drops onto both the landing and the
 * dark /r/ report pages unchanged.
 */
export default function SubscribeCapture({
  source,
  heading,
  blurb,
  activation = false,
  presetZip,
  endpoint,
  doneMessage,
}: {
  source: string;
  heading: string;
  blurb: string;
  /** POST target (e.g. /api/weekly-read/subscribe). */
  endpoint: string;
  /** Success copy shown after a 2xx. */
  doneMessage: string;
  /**
   * Activation mode (the "It's Alive" surface): also collect the prospect's ZIP and
   * an explicit, unchecked opt-in. Off everywhere else — the landing/report forms keep
   * their one-field behavior unchanged.
   */
  activation?: boolean;
  /**
   * ZIP already known from context (e.g. the zip-report URL). Sent in the POST
   * body as `scope` without asking the reader anything new — keeps the
   * lightweight single-email-field opt-in, never the activation flow.
   */
  presetZip?: string;
}) {
  const [email, setEmail] = useState("");
  const [zip, setZip] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");

  const askActivation = activationFieldsVisible(activation, presetZip);
  const blocked = askActivation && (!/^\d{5}$/.test(zip) || !consent);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || blocked) return;
    setStatus("submitting");
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          buildSubscribeBody({ email, source, activation: askActivation, presetZip, zip, consent }),
        ),
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
        <p className="mt-4 text-sm font-medium text-teal-primary">{doneMessage}</p>
      ) : (
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-3">
            {askActivation && (
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
              {status === "submitting"
                ? "Sending…"
                : askActivation
                  ? "Send my report"
                  : "Subscribe"}
            </button>
          </div>

          {askActivation && (
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
