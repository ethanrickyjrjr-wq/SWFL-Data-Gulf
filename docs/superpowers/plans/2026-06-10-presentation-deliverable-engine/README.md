# Presentation Deliverable Engine — MASTER COPY

**Created 2026-06-10. This README is the single source of truth.** Each `phase-*` file is a
self-contained brief you copy-paste to the builder named in its `__OPUS` / `__SONNET` suffix.

> Goal: turn "4 charts and some words" into a **client-ready presentation** — a growing library of
> presentation-grade visuals (declarative `ChartSpec` frames), each self-anchored with its own as-of
> date, assembled by the AI into a **hosted `/p/[id]` page** (shareable link), with **PDF as a second
> surface of the same project**. The paid deliverable rides on server-rendered charts, not inline chat.

---

## FLYWHEEL USE CASE — the "Listing PDF maker" (LOCKED)
**This is the primary template use case — the reason templates exist.**
A saved template = a **pre-wired frame order** (flood risk → market comps → rent trajectory → cap-rate
context). User input = **one ZIP or address**. The system binds every frame's data automatically from
the live brains, stamps each frame's `asOf`, and builds the `/p/[id]` page **+** PDF.
**This is Phase 3 + Phase 5 working together — no new engine required.**

**Retention mechanic (the flywheel):** every new listing = **one command = one client-ready
deliverable.** The template accumulates value across sessions — the more listings it runs, the more it's
worth and the stickier the product. Phase 5 must therefore ship a **user-facing "run template"
invocation**: a named template ID the user calls with a single ZIP/address. Trivially cheap once Phase 3
+ Phase 5 exist; no new architecture.

---

## MUST-READ CONTRACT (every section inherits this)
1. **Engine = own `ChartSpec` registry extending `ChartBlock`. NOT Vega-Lite.** (LOCKED — see `DECISION-engine.md`.)
2. **Deliverable = hosted `/p/[id]` FIRST; PDF = export of the SAME project. One engine, two surfaces.**
3. **Per-visual as-of on EVERY frame.** A single cover stamp is allowed only as an ADDITIONAL summary,
   never a replacement — mixed-vintage decks (ZHVI, rents, flood AAL never share an as-of) would lie.
4. **`ChartBlock` type + `lintChartBlock` live in `refinery/validate/chart-block-lint.mts`** (type ~`:52`,
   lint ~`:94`). Import `type ChartBlock` from THERE, never `refinery/types`. Re-grep the line numbers
   before editing — treat them as hints, not gospel.
5. **`asOf` / `source.citation` are PROVENANCE.** Never run them through facts-only-lint, smoothing-lint,
   or `sanitizeProse` content policing — only synthesized `claim_text` is policed. New lint checks
   presence/format only.
6. **NO `git push`.** All work local; **Ricky pushes.** Each session: commit locally + add a top-of-file
   `SESSION_LOG.md` entry + reconcile `_AUDIT_AND_ROADMAP/build-queue.md`. Never push.
7. **Defer** slide deck + editable PPT/Docx until a paying customer requires them.

---

## Dependency graph & parallelization

```
Phase 0  (verify render)        ── SERIAL, FIRST, blocks all
   │
Phase 1  (keystone asOf)        ── SERIAL, EXCLUSIVE (lifts shared ChartBlock type)
   │
Phase 2a (ChartSpec scaffold)   ── SERIAL, EXCLUSIVE (defines the type seam)
   │
   ├── Phase 2b franchise-survival ┐
   ├── Phase 2c flood-composition  │
   ├── Phase 2d freight-zgauge     ├── PARALLEL (Sonnet, independent files)
   ├── Phase 2e seasonal-radial    │
   ├── Phase 2f storm-claims       ┘
   └── Phase 2g pick-frames-mapper ── parallel-ok with 2b–2f (needs only 2a)
   │
Phase 3  (assembly + /p/[id])   ── SERIAL, single owner (critical path; first LIVE-data binding)
   │
   ├── Phase 4 PDF export  ┐
   └── Phase 5 templates   ┘── PARALLEL (disjoint)
   │
Phase 6  (brand theming)        ── last; needs Phase 2 + 3
```

**MUST NOT run in parallel:** Phase 1, Phase 2a, Phase 3 (each is an exclusive single-owner type seam
or the critical-path engine). Everything marked PARALLEL above is safe to fan out.

---

## Status board (flip as sections land)

