"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Showcase } from "@/lib/showcase/registry";
import type { ShowcaseRecipe } from "@/lib/showcase/recipe";
import { totalSteps, clampStep, stepLabel } from "@/lib/showcase/overlay-logic";
import { CADENCE_COLORS, CADENCE_ORDER } from "@/lib/campaigns/cadence-colors";
import { LoginModal } from "@/components/landing/LoginModal";
import { SocialBoard } from "@/components/showcase/SocialBoard";
import { BILLING_TIERS } from "@/lib/billing/tiers";
import { useSession } from "@/lib/auth/use-session";

/** Cheapest paid plan, from the one price root — the "from $x/mo" anchor. */
const STARTER_PRICE = BILLING_TIERS[0].priceMonthlyUsd;

/**
 * Near-fullscreen step-through for one showcase. Click-through ONLY — no
 * auto-advance ever (rotating content reads as an ad and gets skipped).
 * Content steps render the committed capture + captions; buildable steps carry
 * the "Make this →" recipe button when the host passes `onUseRecipe` (the lab
 * injects the prompt into its Build box, or a host without a Build box on
 * screen carries it to one — operator ruling 07/03/2026; the old "See the real
 * thing" self-link is dead). The final step is the tier/CTA slide.
 *
 * "Start building free" (footer + tier slide) checks the session ITSELF —
 * `useSession()` is called here, not threaded in as a prop, so no host can
 * forget to wire it (that's exactly how the 07/03/2026 pill-auth bug
 * happened: the recipe flow shipped to the lab's own accordion but the
 * button here kept unconditionally opening LoginModal for every host,
 * including already-signed-in visitors). Authed → `onAuthedCta` (host action,
 * e.g. "go build"); no handler given → falls back to just closing the
 * overlay, never login. Logged out → the OTP LoginModal opens ABOVE this
 * overlay (LoginModal portals at z-[100]; we sit at z-[90]).
 */
