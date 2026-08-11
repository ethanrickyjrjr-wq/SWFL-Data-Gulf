"use client";
// lib/lab-entry/use-leave-guard.ts
//
// Never-saved / dirty lab work must not vanish on navigation (spec 2026-07-06 §D).
// Two layers:
//   1. nextjs-nav-guard intercepts internal App Router nav (router.push, <Link>,
//      back/forward) so the caller can raise its own Save/Leave/Cancel dialog.
//   2. A `beforeunload` listener — registered ONLY while dirty, removed when clean
//      — catches tab close / reload with the browser's generic (non-customizable)
//      prompt. Firefox drops pages with a live beforeunload from the bfcache, so it
//      must stay off while clean. Uses the maintained fork (not the unmaintained
//      LayerX package), which supports Next 16.2+.
import { useEffect, useRef } from "react";
import { useNavigationGuard } from "nextjs-nav-guard";

export interface LeaveGuardHandle {
  active: boolean;
  accept: () => void;
  reject: () => void;
  /** Disarm the beforeunload layer for a hard navigation WE are about to fire
   *  (window.location.assign into a project the user just confirmed). Without
   *  this the browser throws its native "Leave site?" dialog at our own
   *  controlled hop (operator screenshot 08/10/2026). One-way per mount — the
   *  destination page mounts its own guard. */
  bypass: () => void;
}

export function useLeaveGuard(opts: { dirty: boolean }): LeaveGuardHandle {
  const bypassRef = useRef(false);

  // beforeunload — only while dirty (sticky-activation + bfcache hygiene).
  useEffect(() => {
    if (!opts.dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      if (bypassRef.current) return; // our own confirmed hop — let it through
      e.preventDefault();
      e.returnValue = ""; // legacy; the shown text is a generic browser string
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [opts.dirty]);

  // Internal App Router nav — custom-dialog mode (no confirm callback → async;
  // the caller renders a dialog on `active` and calls accept/reject).
  const nav = useNavigationGuard({ enabled: opts.dirty });
  return {
    ...nav,
    bypass: () => {
      bypassRef.current = true;
    },
  };
}