| # | Section | File | Builder | Depends on | Status |
|---|---------|------|---------|-----------|--------|
| 0 | Verify render | `phase-0-verify-render__OPUS.md` | Opus | — | ✅ 2026-06-10 → `phase-0-VERDICT.md` |
| 1 | Keystone as-of | `phase-1-keystone-asof__OPUS.md` | Opus | 0 | ✅ 2026-06-10 (local) — `asOf`+`source` on `ChartBlock`; lint warn/error; caption live on `/r/` |
| 2a | ChartSpec scaffold | `phase-2a-chartspec-registry-scaffold__OPUS.md` | Opus | 1 | ✅ 2026-06-11 (PUSHED) — `components/charts/registry/` (`chart-spec.ts` + `registry.ts` + `FrameRenderer.tsx` + 3 frame wrappers); 3 built frames registered (`bar-table`/`zhvi-area`/`corridor-scatter`); 5 tests, tsc 0; `/r/` untouched. Field names in plan §SHIPPED |
| 2b | Frame: franchise survival | `phase-2-visuals/frame-franchise-survival__SONNET.md` | Sonnet | 2a | ✅ 2026-06-11 (local) — `FranchiseSurvivalFrame.tsx` (ranked h-bar, 4-KPI tile row, sort controls, click-to-expand detail panel, median marker, as-of caption); `franchise-survival-utils.ts` (pure adapter: prepareBrands/sortBrands/computeMedian/computeKPIs/barColor); `franchise-survival` registered (`accepts: ["ranked-categories"]`); data-availability: fixture has per-brand rows, brain emits aggregate only — fixture-bound (Phase 3 wires live); 22 tests pass, tsc 0 |
| 2c | Frame: flood/composition | `phase-2-visuals/frame-flood-composition__SONNET.md` | Sonnet | 2a | ✅ 2026-06-11 (local) — `CompositionFrame.tsx`; stacked bar + callout + legend, pure Tailwind; `composition` registered (`accepts: ["composition"]`); `extractCompositionData` pure adapter; 9 tests, tsc 0; env-swfl `swfl_sfha_pct_area_weighted` + `swfl_ve_zone_pct_area_weighted` key_metrics bind as segments in Phase 3 |
| 2d | Frame: freight z-gauge | `phase-2-visuals/frame-freight-zgauge__SONNET.md` | Sonnet | 2a | ✅ 2026-06-11 (local) — `ZGaugeFrame.tsx`; 9-segment horizontal gauge + delta pill + baseline tick, pure Tailwind; `z-gauge` registered (`accepts: ["single-vs-target"]`); `extractGaugeData` pure adapter; 14 tests, tsc 0; traffic-swfl `post_ian_recovery=108.1 (index 2022=100)` binds in Phase 3 |
| 2e | Frame: seasonal radial | `phase-2-visuals/frame-seasonal-radial__SONNET.md` | Sonnet | 2a | ✅ 2026-06-11 (local) — `SeasonalRadialChart` (recharts RadialBarChart, teal→sky→amber palette, per-corridor concentric rings, as-of caption); `SeasonalRadialFrame` thin wrapper; `seasonal-radial` registered (`accepts: ["time-series"]`); `SeasonalRadialEntry` in `types/viz.ts`; 10 tests pass, tsc 0 |
| 2f | Frame: storm claims | `phase-2-visuals/frame-storm-claims__SONNET.md` | Sonnet | 2a | ✅ 2026-06-11 (local) — `TimelineFrame.tsx` + `storm-timeline` registry entry (`accepts: ["timeline"]`); 10 tests pass, tsc clean; fixture-bound (per-storm data binding PARKED — env-swfl emits combined storm total only, not per-storm breakdown; see plan §DATA-PARK note) |
| 2g | pickFramesForData mapper | `phase-2g-pick-frames-mapper__OPUS.md` | Opus | 2a | ✅ 2026-06-11 (local) — `pick-frames.ts` + `pick-frames.test.ts`; reads CHART_REGISTRY at runtime; detail_tables: date→time-series, 2-numeric→relationship, 1-numeric→ranked; key_metrics fallback: pct-sum→composition, single→single-vs-target; 8 tests, tsc 0 |
| 3 | Assembly + hosted /p/[id] | `phase-3-assembly-hosted-p__OPUS.md` | Opus | 1, 2a | ⬜ |
| 4 | PDF export | `phase-4-pdf-export__SONNET.md` | Sonnet | 3 | ⬜ |
| 5 | Templates | `phase-5-templates__SONNET.md` | Sonnet | 3 | ⬜ |
| 6 | Brand theming | `phase-6-brand-theming__SONNET.md` | Sonnet | 2a, 3 | ⬜ |

---

## What already exists (verified live 2026-06-10 — do NOT rebuild)
- `/r/` auto-charts from `detail_tables`/`key_metrics`: `refinery/lib/chart-from-metrics.mts`
  (`computeMetricChart`) → `components/charts/ReportChart.tsx` → `ChartBlockView.tsx`.
- cre-swfl interactive `app/r/cre-swfl/CREMarketBeatChart.tsx`.
- Render components: `HBarChart.tsx`, `ZHVIAreaChart.tsx`, `CorridorMarketScatter.tsx` (scatter #01 — already built, just register it).
- Projects/Briefcase S0–S2: `lib/project/items.ts`, `lib/highlighter/context.tsx`, `components/highlighter/Briefcase.tsx`.
- Specs: `docs/superpowers/specs/2026-06-10-chart-as-of-anchoring.md`,
  `.../2026-06-07-boards-pdf-composed-export-design.md`,
  `.../2026-06-07-chart-generation-three-tier-design.md`,
  `docs/superpowers/plans/2026-06-10-projects-briefcase-assembly/`,
  `docs/superpowers/plans/charts-dynamic-capability.md`.
- Design source for Phase 2 frames: `SWFL-Visuals-UI-Kit.html` + `SWFL-Charts-Code-Reference.html`
  (currently in operator's `Downloads/` — copy into repo or open alongside when porting).
