import { projectItemsSchema, type ProjectItem } from "@/lib/project/items";

/**
 * Pure draft-project (briefcase) reducers + persistence — no React, no DOM.
 * Unit-tested directly in draft.test.ts. Extracted from lib/highlighter/context.tsx
 * (A-2) so the anonymous draft can live in a root BriefcaseProvider, decoupled
 * from the per-/r/* highlighter thread state.
 *
 * STATE-LIFT FOOTGUN (carried over): this repo treats
 * `react-hooks/set-state-in-effect` as a hard error. Persistence is therefore
 * event-driven — the localStorage write happens INSIDE the provider's setter
 * callbacks (fileItem/removeItem), and the initial read happens in the useState
 * lazy initializer. There is NO effect deriving state from props/state.
 */

export const DRAFT_KEY = "swfl_project_draft_v1";
export const DRAFT_CAP = 50;

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

/** The browser's localStorage, or null under SSR. */
export function browserStorage(): Storage | null {
  return typeof window !== "undefined" ? window.localStorage : null;
}
