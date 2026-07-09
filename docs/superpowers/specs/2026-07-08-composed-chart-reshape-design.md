# Wire Composed into the reshape picker

Status: approved · 2026-07-08

## Why

`components/charts/vendor/bklit/NOTICE.md` records that Bar/Line/Composed shells were
vendored and typecheck-clean but only Area got wired into a production call site
(`bklitTrendSvg` → zhvi-area). Operator: wire a few more now, starting with Composed —
"biggest visual jump" of the unwired shapes.

## Scope

Email Lab's reshape picker only. `reshapeChartToType` has exactly one call site
(`lib/email/build-doc.ts:267`), feeding `chartSpecToEmailSvg` (`lib/email/spec-to-png.ts`)
for the email PNG. No live-chat/deck registry frame involved.

## Design

**New `ChartType`:** `"composed"` in `CHART_TYPE_OPTIONS`
(`lib/email/reshape-chart-type.ts`) — `{ type: "composed", label: "Bar + trend line" }`.
The picker UI (`components/email-lab/EmailLabGridShell.tsx:1235`) needs no change; it
already maps over `CHART_TYPE_OPTIONS` generically.

**`chartTypeFits`:** `composed` joins the `bar`/`dotplot` bucket — any ≥2-point spec
fits, no delta required, never guardrail-falls-back to bar.

**`reshapeChartToType` new case** — mirrors the `dotplot` case's mean derivation (MOAT:
same non-invented number, mean of already-plotted points, labeled "average") shaped for
a bar+line combo instead of scatter+reference:

```ts
case "composed": {
  const avg = Math.round(pts.reduce((a, p) => a + p.value, 0) / pts.length);
  return {
    ...base,
    columns: cols,
    rows: pts.map((p) => [p.label, p.value]),
    chart_type: "bar",
    frameId: "composed-bar-line",
    options: {
      items: pts.map((p) => ({ label: p.label, value: p.value })),
      average: avg,
      averageLabel: "average",
    },
  } as ChartSpec;
}
```

**Render wiring** — new builder `bklitComposedSvg` in
`components/charts/vendor/bklit/email-svg.tsx`, alongside `bklitTrendSvg`, same pattern
(real vendored component → `renderBklitStaticSvg` → chrome text overlay drawn outside the
bklit subtree):

```tsx
<ComposedChart
  data={items.map((p) => ({ date: p.label, value: p.value, average: avg }))}
  staticSize={{ width: W, height: H }}
  xDataKey="date"
>
  <Grid horizontal stroke="#EAECEF" />
  <SeriesBar dataKey="value" fill={accent} />
  <Line dataKey="average" stroke="#6B7280" strokeWidth={2} />
</ComposedChart>
```

`chartSpecToEmailSvg` gets a new `case "composed-bar-line":` in the frameId switch,
calling `bklitComposedSvg`. RULE 0.7 fallback if it returns null (bad render, not bad
data): fall through to the existing bar-table path via `specToBars` + `barChartSvg`.

## Testing

- `lib/email/reshape-chart-type.test.ts`: add a `composed` case asserting `frameId ===
  "composed-bar-line"` and the mean math, mirroring the existing `dotplot` test.
- `lib/email/spec-to-png.test.ts`: add a case asserting `chartSpecToEmailSvg` returns a
  non-null SVG containing both a `<rect` (bar) and a line path for a `composed-bar-line`
  spec.

## Out of scope

- Live-chat/deck `CHART_REGISTRY` frame for composed (reshape picker only touches email).
- Wiring Bar or Line standalone (separate increments, per NOTICE.md's punch list).
- Delta-line variant (approved: mean-line only, for universal fit — no new guardrail).
