# Chart As-Of Anchoring — Spec

**Status:** Not started. Check `chart_asof_anchoring`. Not push-blocking.

---

## The Problem

`buildRentChart` bakes the date into the title: "...NNN Asking Rents — Jun 2026". Anchored, but in the wrong place (title reads awkward).

`buildZhviChart` and `buildScatterChart` return bare arrays with no `asOf` field. ChartBlockView renders title + geometry only. Numbers on screen have no date. That's the inconsistency.

---

## Rule 1 — Every builder carries `asOf`

Every builder in `lib/build-chart-for-intent.mts` must return an `asOf: string` on the result object, regardless of chart type.

```ts
// Today (wrong):
return { component: "zhvi", data: rows }

// After fix:
return { component: "zhvi", data: rows, asOf: "Jun 2026" }
```

The rent chart currently puts the date in the title — remove it from the title, put it in `asOf` with the rest. Title should be clean; provenance lives in the caption.

---

## Rule 2 — Bottom caption, not the title

Render location: **one line beneath the plot**, small + muted.

```
as of Jun 2026 · SWFL fixture sample
```

Style: monospace ~11px, `color: var(--text-3)` (dimmed). The same monospace already in use. Does not fight the data. Always present when `asOf` is set.

NOT in the title. The title carries the subject ("Asking Rents across Corridors"), the caption carries the vintage.

---

## Rule 3 — Uniform-vintage chart (common case)

All series share the same vintage (e.g., rents Jun 2026, vacancy Jun 2026).

→ **One caption at the bottom:** `as of Jun 2026`. Done.

---

## Rule 4 — Mixed-vintage chart (two options, pick option A)

Series differ in vintage (e.g., ZHVI is Apr 2026, rents are Jun 2026).

**Option A (preferred):** Tag the series in the legend, one combined caption.

```
Legend:  Rents (Jun)  /  ZHVI (Apr)
Caption: 2026 · SWFL fixture sample
```

The month attaches to the series it describes. The year lives in the caption once. Clean — the eye only sees a month next to the thing it modifies.

**Option B (when gap is misleading):** Refuse to co-plot. Builder returns `null` (or an error result), chat says: "These are from different months — want them side-by-side as two charts instead?" Pushes the judgment to the user rather than silently drawing a misleading comparison.

Use option B when the vintage gap is ≥ one quarter. Use option A for anything less.

---

## Rule 5 — Build view vs. print view

**The invariant:** `asOf` always follows into the build payload and into the print payload. It is never stripped. The render template decides how loud to be — not whether the field exists.

| Context | Uniform vintage | Mixed vintage |
|---|---|---|
| **Build view** | Caption on every chart | Caption on every chart |
| **Print/PDF view** | One "Data as of Jun 2026" cover stamp; no per-chart captions | Cover stamp + per-chart caption only on the deviating charts |

This means: build template always shows it (full detail, always honest), print template collapses it to one stamp when vintages are uniform (no dates cluttering every chart). If you change your mind on print granularity later, only the template changes — the data object is already complete.

---

## Implementation Touchpoints

1. **`lib/build-chart-for-intent.mts`**
   - Add `asOf?: string` to each return type in the `ChartResult` union
   - Remove date from `buildRentChart` title string; move it to `asOf`
   - Add `asOf` to `buildZhviChart`, `buildScatterChart`, `buildVacancyChart` returns

2. **`components/charts/ChartBlockView.tsx`**
   - Render bottom caption when `asOf` present: `<p className="chart-caption">as of {asOf} · SWFL fixture sample</p>`
   - Style: monospace 11px, `--text-3`

3. **`components/viz/ZHVIAreaChart.tsx` + `CorridorMarketScatter.tsx`**
   - Accept `asOf?: string` prop
   - Render the same bottom caption

4. **`HighlightPopup.tsx` + `AskAiDock.tsx`**
   - Pass `asOf` from the `LiveChart` discriminated union down to the component

5. **Print template (S6 or whenever PDF ships)**
   - Implement the uniform-vintage → cover-stamp collapse logic at render time

---

## SSE Parse Test Gap (related, different file)

`sse.test.ts` covers `text` / `done` / `error` frames. `converse.test.ts` covers text accumulator + `⟦FOLLOWUPS⟧` tail. Neither tests a leading `data: {"chart":{...}}\n\n` frame ahead of the text stream.

The 9 builder tests prove chart content. They don't prove the client splits the chart frame from prose without corrupting the text accumulator. Failure is swallowed (chart missing silently), but a malformed-but-parsed frame is the gap.

**Fix:** One parse test in `use-converse` (or `sse.test.ts`) that emits `data: {"chart":{...}}\n\ndata: {"text":"hello"}\n\ndata: {"done":true}\n\n` and asserts:
- `chart` state is set to the chart object
- `answer` accumulates to `"hello"` (no chart JSON leaked into prose)

Not push-blocking. Add next time in `use-converse` or `sse.test.ts`.
