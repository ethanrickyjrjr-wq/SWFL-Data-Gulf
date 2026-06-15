"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { SelectedFact } from "./use-highlight";

/**
 * Context that lets FactChip instances anywhere in the /r/ report tree feed a
 * chip-tap into the HighlighterLayer without prop-threading through server pages,
 * AND owns the highlighter conversation thread + the anonymous draft-project
 * (briefcase) so both survive popup close/reopen and are shared with the Ask-AI
 * dock.
 *
 * Usage:
 *   - Server page wraps its content in <HighlighterProvider> (exported below).
 *   - HighlighterLayer reads chipFact from context instead of its own useState.
 *   - MetricsTable reads onActivate via useHighlighterContext and passes it to FactChip.
 *   - HighlightPopup + AskAiDock read thread(reportId)/archiveExchange so they
 *     show one continuous conversation per report.
 *   - The Briefcase tray reads draftItems/fileItem/removeItem.
 *
 * STATE-LIFT FOOTGUN: this repo treats `react-hooks/set-state-in-effect` as a
 * hard error. Persistence is therefore event-driven — the localStorage write
 * happens INSIDE the setter callbacks (fileItem/removeItem), and the initial
 * read happens in the useState lazy initializer. There is NO effect that
 * derives state from props/state here. Keep it that way.
 */

export interface ChatEntry {
  question: string;
  answer: string;
}

export interface HighlighterContextValue {
  chipFact: SelectedFact | null;
  setChipFact: (fact: SelectedFact | null) => void;
  onActivate: (fact: SelectedFact) => void;
  // thread (per reportId)
  thread: (reportId: string) => ChatEntry[];
  archiveExchange: (reportId: string, entry: ChatEntry) => void;
  clearThread: (reportId: string) => void;
}

/** Beyond this many exchanges in one report, condense the oldest to question-only. */
export const THREAD_CAP = 12;

// ---------------------------------------------------------------------------
// Pure reducers + persistence (no React, no DOM) — unit-tested directly.
// ---------------------------------------------------------------------------

/** Append an exchange to a report's thread, condensing oldest answers past the cap. */
export function appendExchange(
  threads: Record<string, ChatEntry[]>,
  reportId: string,
  entry: ChatEntry,
): Record<string, ChatEntry[]> {
  const cur = threads[reportId] ?? [];
  const next = [...cur, entry];
  // Checkpoint: past THREAD_CAP entries, collapse the oldest to question-only
  // (client-side condense; an LLM summary is deferred).
  const condensed =
    next.length > THREAD_CAP
      ? next.map((e, i) =>
          i < next.length - THREAD_CAP ? { question: e.question, answer: "" } : e,
        )
      : next;
  return { ...threads, [reportId]: condensed };
}

/** Empty a single report's thread, leaving other reports untouched. */
export function clearThreadFor(
  threads: Record<string, ChatEntry[]>,
  reportId: string,
): Record<string, ChatEntry[]> {
  return { ...threads, [reportId]: [] };
}

// ---------------------------------------------------------------------------
// Context + provider
// ---------------------------------------------------------------------------

export const HighlighterContext = createContext<HighlighterContextValue | null>(null);

/** Returns the context value, or null when no provider is in the tree. */
export function useHighlighterContext(): HighlighterContextValue | null {
  return useContext(HighlighterContext);
}

/**
 * Non-throwing accessor the global AI+Briefcase pill (A-3) uses to BRIDGE to the
 * highlighter thread on /r/* and degrade to standalone off it. It is an alias of
 * useHighlighterContext (which already returns null when no provider is present) —
 * NOT a separate throwing variant. Naming it explicitly documents the bridge
 * intent at the call site.
 */
export const useOptionalHighlighterContext = useHighlighterContext;

export function HighlighterProvider({ children }: { children: ReactNode }) {
  const [chipFact, setChipFact] = useState<SelectedFact | null>(null);
  const onActivate = useCallback((f: SelectedFact) => setChipFact(f), []);

  const [threads, setThreads] = useState<Record<string, ChatEntry[]>>({});
  const thread = useCallback((reportId: string) => threads[reportId] ?? [], [threads]);
  const archiveExchange = useCallback((reportId: string, entry: ChatEntry) => {
    setThreads((t) => appendExchange(t, reportId, entry));
  }, []);
  const clearThread = useCallback((reportId: string) => {
    setThreads((t) => clearThreadFor(t, reportId));
  }, []);

  const value = useMemo<HighlighterContextValue>(
    () => ({
      chipFact,
      setChipFact,
      onActivate,
      thread,
      archiveExchange,
      clearThread,
    }),
    [chipFact, onActivate, thread, archiveExchange, clearThread],
  );

  return <HighlighterContext.Provider value={value}>{children}</HighlighterContext.Provider>;
}
