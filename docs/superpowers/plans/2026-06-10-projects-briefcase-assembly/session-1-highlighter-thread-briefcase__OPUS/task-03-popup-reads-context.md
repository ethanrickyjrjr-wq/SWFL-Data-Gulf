# Task 03 — `HighlightPopup` reads thread from context (delete local state)

**Context (verified):** `HighlightPopup.tsx` owns `thread: ChatEntry[]` (line 47), `activeQuestion` (line 48), and a local `ChatEntry` interface (lines 11-14). Replace local thread ownership with the provider's `thread(reportId)` / `archiveExchange`. Reopen must render the prior thread condensed (question-line collapsed, tap to expand).

**Files:**
- Modify: `components/highlighter/HighlightPopup.tsx`

- [ ] **Step 1: Remove the local `ChatEntry` interface** (lines 11-14) and import it from context: `import { useHighlighterContext, type ChatEntry } from "@/lib/highlighter/context";`.

- [ ] **Step 2: Replace `const [thread, setThread] = useState<ChatEntry[]>([])`** with context reads:

```tsx
const ctx = useHighlighterContext();
const reportId = /* the popup already knows its reportId — confirm the prop/source */;
const thread = ctx?.thread(reportId) ?? [];
```

When an exchange completes (the existing place that did `setThread((t) => [...t, {question, answer}])`), call `ctx?.archiveExchange(reportId, { question, answer })` instead. Keep `activeQuestion` local (it's transient live state), or move it too if cleaner — but do NOT introduce a `setState`-in-effect to sync it.

- [ ] **Step 3: Condensed re-render on reopen.** Render archived entries with the question visible and the answer collapsed behind a tap-to-expand (`<details>` or a local `expandedSet` toggled by click — a click handler, not an effect). The live/active exchange renders fully.

- [ ] **Step 4: Verify no `setState`-in-effect was introduced.** Run the linter on the file:

```bash
bunx eslint components/highlighter/HighlightPopup.tsx
```

Expected: no `react-hooks/set-state-in-effect` errors. If you see one, you derived state in an effect — move it to render or an event callback.

- [ ] **Step 5: Manual smoke.** `bun run dev` → `/r/master` → ask a question → close popup → re-highlight/reopen → prior thread shows condensed. Tap an entry → expands.

- [ ] **Step 6: Commit.**

```bash
git add components/highlighter/HighlightPopup.tsx
git commit -m "feat(highlighter): popup reads thread from provider; condensed reopen"
```
