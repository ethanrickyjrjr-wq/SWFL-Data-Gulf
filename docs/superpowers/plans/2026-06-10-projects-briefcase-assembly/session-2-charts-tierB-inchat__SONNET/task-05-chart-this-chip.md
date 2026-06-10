# Task 05 — "Chart this" chip in `suggestions.ts`

**Context (verified):** `lib/highlighter/suggestions.ts` generates suggestion chips (`suggestionsForMetric`, `suggestionsForSpan`, `suggestionsForSelection`, `deriveSelectionType`). Add a "Chart this" chip for metric/place selections, phrased so it hits `routeChart` (Task 03) and produces an inline chart.

**Files:**
- Modify: `lib/highlighter/suggestions.ts`
- Test: `lib/highlighter/suggestions.test.ts` (if present; else add)

- [ ] **Step 1: Add the chip.** For selection types `metric` and `place`, prepend a chip whose text is phrased to match a `routeChart` keyword for the relevant scope (e.g. a rent metric → "Chart asking rents across the corridors"; a place → "How is {place} doing?" only if vitals were live — since vitals is deferred, prefer a scope that resolves, e.g. flood or rent). Keep chips that won't route OUT (don't offer "Chart this" when no scope resolves — a dead chip is worse than none).

- [ ] **Step 2: Test routing alignment.** Add a test asserting the generated "Chart this" chip text, when fed to `routeChart`, returns a non-null intent (so the chip never dead-ends).

```ts
import { routeChart } from "@/lib/route-chart";
// for each generated chart chip: expect(routeChart(chipText)).not.toBeNull();
```

- [ ] **Step 3: Run tests green; manual smoke** — select a rent metric → "Chart this" chip appears → click → inline chart renders.

- [ ] **Step 4: Commit, then ship the session.**

```bash
git add lib/highlighter/suggestions.ts lib/highlighter/suggestions.test.ts
git commit -m "feat(charts): 'Chart this' chip routed to buildChartForIntent"
```

> Ship per `../shared/conventions.md`. **Diff-review gate applies (Task 03 touched `/api/converse`)** — show the operator the converse diff before pushing. Flip build-queue item 2 → `[x]`.
