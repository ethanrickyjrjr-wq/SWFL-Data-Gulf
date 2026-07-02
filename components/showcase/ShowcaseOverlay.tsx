"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Showcase } from "@/lib/showcase/registry";
import { totalSteps, clampStep, stepLabel } from "@/lib/showcase/overlay-logic";
import { LoginModal } from "@/components/landing/LoginModal";

/**
 * Near-fullscreen step-through for one showcase. Click-through ONLY — no
 * auto-advance ever (rotating content reads as an ad and gets skipped).
 * Content steps render the committed capture + captions; the final step is
 * the tier/CTA slide, which opens the OTP LoginModal ABOVE this overlay
 * (LoginModal portals at z-[100]; we sit at z-[90]).
 */
export function ShowcaseOverlay({
  showcase,
  onClose,
}: {
  showcase: Showcase;
  onClose: () => void;
}) {
  const total = totalSteps(showcase);
  const [step, setStep] = useState(0);
  const [loginOpen, setLoginOpen] = useState(false);
  const scrimRef = useRef<HTMLDivElement>(null);
  const touchX = useRef<number | null>(null);

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
                {/* eslint-disable-next-line @next/next/no-img-element -- committed static capture */}
                <img
                  src={slide.image}
                  alt={slide.title}
                  className="mx-auto w-full max-w-2xl rounded-lg border border-white/10"
                  loading={step === 0 ? "eager" : "lazy"}
                />
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
                {slide.liveHref && (
                  <a
                    href={slide.liveHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-block text-xs font-semibold underline-offset-2 hover:underline"
                    style={{ color: showcase.accent }}
                  >
                    See the real thing ↗
                  </a>
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
              <p className="max-w-md text-center text-lg font-semibold text-[#f0ede6]">
                Everything you just saw, for your own listings and your own farm.
              </p>
              <div className="grid w-full max-w-lg grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-[#0b161c] p-4">
                  <p className="text-sm font-bold text-[#f0ede6]">Free</p>
                  <ul className="mt-2 space-y-1.5 text-xs text-gray-300">
                    <li>Unlimited builds</li>
                    <li>Every number cited to a real source</li>
                    <li>Email + PDF output</li>
                    <li className="text-gray-500">Watermark after the first month</li>
                  </ul>
                </div>
                <div className="rounded-xl border p-4" style={{ borderColor: showcase.accent }}>
                  <p className="text-sm font-bold" style={{ color: showcase.accent }}>
                    Pro
                  </p>
                  <ul className="mt-2 space-y-1.5 text-xs text-gray-300">
                    <li>Clean, branded sends</li>
                    <li>Your logo, your sign-off</li>
                    <li>Scheduling — set it once</li>
                  </ul>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLoginOpen(true)}
                className="btn-gradient rounded-lg px-8 py-2.5 text-sm font-semibold text-navy-dark"
              >
                Start building free
              </button>
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
              onClick={() => setLoginOpen(true)}
              className="shrink-0 text-xs font-semibold underline-offset-2 hover:underline"
              style={{ color: showcase.accent }}
            >
              Start building free
            </button>
          )}
        </div>
      </div>

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </div>,
    document.body,
  );
}
