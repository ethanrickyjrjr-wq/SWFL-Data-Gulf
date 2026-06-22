"use client";

import { useSyncExternalStore } from "react";
import type { SelectedFact } from "./use-highlight";
import { suggestionsForSelection } from "./suggestions";

/**
 * The in-session report-context bus — a module-level store holding the report the
 * CURRENT /r/* page is grounded on (its encoded reportId, conclusion, freshness
 * token, and dossier-carried metric suggestions), with subscribers for
 * `useSyncExternalStore`.
 *
 * Why a module store and not React state: the unified Highlighter (`GlobalHighlighter`)
 * and the unified AI pill (`AppShell`) both live at the app ROOT (`app/layout.tsx`),
 * SIBLINGS of the per-/r/* page. Report state can't flow up the React tree to reach
 * them. The store lives OUTSIDE the tree, so both read it via `useReportContext()`
 * while the per-report `ReportHighlightBridge` writes it on load — across route
 * changes and remounts, with NO effect-derived React state (these are module-global
 * writes, not React `setState`, so they never trip `react-hooks/set-state-in-effect`).
 *
 * This is the exact twin of `lib/project/ai-context-store.ts` (which carries the
 * project digest to the same root pill). Off-report (home/charts/maps/…), the store
 * is null and both surfaces treat the page as OUTSIDE AI.
 *
 * SSR safety: writes are client-only (the bridge guards on `typeof window`), and the
 * hook's `getServerSnapshot` is always `null`, so concurrent server renders never read
 * or mutate this global.
 */

/** One metric's dossier-carried, precomputed suggested questions, keyed by its
 *  human label (matched against the selected fact's row context). Relocated here
 *  from the deleted `HighlighterLayer` — the only thing that consumed it. */
export interface MetricSuggestion {
  label: string;
  suggestions: string[];
  /** Provenance carried so the popup's "File this figure" can build a `metric`
   *  ProjectItem with its source + freshness pinned at save time. Optional so
   *  pre-lift brains and prose selections still type-check. */
  value?: string;
  sourceUrl?: string;
  sourceLabel?: string;
  freshnessToken?: string;
}

/** The report the active /r/* page is grounded on. Null off-report. */
export interface ReportContext {
  /** Encoded surface id (`buildReportId(...)`) — grounding + per-report thread key. */
  reportId: string;
  conclusion?: string;
  freshnessToken?: string;
  metricSuggestions: MetricSuggestion[];
}

let active: ReportContext | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

/** Two contexts are "the same" when the load-bearing fields match — so a same-mount
 *  re-publish (the bridge's update effect re-firing with unchanged props) is a no-op
 *  and can't loop `useSyncExternalStore`. */
function same(a: ReportContext | null, b: ReportContext | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.reportId === b.reportId &&
    a.conclusion === b.conclusion &&
    a.freshnessToken === b.freshnessToken &&
    a.metricSuggestions === b.metricSuggestions
  );
}

/** The active report context, or null off-report. Stable reference between changes
 *  (the `useSyncExternalStore` getSnapshot contract). */
export function getReportContext(): ReportContext | null {
  return active;
}

/** Make this report the active context (the per-report bridge on load). No-ops the
 *  notify when unchanged so a re-seed during render can't loop the store. */
export function publishReportContext(ctx: ReportContext): void {
  if (same(active, ctx)) return;
  active = ctx;
  notify();
}

/** Clear the active context (leaving /r/* for an off-report page). */
export function clearReportContext(): void {
  if (active === null) return;
  active = null;
  notify();
}

export function subscribeReportContext(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** React binding — the root pill + highlighter read this. SSR snapshot is always null. */
export function useReportContext(): ReportContext | null {
  return useSyncExternalStore(subscribeReportContext, getReportContext, () => null);
}

/** Test-only: reset module state between cases. */
export function __resetReportContextForTest(): void {
  active = null;
  listeners.clear();
}

// ---------------------------------------------------------------------------
// Dossier-suggestion resolvers (relocated verbatim from HighlighterLayer — the
// only consumer was that layer; now it's GlobalHighlighter). Pure functions.
// ---------------------------------------------------------------------------

/**
 * Pick the dossier-carried suggestions for the selected fact by matching its
 * row context (the table's metric label) to a carried metric label. Falls back
 * to the client `suggestionsForSelection` generator when there is no dossier match
 * (a prose selection, a pre-lift brain, or a value with no row label).
 */
export function resolveSuggestions(fact: SelectedFact, carried: MetricSuggestion[]): string[] {
  const ctx = fact.context?.trim().toLowerCase();
  if (ctx) {
    const hit = carried.find((m) => m.label.trim().toLowerCase() === ctx);
    if (hit && hit.suggestions.length > 0) return hit.suggestions;
  }
  // No carried metric match → type-aware chips. NEVER "What's driving <raw
  // value>" — that produced "What's driving 2026-06-09" and "What's driving our
  // freshness token". suggestionsForSelection routes token / date / place /
  // bare-number to sensible chips instead.
  return suggestionsForSelection(fact.text, fact.factType);
}

/**
 * Pick the full carried metric (value + provenance) for the selected fact by the
 * same row-context label match as `resolveSuggestions`. Returns null for prose
 * selections or values with no matching row label — the popup then falls back to
 * the raw selection text + the page freshness token when filing a figure.
 */
export function resolveMetric(
  fact: SelectedFact,
  carried: MetricSuggestion[],
): MetricSuggestion | null {
  const ctx = fact.context?.trim().toLowerCase();
  if (!ctx) return null;
  return carried.find((m) => m.label.trim().toLowerCase() === ctx) ?? null;
}
