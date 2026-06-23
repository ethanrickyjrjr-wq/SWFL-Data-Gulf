"use client";

import { useEffect, useState } from "react";
import { setDeliverableOwnerActive } from "@/lib/highlighter/deliverable-owner-store";

/**
 * Signals to the app-root GlobalHighlighter that this /p/* deliverable is being
 * viewed by its owner — enabling select-to-ask on a normally-suppressed white-label
 * route. Renders nothing; only the side-effect matters.
 *
 * Mirrors ReportHighlightBridge: first paint via lazy useState initializer (client-
 * guarded so concurrent SSR renders never mutate the module global), cleanup on
 * unmount via useEffect. The /p/[id] page renders this only when isOwner — non-owners
 * and embedded views never set the flag, so the clean white-label page is preserved.
 */
export function DeliverableOwnerBridge() {
  // First paint: flip the flag during render (lazy initializer), client-only.
  useState(() => {
    if (typeof window !== "undefined") setDeliverableOwnerActive(true);
    return null;
  });
  // Clear on unmount — leaving /p/* drops the highlighter back to suppressed.
  useEffect(() => () => setDeliverableOwnerActive(false), []);
  return null;
}
