# Task 04 — `AskAiDock` shares the same thread via context

**Context (verified):** `AskAiDock.tsx` owns its own `history` (line 62), `activeQuestion`, `answer`. It does NOT share thread state with the popup. Point it at the provider so the dock and popup show one continuous conversation per report.

**Files:**
- Modify: `components/highlighter/AskAiDock.tsx`
- (touch) `components/highlighter/AskAi.tsx` only if the `reportId` needs threading down (it's already passed `reportId` per the audit: `<AskAi reportId=… />`).

- [ ] **Step 1: Replace local `history` with context thread.** Import `useHighlighterContext`; read `ctx?.thread(reportId)`; on exchange completion call `ctx?.archiveExchange(reportId, {question, answer})`. Keep the dock's geometry/`swfl_ai_dock_geom` persistence untouched.

- [ ] **Step 2: Guard for no-provider.** The dock may mount where no `HighlighterProvider` is in the tree → `useHighlighterContext()` returns null. Fall back to a local `useState` thread in that case (keep today's behavior) so the dock never crashes. Pattern:

```tsx
const ctx = useHighlighterContext();
const [localThread, setLocalThread] = useState<ChatEntry[]>([]);
const thread = ctx ? ctx.thread(reportId) : localThread;
const archive = (e: ChatEntry) => ctx ? ctx.archiveExchange(reportId, e) : setLocalThread((t) => [...t, e]);
```

- [ ] **Step 3: Lint** (`bunx eslint components/highlighter/AskAiDock.tsx`) — no set-state-in-effect.

- [ ] **Step 4: Manual smoke.** On a report with both the popup and dock: ask in the popup, open the dock → same thread visible; ask in the dock → popup reopen shows it too.

- [ ] **Step 5: Commit.**

```bash
git add components/highlighter/AskAiDock.tsx components/highlighter/AskAi.tsx
git commit -m "feat(highlighter): dock shares thread with popup via provider (null-safe)"
```
