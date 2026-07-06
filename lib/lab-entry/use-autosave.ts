"use client";
// lib/lab-entry/use-autosave.ts
//
// Saved-doc autosave (spec 2026-07-06 §D). Two cooperating pieces:
//   1. A debounced in-app save (~5s after the last edit) via the existing
//      materials PATCH — `makeAutosaveScheduler`, driven from onDocChange.
//   2. A flush-on-exit on pagehide / visibilitychange→hidden via fetch keepalive
//      (PATCH + JSON + cookies; sendBeacon is POST-only) — `useAutosave`.
// keepalive bodies cap at ~64KB, so an oversized doc skips the exit flush (the
// 5s debounce already covered it to within seconds). Never-saved docs use the
// leave guard, not this — a dying tab must not silently create a project.
import { useEffect, useRef } from "react";
import type { EmailDoc } from "@/lib/email/doc/types";

const DEBOUNCE_MS = 5_000;
const KEEPALIVE_CAP = 64_000;

/** keepalive bodies cap at ~64KB — over that, skip the exit flush. Pure. */
export function shouldKeepaliveFlush(byteLength: number): boolean {
  return byteLength <= KEEPALIVE_CAP;
}

/** A debounced trigger — call `schedule()` on every edit; `patch` runs once the
 *  edits stop for `delayMs`. The parent owns the timer alongside its own dirty
 *  tracking (one source of truth), so this stays a plain closure, not a hook. */
export function makeAutosaveScheduler(
  patch: () => void,
  delayMs = DEBOUNCE_MS,
): { schedule: () => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    schedule() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(patch, delayMs);
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}

export interface UseAutosaveOpts {
  savedId: string | null;
  projectId: string;
  getDoc: () => EmailDoc;
  getPrompt: () => string;
  dirtyRef: React.MutableRefObject<boolean>;
}

/** Exit flush: on pagehide / tab-hidden, if there are unflushed edits to a saved
 *  doc, fire one keepalive PATCH so the work survives the page dying. */
export function useAutosave(opts: UseAutosaveOpts): void {
  // Stable ref so the mount-only exit-flush effect always sees current values
  // without re-subscribing the listeners on every render. Synced in its own
  // per-commit effect (never during render — react-hooks/refs).
  const ref = useRef(opts);
  useEffect(() => {
    ref.current = opts;
  });

  useEffect(() => {
    function flush() {
      const { savedId, projectId, getDoc, getPrompt, dirtyRef } = ref.current;
      if (!savedId || !dirtyRef.current) return;
      const body = JSON.stringify({
        deliverable_id: savedId,
        doc: getDoc(),
        ai_prompt: getPrompt(),
      });
      if (!shouldKeepaliveFlush(new Blob([body]).size)) return;
      fetch(`/api/projects/${projectId}/materials`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    }
    function onVisibility() {
      if (document.visibilityState === "hidden") flush();
    }
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
}
