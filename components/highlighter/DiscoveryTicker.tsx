"use client";

import { useEffect, useRef, useState } from "react";

// Ambient, top-right "what you can do here" ticker. Deliberately subtle (low
// opacity, small, dark glass) so it never bothers the reader — the operator's
// "comes up softly in the top right where it won't bother anyone". Hidden on
// phones (mobile discovery is the coachmark + chips). Pauses on hover; under
// prefers-reduced-motion it shows a single static tip and never auto-advances.

// On a /r/* report, the report-flavored set. Off-report (home/charts/maps/…) the
// generic set — drops the report/figure-specific tips that would read as nonsense
// off a report (M3). `GlobalHighlighter` picks the set via the report-context store.
const REPORT_TIPS = [
  "Double-tap any figure to ask about it",
  "Compare any two SWFL ZIPs",
  "Ask “what’s driving this?”",
  "Open Ask AI (bottom-right) to chat about this report",
  "Every answer cites its source — or declines",
];

const GENERIC_TIPS = [
  "Highlight any figure to ask about it",
  "Compare any two SWFL ZIPs",
  "Ask “what’s driving this?”",
  "Open Ask AI (bottom-right) to chat",
  "Every answer cites its source — or declines",
];

const VISIBLE_MS = 4600;
const FADE_MS = 350;

export function DiscoveryTicker({ onReport }: { onReport: boolean }) {
  const TIPS = onReport ? REPORT_TIPS : GENERIC_TIPS;
  const tipCount = TIPS.length;
  const [i, setI] = useState(0);
  const [visible, setVisible] = useState(true);
  const paused = useRef(false);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return; // static single tip — no rotation

    let fade: ReturnType<typeof setTimeout>;
    const cycle = setInterval(() => {
      if (paused.current) return;
      setVisible(false); // fade out
      fade = setTimeout(() => {
        setI((n) => (n + 1) % tipCount);
        setVisible(true); // fade the next one in
      }, FADE_MS);
    }, VISIBLE_MS);
    return () => {
      clearInterval(cycle);
      clearTimeout(fade);
    };
  }, [tipCount]);

  return (
    <div
      id="discovery-ticker"
      // top-16 clears the site bar (fixed z-50 on home, sticky z-40 elsewhere) — at
      // top-3 the tip rendered UNDERNEATH the transparent home bar's CTA cluster.
      className="pointer-events-none fixed right-3 top-16 z-40 hidden max-w-[18rem] sm:block"
      aria-hidden="true"
    >
      <div
        onMouseEnter={() => {
          paused.current = true;
        }}
        onMouseLeave={() => {
          paused.current = false;
        }}
        className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-gray-300 opacity-70 shadow-lg shadow-black/30 backdrop-blur-sm transition-opacity duration-300 hover:opacity-100"
      >
        <span className="shrink-0 text-gulf-teal">✦</span>
        <span
          className="min-w-0 truncate transition-opacity ease-in-out"
          style={{
            opacity: visible ? 1 : 0,
            transitionDuration: `${FADE_MS}ms`,
          }}
        >
          {TIPS[i]}
        </span>
      </div>
    </div>
  );
}
