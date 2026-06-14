# Task 06 — `[ADDED]` Restyle without a new LLM call

**Why:** content is already separate from template (Task 02). Re-rendering the SAME narrative + items under a DIFFERENT template is free and instant — the Gamma/Perplexity-Labs "cheap restyle." Gives the user 4 looks for one build cost.

**Files:** Modify `app/api/projects/[id]/build/route.ts` (or a tiny `PATCH /api/deliverables/[id]/restyle`), `app/p/[id]/page.tsx`.

- [ ] **Step 1:** Add a restyle path that takes an existing deliverable + a new `template`, calls `buildRenderModel(newTemplate, deliverable.narrative, deliverable.items_snapshot, branding)` — **no Anthropic call** — and either updates the row's `template` or writes a sibling deliverable. (Pick update-in-place for v1; the slug stays shareable.)
- [ ] **Step 2:** `/p/[id]` gets a template switcher (`.print-hide`) that calls the restyle path and re-renders. Since no LLM runs, it's instant; do NOT meter it as a `build` (it's free) — or meter a distinct `restyle` action if the operator wants the signal.
- [ ] **Step 3: Verify** switching `one-pager` → `bov-lite` re-renders the same facts/narrative under the new structure with no new build latency and no new LLM cost.
- [ ] **Step 4: Commit.** `git add "app/api/projects/[id]/build/route.ts" "app/p/[id]/page.tsx" && git commit -m "feat(deliverable): [ADDED] restyle template swap with no new LLM call"`
