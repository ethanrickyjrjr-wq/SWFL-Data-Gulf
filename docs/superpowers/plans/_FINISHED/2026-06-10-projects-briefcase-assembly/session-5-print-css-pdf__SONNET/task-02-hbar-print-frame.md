# Task 02 — HBarChart `beforeprint` final-width frame

**Context (verified):** `HBarChart.tsx:92-126` uses gsap to animate bar width `0 → ${pcts[i]}%`. If the user prints before/while the animation runs, bars render at `width:0`. Add a `beforeprint` listener that snaps bars to their final widths.

**Files:** Modify `components/charts/HBarChart.tsx`.

- [ ] **Step 1:** Add a `beforeprint` window listener (added/removed in a `useEffect` with cleanup — note: *adding an event listener* in an effect is fine; the banned pattern is calling `setState` in the effect body. This listener calls gsap.set, not setState):

```ts
useEffect(() => {
  const onBeforePrint = () => {
    // snap every bar to its final width immediately
    bars.forEach((el, i) => gsap.set(el, { width: `${pcts[i]}%` }));
  };
  window.addEventListener("beforeprint", onBeforePrint);
  return () => window.removeEventListener("beforeprint", onBeforePrint);
}, [pcts]);
```

Reference the same `bars`/`pcts` the animation uses (read the existing gsap block to reuse its refs). styled-jsx class names are targetable from `globals.css` but watch specificity — prefer the gsap.set approach over CSS for the width snap.

- [ ] **Step 2: Verify** — desktop print preview of an `/r/` page with a bar chart shows full-width bars even when invoked immediately on load.

- [ ] **Step 3: Commit.** `git add components/charts/HBarChart.tsx && git commit -m "feat(pdf): HBarChart beforeprint final-width frame (no zero-width bars)"`
