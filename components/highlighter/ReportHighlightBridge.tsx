"use client";

import { useEffect, useMemo, useState } from "react";
import {
  publishReportContext,
  clearReportContext,
  type MetricSuggestion,
} from "@/lib/highlighter/report-context-store";

/**
 * Publishes THIS /r/* page's report context (its encoded `reportId`, conclusion, freshness
 * token, and dossier-carried metric suggestions) to the module-level report-context store, so
 * the app-root `GlobalHighlighter` + AI pill — both SIBLINGS of the page, not descendants —
 * become report-grounded. Renders nothing.
 *
 * This is the twin of `app/project/[id]/workspace/ProjectAiContextBridge` (which carries the
 * project digest to the same root pill). Replaces the per-page `<HighlighterLayer>` mount;
 * the highlighter UI now lives at the root, this just feeds it the report identity. The
 * `reportId` prop keeps the `buildReportId(...)` encoding so the 404-prevention guard (B2)
 * still holds — a page that mounts this with a raw id fails CI before it can 404.
 *
 * STATE-LIFT FOOTGUN (this repo hard-errors on `react-hooks/set-state-in-effect`): the first
 * publish runs in a lazy `useState` initializer (NOT an effect), client-guarded so concurrent
 * SSR renders never mutate the module global. A module-store write is not a React `setState`,
 * so the update + cleanup effects below are exempt — exactly like `ProjectAiContextBridge`.
 */
export function ReportHighlightBridge({
  reportId,
  conclusion,
  freshnessToken,
  metricSuggestions = [],
}: {
  reportId: string;
  conclusion?: string;
  freshnessToken?: string;
  metricSuggestions?: MetricSuggestion[];
}) {
  const ctx = useMemo(
    () => ({ reportId, conclusion, freshnessToken, metricSuggestions }),
    [reportId, conclusion, freshnessToken, metricSuggestions],
  );
  // First paint: seed the store during render (lazy initializer), client-only.
  useState(() => {
    if (typeof window !== "undefined") publishReportContext(ctx);
    return null;
  });
  // Keep the store in sync if the context changes within the same mount. The store no-ops an
  // unchanged re-publish, so a same-context re-fire is free.
  useEffect(() => {
    publishReportContext(ctx);
  }, [ctx]);
  // Clear on unmount — leaving /r/* for an off-report page degrades the pill + highlighter
  // back to OUTSIDE AI. On a report→report client nav, React runs this cleanup BEFORE the new
  // bridge's mount effect, so the next report's publish wins (net: published).
  useEffect(() => () => clearReportContext(), []);
  return null;
}
