"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { type ProjectItem } from "@/lib/project/items";
import {
  addItem,
  removeItemById,
  loadDraftFrom,
  saveDraftTo,
  browserStorage,
  DRAFT_CAP,
} from "@/lib/briefcase/draft";

/**
 * Root-mounted provider that owns the anonymous draft project (the "briefcase").
 * Extracted from HighlighterProvider (A-2) and mounted ONCE in the root layout so
 * the draft is global — the unified pill files into it on every page, on or off
 * /r/*. The highlighter conversation thread stays in HighlighterProvider
 * (per-/r/* page); only the draft moved here.
 *
 * Persistence is event-driven (the localStorage write lives INSIDE the setter
 * callbacks; the initial read is the useState lazy initializer) — this repo
 * treats react-hooks/set-state-in-effect as a hard error, so there is NO effect.
 */

export interface BriefcaseContextValue {
  draftItems: ProjectItem[];
  fileItem: (item: ProjectItem) => void;
  removeItem: (id: string) => void;
  /** True when the draft is within 5 of the cap — UI shows a "sign in to save" nudge. */
  draftNearCap: boolean;
}

const BriefcaseContext = createContext<BriefcaseContextValue | null>(null);

/** Returns the briefcase value, or null when no provider is in the tree (non-throwing). */
export function useBriefcase(): BriefcaseContextValue | null {
  return useContext(BriefcaseContext);
}

export function BriefcaseProvider({ children }: { children: ReactNode }) {
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

  const value = useMemo<BriefcaseContextValue>(
    () => ({ draftItems, fileItem, removeItem, draftNearCap }),
    [draftItems, fileItem, removeItem, draftNearCap],
  );

  return <BriefcaseContext.Provider value={value}>{children}</BriefcaseContext.Provider>;
}
