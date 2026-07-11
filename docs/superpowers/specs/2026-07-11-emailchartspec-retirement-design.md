# Retire `EmailChartSpec` — one chart taxonomy, not two

**Date:** 2026-07-11
**Status:** DEFERRED — not blocking (operator's call). Sequence after Builds 1 & 2.
**Audit:** `docs/audit/2026-07-11-chart-builder-wiring/findings.md` (§3)
**Check:** `retire_emailchartspec_outreach`

## Problem

The repo carries **two** unrelated chart-spec taxonomies. The newer
`ChartSpec`/`frameId` registry (`components/charts/registry/chart-spec.ts`) powers chat, the
Projects deliverable engine, and the Email Lab builder. The older `EmailChartSpec`
(`lib/email/templates/charts/chart-types.ts` — `bar` / `sparkline` / `gauge` / `heat-row` /
`stacked-bar`) is structurally unrelated and still the live taxonomy for:

- `lib/email/outreach/{drip-email,campaign,build-content,demo-content}.ts` (drip / outreach sends)
- `lib/email/listing-flyer.ts`
- `lib/social/render-social-image.ts` + `lib/social/chart-svg.ts` (the automated social-card
  route's orphaned, caller-less chart renderer — see audit §2d)

`lib/email/listing-comps.ts` already migrated (its `buildCompsSpec` emits a `ChartSpec` frame), so
the migration is in progress, just unfinished. Two taxonomies means every future chart change has to
know which system a surface speaks before touching it, and it is why the social renderer (built on
`EmailChartSpec`) can't reuse the registry frames the rest of the product has.

## Goal

`EmailChartSpec` retired. Outreach, listing-flyer, and the automated social-card path emit
`ChartSpec`/`frameId` and rasterize through the shared `lib/charts/spec-to-image.ts` root (extracted
in Build 2), so there is one chart taxonomy and one rasterizer across the whole product.

## Why deferred, not now

Outreach and listing-flyer **work today** — this is a consolidation, not a fix, and it has real send
paths in production. It also reads cleaner AFTER Build 2 extracts the shared rasterizer (the
migration target) and Build 1 fills the registry's PNG coverage (so no `EmailChartSpec` shape lacks
a `ChartSpec` equivalent to move to). Doing it first would migrate onto a moving target.

## What we're building (when it runs)

1. **Map each `EmailChartSpec` shape to a `ChartSpec` frame.** `bar`→`bar-table`,
   `sparkline`→`spark-grid`/`line-band`, `gauge`→`z-gauge`, `stacked-bar`→`composition`,
   `heat-row`→(nearest registry frame; confirm one exists or flag the gap). Verify each target frame
   has a PNG renderer (Build 1 dependency) before migrating that shape.
2. **Migrate the three live producers** (`outreach/*`, `listing-flyer.ts`, automated social-card
   route) to build `ChartSpec`s and rasterize via `lib/charts/spec-to-image.ts` (Build 2) + their
   own hosting wrapper. One producer at a time, each with a before/after render regression test.
3. **Delete `EmailChartSpec`, `chart-svg.ts`, `nativeBarSvg`** and their tests once no caller
   remains. Grep-confirm zero references before deletion.

## Dependencies

- **Build 2** (`social-chart-registry`) — provides `lib/charts/spec-to-image.ts`, the migration
  target rasterizer.
- **Build 1** (`chart-picker-parity`) — provides PNG renderers for the frames some `EmailChartSpec`
  shapes map onto (`z-gauge`, `composition`).
- **Coherence gate** — migrated producers inherit `assertHeroChartCoherence` for free by routing
  through the shared seam; do not add a bypass.

## Non-goals

- No new chart capability — purely taxonomy consolidation. Any missing frame (e.g. a true
  `heat-row` equivalent) is flagged, not invented here.
