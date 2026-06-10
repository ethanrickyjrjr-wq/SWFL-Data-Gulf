"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { SelectedFact } from "./use-highlight";
import { projectItemsSchema, type ProjectItem } from "@/lib/project/items";

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
  // draft project (briefcase)
  draftItems: ProjectItem[];
  fileItem: (item: ProjectItem) => void;
  removeItem: (id: string) => void;
  /** True when the draft is within 5 of the cap — tray shows a "sign in to save" nudge. */
  draftNearCap: boolean;
}

export const DRAFT_KEY = "swfl_project_draft_v1";
export const DRAFT_CAP = 50;
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

/** Append an item to the draft, keeping only the most recent DRAFT_CAP. */
export function addItem(items: ProjectItem[], item: ProjectItem): ProjectItem[] {
  return [...items, item].slice(-DRAFT_CAP);
}

/** Remove a draft item by id. */
export function removeItemById(items: ProjectItem[], id: string): ProjectItem[] {
  return items.filter((i) => i.id !== id);
}

/** Read + validate the draft from a Storage-like source. Returns [] on any failure. */
export function loadDraftFrom(storage: Pick<Storage, "getItem"> | null | undefined): ProjectItem[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(DRAFT_KEY);
    return raw ? projectItemsSchema.parse(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

/** Write the draft to a Storage-like sink. Swallows quota errors (caller warns via draftNearCap). */
export function saveDraftTo(
  storage: Pick<Storage, "setItem"> | null | undefined,
  items: ProjectItem[],
): void {
  if (!storage) return;
  try {
    storage.setItem(DRAFT_KEY, JSON.stringify(items));
  } catch {
    /* quota — surfaced to the user via the draftNearCap nudge, not thrown */
  }
}

function browserStorage(): Storage | null {
  return typeof window !== "undefined" ? window.localStorage : null;
}

// ---------------------------------------------------------------------------
// Context + provider
// ---------------------------------------------------------------------------

export const HighlighterContext = createContext<HighlighterContextValue | null>(null);

/** Returns the context value, or null when no provider is in the tree. */
export function useHighlighterContext(): HighlighterContextValue | null {
  return useContext(HighlighterContext);
}

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

  // Lazy initializer reads localStorage exactly once (no effect, SSR-guarded).
  const [draftItems, setDraftItems] = useState<ProjectItem[]>(() =>
    loadDraftFrom(browserStorage()),
  );
  const fileItem = useCallback((item: ProjectItem) => {
    setDraftItems((items) => {
      const next = addItem(items, item);
      saveDraftTo(browserStorage(), next); // write-through INSIDE the callback — not an effect
      return next;
    });
  }, []);
  const removeItem = useCallback((id: string) => {
    setDraftItems((items) => {
      const next = removeItemById(items, id);
      saveDraftTo(browserStorage(), next);
      return next;
    });
  }, []);

  // Derived during render (NOT an effect): warn when nearing the draft cap.
  const draftNearCap = draftItems.length >= DRAFT_CAP - 5;

  const value = useMemo<HighlighterContextValue>(
    () => ({
      chipFact,
      setChipFact,
      onActivate,
      thread,
      archiveExchange,
      clearThread,
      draftItems,
      fileItem,
      removeItem,
      draftNearCap,
    }),
    [
      chipFact,
      onActivate,
      thread,
      archiveExchange,
      clearThread,
      draftItems,
      fileItem,
      removeItem,
      draftNearCap,
    ],
  );

  return <HighlighterContext.Provider value={value}>{children}</HighlighterContext.Provider>;
}