export function ShowcaseOverlay({
  showcase,
  onClose,
  onUseRecipe,
  onAuthedCta,
}: {
  showcase: Showcase;
  onClose: () => void;
  /** Present only where a builder is on screen, or a host that can carry the
   *  recipe to one — hosts without it show the story with no CTA button. */
  onUseRecipe?: (recipe: ShowcaseRecipe) => void;
  /** What "Start building free" does for an ALREADY-signed-in visitor.
   *  Default (unset): close the overlay — safe no-op, never re-prompts login. */
  onAuthedCta?: () => void;
}) {
  const total = totalSteps(showcase);
  const [step, setStep] = useState(0);
  const [loginOpen, setLoginOpen] = useState(false);
  const session = useSession();
  const authed = session?.authed ?? false;
  const scrimRef = useRef<HTMLDivElement>(null);
  const touchX = useRef<number | null>(null);

  function handleFreeCta() {
    if (authed) {
      (onAuthedCta ?? onClose)();
      return;
    }
    setLoginOpen(true);
  }

  const go = (next: number) => setStep(clampStep(next, total));

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setStep((s) => clampStep(s + 1, total));
      if (e.key === "ArrowLeft") setStep((s) => clampStep(s - 1, total));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, total]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const isTier = step === total - 1;
  const slide = isTier ? null : showcase.slides[step];
  const recipe = slide?.recipe;

  return createPortal(
    <div
      ref={scrimRef}
      className="fixed inset-0 z-[90] flex h-dvh flex-col bg-black/70 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === scrimRef.current) onClose();
      }}
      onTouchStart={(e) => {
        touchX.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        if (dx < -48) go(step + 1);
        if (dx > 48) go(step - 1);
      }}
    >
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col px-3 py-3 sm:px-6 sm:py-5">
        {/* ── Header: company + step rail + close ── */}
        <div className="flex items-center gap-3 rounded-t-xl bg-[#0b161c] px-4 py-3">
          <span className="hidden text-xs font-semibold text-gray-300 sm:block">
            {showcase.company}
          </span>
          <nav
            className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
            aria-label="Steps"
          >
            {Array.from({ length: total }, (_, i) => {
              const name = i === total - 1 ? "What you get" : showcase.slides[i].title;
              const active = i === step;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => go(i)}
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                    active ? "text-navy-dark" : "bg-white/5 text-gray-400 hover:text-gray-200"
                  }`}
                  style={active ? { background: showcase.accent } : undefined}
                >
                  {i + 1}. {name}
                </button>
              );
            })}
          </nav>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close showcase"
            className="shrink-0 text-gray-400 transition-colors hover:text-white"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* ── Body ── */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-[#101f27]">
          {slide ? (
            <div className="flex flex-col gap-4 p-4 sm:flex-row sm:p-6">
              <div className="min-w-0 flex-1">
                {slide.socialBoard ? (
                  <SocialBoard board={slide.socialBoard} accent={showcase.accent} />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- committed static capture
                  <img
                    src={slide.image}
                    alt={slide.title}
                    className="mx-auto w-full max-w-2xl rounded-lg border border-white/10"
                    loading={step === 0 ? "eager" : "lazy"}
                  />
                )}
              </div>
              <div className="w-full shrink-0 sm:w-64">
                <p
                  className="text-[10px] uppercase tracking-wider"
                  style={{ color: showcase.accent }}
                >
                  {stepLabel(showcase, step)}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-[#f0ede6]">
                  {slide.whatsHappening}
                </p>
                <p className="mt-3 text-xs leading-relaxed text-gray-400">
                  <span className="font-semibold" style={{ color: showcase.accent }}>
                    How the AI handles it:
                  </span>{" "}
                  {slide.howAiHandled}
                </p>
                {slide.receipt && (
                  <p className="mt-3 border-l-2 border-white/10 pl-2 text-[10px] leading-relaxed text-gray-500">
                    {slide.receipt}
                  </p>
                )}
                {step === 0 && showcase.cadenceRefresh && (
                  <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">
                      What the AI keeps fresh
                    </p>
                    <ul className="mt-2 space-y-1.5">
                      {CADENCE_ORDER.filter((c) => showcase.cadenceRefresh?.[c]?.length).map(
                        (c) => (
                          <li key={c} className="flex gap-2 text-[11px] leading-snug">
                            <span
                              className="mt-px shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                              style={{
                                background: CADENCE_COLORS[c].bg,
                                color: CADENCE_COLORS[c].fg,
                              }}
                            >
                              {CADENCE_COLORS[c].label}
                            </span>
                            <span className="text-gray-300">
                              {showcase.cadenceRefresh![c]!.join("; ")}
                            </span>
                          </li>
                        ),
                      )}
                    </ul>
                    <p className="mt-2 text-[9px] leading-snug text-gray-500">
                      Colors mark how often each figure updates in the data — not how often it
                      sends.
                    </p>
                  </div>
                )}
                {recipe && onUseRecipe && (
                  <div
                    className="mt-4 rounded-lg border p-3"
                    style={{ borderColor: showcase.accent, background: `${showcase.accent}14` }}
                  >
                    <p
                      className="text-[10px] font-bold uppercase tracking-wider"
                      style={{ color: showcase.accent }}
                    >
                      Build your own version
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-gray-300">
                      We rebuild this one for you, on real data — you just tell us where.
                    </p>
                    <button
                      type="button"
                      onClick={() => onUseRecipe(recipe)}
                      className="mt-2.5 w-full rounded-lg px-3 py-2.5 text-xs font-bold text-navy-dark transition-opacity hover:opacity-90"
                      style={{ background: showcase.accent }}
                    >
                      Make this →
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-5 p-6 sm:p-10">
              <p
                className="text-[10px] uppercase tracking-wider"
                style={{ color: showcase.accent }}
              >
                {stepLabel(showcase, step)}
              </p>
              <p className="max-w-lg text-center text-lg font-semibold text-[#f0ede6]">
                Everything you just saw, for your own listings and your own farm. Pick how you want
                to start.
              </p>
              <div className="grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
                {/* ── Free: sign up with email, keep your work ── */}
                <div className="flex flex-col rounded-xl border border-white/12 bg-[#0b161c] p-5 text-left">
                  <p className="text-base font-bold text-[#f0ede6]">Try it free</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-gray-400">
                    Build as much as you want and keep every draft saved — just sign up with your
                    email below.
                  </p>
                  <ul className="mt-3 space-y-1.5 text-xs text-gray-300">
                    <li>Unlimited builds, work saved to your account</li>
                    <li>Every number cited to a real source</li>
                    <li>Email + PDF output</li>
                    <li className="text-gray-500">Watermark after the first month</li>
                  </ul>
                  <button
                    type="button"
                    onClick={handleFreeCta}
                    className="btn-gradient mt-auto rounded-lg px-4 py-2.5 text-sm font-semibold text-navy-dark"
                  >
                    {authed ? "Go build it →" : "Sign up with email"}
                  </button>
                </div>
                {/* ── Plans: autonomous campaigns, links to real pricing ── */}
                <div
                  className="flex flex-col rounded-xl border p-5 text-left"
                  style={{ borderColor: showcase.accent, background: `${showcase.accent}12` }}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-base font-bold" style={{ color: showcase.accent }}>
                      Go autonomous
                    </p>
                    <p className="shrink-0 text-[11px] text-gray-400">
                      from ${STARTER_PRICE.toFixed(2)}/mo
                    </p>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-gray-400">
                    Hands-off email + social campaigns that send research-backed marketing at each
                    stage of the sale — you pick the plan, it runs itself.
                  </p>
                  <ul className="mt-3 space-y-1.5 text-xs text-gray-300">
                    <li>Clean, branded sends — your logo, your sign-off</li>
                    <li>Scheduling — set it once, it sends itself</li>
                    <li>Higher send limits as you grow</li>
                  </ul>
                  <a
                    href="/billing"
                    className="mt-auto rounded-lg px-4 py-2.5 text-center text-sm font-semibold text-navy-dark transition-opacity hover:opacity-90"
                    style={{ background: showcase.accent }}
                  >
                    Choose your plan →
                  </a>
                </div>
              </div>
              <p className="max-w-md text-center text-[11px] leading-relaxed text-gray-500">
                Not sure yet? Start free — you can pick a plan any time to turn on scheduled,
                branded sends.
              </p>
            </div>
          )}
        </div>

        {/* ── Footer: arrows + persistent CTA + disclosure ── */}
        <div className="flex items-center gap-3 rounded-b-xl bg-[#0b161c] px-4 py-3">
          <button
            type="button"
            onClick={() => go(step - 1)}
            disabled={step === 0}
            aria-label="Previous step"
            className="rounded-full bg-white/5 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-white/15 disabled:opacity-30"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => go(step + 1)}
            disabled={step === total - 1}
            aria-label="Next step"
            className="rounded-full bg-white/5 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-white/15 disabled:opacity-30"
          >
            ›
          </button>
          <p className="min-w-0 flex-1 truncate text-[9px] text-gray-500">{showcase.disclosure}</p>
          {!isTier && (
            <button
              type="button"
              onClick={handleFreeCta}
              className="shrink-0 text-xs font-semibold underline-offset-2 hover:underline"
              style={{ color: showcase.accent }}
            >
              {authed ? "Go build it →" : "Start building free"}
            </button>
          )}
        </div>
      </div>

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </div>,
    document.body,
  );
}
