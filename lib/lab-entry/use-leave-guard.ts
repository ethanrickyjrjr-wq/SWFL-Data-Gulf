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
import { useCallback, useEffect, useRef } from "react";
import { useNavigationGuard } from "nextjs-nav-guard";

/** The ONE predicate for the nav-guard's `enabled` option, pure so it's testable.
 *  `type === "beforeunload"` is ALWAYS declined: the provider registers its own
 *  page-unload listener (useInterceptPageUnload) that `bypass()` cannot reach —
 *  it kept throwing the native "Leave site?" dialog at our own confirmed hops
 *  after the 08/10/2026 fix silenced only OUR listener (operator screenshot
 *  08/10 22:31). Our dirty-only listener below owns that layer and honors bypass. */
export function navGuardEnabled(type: string, bypass: boolean, dirty: boolean): boolean {
  return type !== "beforeunload" && !bypass && dirty;
}

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
  // The `enabled` callback below must read the CURRENT dirty value without
  // changing identity every render (a fresh function re-registers the guard).
  const dirtyRef = useRef(opts.dirty);
  useEffect(() => {
    dirtyRef.current = opts.dirty;
  }, [opts.dirty]);

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
  // `enabled` is a FUNCTION, not the boolean: the provider consults it for its
  // own beforeunload layer too, and navGuardEnabled declines that type so the
  // package can never re-raise the native dialog our bypass() just disarmed.
  const enabled = useCallback(
    ({ type }: { to: string; type: string }) =>
      navGuardEnabled(type, bypassRef.current, dirtyRef.current),
    [],
  );
  const nav = useNavigationGuard({ enabled });
  return {
    ...nav,
    bypass: () => {
      bypassRef.current = true;
    },
  };
}
