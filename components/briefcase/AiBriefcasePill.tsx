"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useBriefcase } from "@/components/briefcase/BriefcaseProvider";
import { useSession } from "@/lib/auth/use-session";
import { BriefcasePanel } from "@/components/briefcase/BriefcasePanel";
import { AskAiDock } from "@/components/highlighter/AskAiDock";
import { browserStorage } from "@/lib/briefcase/draft";
import { readVisits, type PillPage } from "@/lib/briefcase/visits";
import { shouldAutoOpenPill } from "@/lib/briefcase/pill-mount";

/**
 * A-3 — the ONE unified "AI + Briefcase" pill. A single bottom-right button on
 * every page (replaces the per-/r/* AskAiFab + Briefcase tray), badge = draft count
 * from the root BriefcaseProvider.
 *
 * Mode (operator decision — Option 1, dock preserved):
 *  - BRIDGED (reportId present): AppShell mounts this once at the app root and passes the
 *    reportId from the report-context store (published by the /r/* page's
 *    ReportHighlightBridge). Opens the EXISTING AskAiDock with ZERO behavior change — the
 *    report thread + file-this-chart stay exactly as they were.
 *  - STANDALONE (no reportId, also mounted at root by AppShell): opens the A-5
 *    BriefcasePanel (chat + examples + draft + build), no HighlighterContext needed.
 *
 * First-visit auto-open (2026-06-21): the standalone pill pops itself open ONCE for a
 * brand-new, logged-out visitor — the funnel hook (prompts + project examples already
 * live in the panel). Decision is the pure `shouldAutoOpenPill`; see below for why this
 * is hydration-safe and effect-free.
 */

// First visit = the anonymous visit counter is still 0 (BriefcasePanel bumps it to 1
// the first time it mounts). Read it via useSyncExternalStore so the SERVER snapshot is
// always false (pill closed in the SSR HTML) and the real client value lands AFTER
// hydration — no mismatch, and no set-state-in-effect (this repo hard-errors on both).
// Same pattern as use-ai-context.ts / PhoneContactPicker.tsx.
const noopSubscribe = () => () => {};
function firstVisitSnapshot(): boolean {
  return readVisits(browserStorage()) === 0;
}

export function AiBriefcasePill({
  reportId,
  conclusion,
  freshnessToken,
  page = { kind: "generic" },
}: {
  reportId?: string;
  conclusion?: string;
  freshnessToken?: string;
  page?: PillPage;
}) {
  const briefcase = useBriefcase();
  const session = useSession();
  const count = briefcase?.draftItems.length ?? 0;
  const bridged = typeof reportId === "string" && reportId.length > 0;
  // Inside a project the panel renders as the project assistant (no funnel), so the
  // pill introduces itself as the AI — "Briefcase" is prospect-facing vocabulary.
  const label = page.kind === "project" ? "Ask AI" : "AI + Briefcase";

  const [open, setOpen] = useState(false);
  // One-shot guard so the funnel pop fires at most once per page load: right after it
  // opens, the BriefcasePanel mounts and bumps the visit counter (flipping
  // firstVisitSnapshot to false). The guard keeps that flip from yanking the panel
  // back closed, and the user's own toggles win from here on.
  const [autoOpenResolved, setAutoOpenResolved] = useState(false);
  const firstVisit = useSyncExternalStore(noopSubscribe, firstVisitSnapshot, () => false);

  // The auto-open decision runs DURING RENDER (no effect — the repo bans
  // set-state-in-effect), and only once auth has RESOLVED (`session !== null`) so a
  // logged-in first-load never flashes open. Set-state-during-render is the sanctioned
  // no-effect pattern; `autoOpenResolved` prevents a render loop. Because `session` is
  // null in SSR + the first client paint, this is skipped during hydration — the
  // committed DOM matches the server HTML before the pop fires. The matchMedia read is
  // safe here for the same reason: session !== null only happens client-side.
  if (!autoOpenResolved && session !== null) {
    setAutoOpenResolved(true);
    const phone = typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches;
    if (shouldAutoOpenPill({ firstVisit, authed: session.authed, bridged, phone })) {
      setOpen(true);
    }
  }

  // Escape closes the open standalone sheet — the keyboard twin of the header X
  // (NN/g overlay guideline). Listener-only effect; setState happens in the event
  // handler, not the effect body, so the set-state-in-effect ban doesn't apply.
  useEffect(() => {
    if (!open || bridged) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, bridged]);

  return (
    <>
      <div className="fixed bottom-4 right-4 z-[56] print-hide">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? "Close AI and Briefcase" : "Open AI and Briefcase"}
          className="btn-gradient relative flex items-center gap-2 rounded-full px-4 py-3 text-sm font-semibold text-navy-dark shadow-lg shadow-black/40 transition-transform hover:scale-105 active:scale-95"
        >
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 512 512" fill="none" aria-hidden="true">
            <g stroke="currentColor" strokeLinecap="round" strokeWidth="56">
              <path d="M80 160 C 144 112, 208 112, 256 160 C 304 208, 368 208, 432 160" />
              <path
                d="M80 256 C 144 208, 208 208, 256 256 C 304 304, 368 304, 432 256"
                opacity="0.7"
              />
              <path
                d="M80 352 C 144 304, 208 304, 256 352 C 304 400, 368 400, 432 352"
                opacity="0.4"
              />
            </g>
          </svg>
          <span>{open ? "Close" : label}</span>
          {count > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-navy-dark px-1 text-[11px] font-bold text-gulf-teal">
              {count}
            </span>
          )}
        </button>
      </div>

      {/* BRIDGED: the existing report dock, untouched (thread + file-this-chart). */}
      {open && bridged && (
        <div className="print-hide">
          <AskAiDock
            reportId={reportId}
            conclusion={conclusion}
            freshnessToken={freshnessToken}
            onClose={() => setOpen(false)}
          />
        </div>
      )}

      {/* STANDALONE: the A-5 project-view panel in a popover shell. */}
      {open && !bridged && (
        <div
          role="dialog"
          aria-label="AI and Briefcase"
          // PHONE: the sheet sits above the pill (z-57 > z-56) and spans the full
          // width, so it COVERS the Close pill — the always-visible header X below
          // is the sheet's own close (07/05/2026 fix; the panel had none). Cap at
          // 55vh so the page stays readable above it. Desktop (sm:) keeps its
          // 70vh / 360px popover unchanged.
          className="fixed inset-x-0 bottom-0 z-[57] flex max-h-[55vh] flex-col rounded-t-2xl border border-gulf-teal bg-[#2c3539] shadow-2xl shadow-black/50 sm:inset-x-auto sm:bottom-20 sm:right-4 sm:max-h-[70vh] sm:w-[360px] sm:rounded-xl"
        >
          <div className="relative flex shrink-0 items-center justify-center px-4 pt-2 pb-1">
            <div className="h-1 w-9 rounded-full bg-white/20" aria-hidden="true" />
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close AI and Briefcase"
              className="absolute right-2 top-1.5 rounded-full p-1.5 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M4.3 3.3 8 7l3.7-3.7 1 1L9 8l3.7 3.7-1 1L8 9l-3.7 3.7-1-1L7 8 3.3 4.3z" />
              </svg>
            </button>
          </div>
          <div className="min-h-0 overflow-y-auto p-4 pt-2">
            <BriefcasePanel page={page} />
          </div>
        </div>
      )}
    </>
  );
}
