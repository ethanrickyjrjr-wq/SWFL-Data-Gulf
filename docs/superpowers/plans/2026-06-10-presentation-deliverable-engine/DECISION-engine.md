# DECISION — Chart engine: own `ChartSpec` registry (LOCKED)

**Decided 2026-06-10 by operator. Do not re-litigate.**

## Decision
Build a **typed `ChartSpec` registry that extends the existing `ChartBlock`** and drives our current
Recharts/ECharts components + the UI-Kit SVG designs. **NOT Vega-Lite.**

## Why (the evidence pass — per RULE 3 C1, imported best-practice → web refutation done)
- The field has converged on **declarative chart specs over generated chart code** for LLM-driven
  charts: secure (no eval of model-written code), maintainable, and user-modifiable. Sources: VegaChat
  (arxiv 2601.15385), Chat2Plot, LIDA, Tinybird, Highcharts-for-LLM. So a *declarative spec registry*
  is correct.
- **Vega-Lite vs own spec** is then a brand/dependency call, not a correctness call:
  - The deliverable is **client-facing — our look IS the product.** Vega-Lite would force a restyle to
    match brand + a heavy new dependency.
  - We **already own** Recharts/ECharts + the UI-Kit designs (`HBarChart`, `ZHVIAreaChart`,
    `CorridorMarketScatter`, the 6 UI-Kit SVGs). Extending `ChartBlock` keeps that investment.
  - We get the declarative-spec safety/theming/templating benefits **without** the restyle or dep.

## The anti-handcuff property (why this scales)
Every future *"can it also…"* becomes a field on the spec or a new file in
`components/charts/registry/` — **never code surgery**:
- New chart → one frame file, registered once, available to every project + template.
- Customer colors → a `theme` token resolved at render (Phase 6), not baked per chart.
- Save templates → serialize the ordered frame list (Phase 5).

## Fallback (only if it ever fails)
If frame coverage explodes beyond what hand-built components can serve economically, revisit Vega-Lite
as an *additional* renderer behind the same `ChartSpec` — not a replacement of the registry.
