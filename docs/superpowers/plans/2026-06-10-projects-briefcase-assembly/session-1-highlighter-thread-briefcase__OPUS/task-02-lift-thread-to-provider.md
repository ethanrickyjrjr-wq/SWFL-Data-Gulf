# Task 02 — Grow `HighlighterProvider` with thread + draft-project state

**Context (verified):** `lib/highlighter/context.tsx` today holds only `chipFact`/`setChipFact`/`onActivate`. Thread state lives locally in `HighlightPopup` (`thread: ChatEntry[]`, `activeQuestion`). We lift thread + a draft-project list into the provider with `localStorage` write-through. Precedent for the persistence pattern: `AskAiDock.tsx:14,29-39,98-104` (`swfl_ai_dock_geom`).

**HARD RULE:** never `setState` inside a `useEffect` body (repo's `react-hooks/set-state-in-effect` is a build-blocking error). `localStorage` writes go in the **setter callbacks** (event-driven), not in effects derived from state. Initial read happens in the `useState` initializer (lazy init), guarded for SSR.

**Files:**
- Modify: `lib/highlighter/context.tsx`
- Test: `lib/highlighter/context.test.tsx`

- [ ] **Step 1: Write a failing provider test** (`lib/highlighter/context.test.tsx`, jsdom) covering: archive an exchange → thread for that reportId grows; file an item → draftItems grows + localStorage written; clearThread empties only that reportId:

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { HighlighterProvider, useHighlighterContext } from "./context";

const wrap = ({ children }: { children: React.ReactNode }) => <HighlighterProvider>{children}</HighlighterProvider>;

beforeEach(() => localStorage.clear());

describe("HighlighterProvider thread + draft", () => {
  it("archives an exchange under its reportId", () => {
    const { result } = renderHook(() => useHighlighterContext(), { wrapper: wrap });
    act(() => result.current!.archiveExchange("env-swfl", { question: "q", answer: "a" }));
    expect(result.current!.thread("env-swfl")).toHaveLength(1);
    expect(result.current!.thread("other")).toHaveLength(0);
  });
  it("files a draft item and persists it", () => {
    const { result } = renderHook(() => useHighlighterContext(), { wrapper: wrap });
    act(() => result.current!.fileItem({ id: "1", added_at: "t", origin: "web", kind: "note", text: "hi" }));
    expect(result.current!.draftItems).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem("swfl_project_draft_v1")!)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.** `bun test lib/highlighter/context.test.tsx`

- [ ] **Step 3: Extend the context value + provider.** Add to `HighlighterContextValue`:

```ts
export interface ChatEntry { question: string; answer: string }

export interface HighlighterContextValue {
  chipFact: SelectedFact | null;
  setChipFact: (fact: SelectedFact | null) => void;
  onActivate: (fact: SelectedFact) => void;
  // thread (per reportId)
  thread: (reportId: string) => ChatEntry[];
  archiveExchange: (reportId: string, entry: ChatEntry) => void;
  clearThread: (reportId: string) => void;
  // draft project
  draftItems: ProjectItem[];
  fileItem: (item: ProjectItem) => void;
  removeItem: (id: string) => void;
}
```

Provider implementation — note the **lazy initializer** reads localStorage once (no effect), and `fileItem`/`removeItem` write through inside the callback:

```ts
const DRAFT_KEY = "swfl_project_draft_v1";
const DRAFT_CAP = 50;

function loadDraft(): ProjectItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? projectItemsSchema.parse(JSON.parse(raw)) : [];
  } catch { return []; }
}
function saveDraft(items: ProjectItem[]) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(items)); } catch { /* quota — handled by caller warning */ }
}

export function HighlighterProvider({ children }: { children: ReactNode }) {
  const [chipFact, setChipFact] = useState<SelectedFact | null>(null);
  const onActivate = useCallback((f: SelectedFact) => setChipFact(f), []);

  const [threads, setThreads] = useState<Record<string, ChatEntry[]>>({});
  const thread = useCallback((reportId: string) => threads[reportId] ?? [], [threads]);
  const archiveExchange = useCallback((reportId: string, entry: ChatEntry) => {
    setThreads((t) => {
      const cur = t[reportId] ?? [];
      // checkpoint: >12 entries -> condense oldest to question-only (client-side; LLM summary deferred)
      const next = [...cur, entry];
      const condensed = next.length > 12
        ? next.map((e, i) => (i < next.length - 12 ? { question: e.question, answer: "" } : e))
        : next;
      return { ...t, [reportId]: condensed };
    });
  }, []);
  const clearThread = useCallback((reportId: string) =>
    setThreads((t) => ({ ...t, [reportId]: [] })), []);

  const [draftItems, setDraftItems] = useState<ProjectItem[]>(loadDraft);
  const fileItem = useCallback((item: ProjectItem) => {
    setDraftItems((items) => {
      const next = [...items, item].slice(-DRAFT_CAP);
      saveDraft(next);   // write-through INSIDE the callback — not an effect
      return next;
    });
  }, []);
  const removeItem = useCallback((id: string) => {
    setDraftItems((items) => {
      const next = items.filter((i) => i.id !== id);
      saveDraft(next);
      return next;
    });
  }, []);

  return (
    <HighlighterContext.Provider
      value={{ chipFact, setChipFact, onActivate, thread, archiveExchange, clearThread, draftItems, fileItem, removeItem }}>
      {children}
    </HighlighterContext.Provider>
  );
}
```

Add imports: `import { projectItemsSchema, type ProjectItem } from "@/lib/project/items";`.

- [ ] **Step 4: Run — expect PASS.** `bun test lib/highlighter/context.test.tsx`

- [ ] **Step 5: Quota-warning hook.** Expose a derived `draftNearCap = draftItems.length >= DRAFT_CAP - 5` (compute during render, do NOT effect) for the tray to show a "you're about to lose space — sign in to save" nudge (`[ADDED]`, ties to A5 future wall). Add it to the context value.

- [ ] **Step 6: Commit.**

```bash
git add lib/highlighter/context.tsx lib/highlighter/context.test.tsx
git commit -m "feat(highlighter): lift thread + draft-project state into HighlighterProvider"
```
