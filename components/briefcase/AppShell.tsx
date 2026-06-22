"use client";

import { usePathname } from "next/navigation";
import { AiBriefcasePill } from "@/components/briefcase/AiBriefcasePill";
import { pageFromPath, shouldRenderStandalone } from "@/lib/briefcase/pill-mount";
import { useReportContext } from "@/lib/highlighter/report-context-store";

/**
 * A-3 / Phase 3C — the SOLE owner of the ONE AI+Briefcase pill, mounted once at the app
 * root (inside BriefcaseProvider, so it files into the global draft). It has two modes,
 * chosen by the report-context store (the twin of how it once read its mode from the
 * per-/r/* HighlighterLayer prop — now lifted to the root store):
 *
 *  - BRIDGED: a /r/* page's `ReportHighlightBridge` has published a report context →
 *    open the EXISTING report dock (`AskAiDock`: thread + file-this-chart), unchanged.
 *    `AiBriefcasePill` switches to bridged on a non-empty `reportId`.
 *  - STANDALONE: everywhere else → the A-5 BriefcasePanel. Suppressed only on the
 *    white-label/clean prefixes (`/p/`, `/embed/`).
 *
 * The report-context store — NOT the `/r/*` pathname — is the bridged-vs-standalone signal
 * now, so the two are mutually exclusive (exactly one pill, INVARIANT #3). We reach the
 * standalone branch ONLY when no context is published, i.e. there is definitively no bridged
 * pill to collide with; so the standalone must show unless white-label. That is exactly
 * `shouldRenderStandalone(path, false)` — passing the highlighterEnabled arg as `false` makes
 * it the white-label-only predicate (its `/r/*` suppression is gated on that arg). This closes
 * the zero-pill gap a `/r/*` page that publishes NO context would otherwise open (e.g. the
 * `/r/search` redirect page). With the highlighter flag OFF no bridge ever mounts, so this same
 * standalone branch is the lone pill on /r/* too (the former fallback).
 */
export function AppShell() {
  const pathname = usePathname() ?? "/";
  const reportCtx = useReportContext();

  // BRIDGED — a /r/* page published its report context.
  if (reportCtx) {
    return (
      <AiBriefcasePill
        reportId={reportCtx.reportId}
        conclusion={reportCtx.conclusion}
        freshnessToken={reportCtx.freshnessToken}
      />
    );
  }

  // STANDALONE — shown everywhere except the white-label/clean prefixes.
  if (!shouldRenderStandalone(pathname, false)) return null;
  return <AiBriefcasePill page={pageFromPath(pathname)} />;
}
