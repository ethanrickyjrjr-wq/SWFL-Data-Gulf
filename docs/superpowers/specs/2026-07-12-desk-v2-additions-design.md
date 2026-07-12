# Desk v2 additions — ⌘K bar, watchlist, alert rail, histogram, correlation heatmap, flash bridge

**Date:** 07/11/2026 · **Check:** `desk_v2_additions_live_verify`
**Parent:** `2026-07-11-swfl-data-desk-design.md` (its "Out of scope (v2 additive)" list is this spec's
scope, minus the deferred items below). Operator approved this design + prioritization 07/11/2026.

## Problem

The desk terminal (1a) + filing bridge (1b) shipped; the v2 additive list was deliberately cut to
keep Phase 1 shippable. Operator: finish the desk — build what's buildable now, hand off the rest.

## Goal

Ship the six buildable v2 items on /desk with the same honesty spine (per-figure as-of, named
source, empty-tolerant, SSR numbers), defer the three blocked items with written reasons.

## Scope (build order)

1. **⌘K command bar** — `cmdk@1.1.1` (registry-verified 07/11/2026: peer `react ^18 || ^19`, ours
   19.2.7). New client component `app/desk/_components/DeskCommandBar.tsx`, mounted once on /desk.
   Actions: jump-to-zone (anchor ids `desk-hero`/`desk-pulse`/`desk-movers`/`desk-flash` + new zones),
   type a core ZIP → `/r/zip-report/{zip}`, "pin …" entries for the brain-backed tiles (reuse the
   `PinToEmail` pin specs), "turn into report" recipes (reuse `TurnIntoReportCta` recipes). Opens on
   ⌘K / Ctrl-K / a small "⌘K" affordance in the header (discoverability + mobile). Renders no data
   of its own — SSR numbers untouched. ZIP entries come from the movers rows already in the page
   payload; no client fetch.
2. **Watchlist (pinned ZIPs)** — pin toggle on each `MoversBoard` row + a `DeskWatchlist` rail above
   the movers grid showing each pinned ZIP's already-loaded stats (median list, active count,
   price-cut share, new-listing share). Persistence: `localStorage` key `desk_watchlist_v1`
   (anonymous public page — no schema, no auth). Server ships all core-ZIP rows (typically <70);
   client filters to pinned. Empty watchlist renders nothing. New: `lib/desk/watchlist.ts` (pure
   helpers + storage guard), `DeskWatchlist.tsx`, per-row pin button.
3. **Threshold-alert rail** — `lib/desk/alerts.ts`: pure `deriveAlerts(desk: DeskData): DeskAlert[]`
   with CODE-OWNED deterministic rules, each alert carrying the source datum's `sourceLabel` + `asOf`
   verbatim. Initial rules (all computed from data already loaded, thresholds are code constants,
   documented inline): price-cut share ≥ 20% region-wide; any pinned-metric day-over-day move ≥ 5%;
   a pulse day where price cuts > new listings (never fires on `partial` days); mortgage-rate
   day-over-day move ≥ 0.10 pt. Distinct from the chronological Wire: condition-driven, not
   time-driven. Empty → zone hidden. Rendered as `DeskAlertRail.tsx` chips under the KPI row.
4. **Price-band affordability histogram** — new SQL view `data_lake.listing_price_bands`
   (aggregate at source; idempotent `CREATE OR REPLACE VIEW`; run directly): active rows from
   `listing_state` bucketed into fixed bands (<$250k, $250–400k, $400–600k, $600k–1M, $1–2M, ≥$2M)
   × county, plus `max(last_seen)` as vintage. Loader `loadPriceBands` returns per-band counts +
   as-of; zone renders the vendored bklit `BarChart` (client, animated). Own as-of, own source
   label ("SWFL Data Gulf listing sweep").
5. **ZIP×metric correlation heatmap** — `lib/desk/correlation.ts`: pure Pearson over the core-ZIP
   rows for metric pairs {median list price, active count, price-cut share, new-listing share}
   (metric×metric matrix computed across ZIPs; requires ≥ 10 ZIPs with all metrics present, else
   zone hidden). Deterministic math in code per the platform rule. Rendered with the vendored bklit
   heatmap using the `ZipMomentumHeatmap` call-site pattern (own plain-HTML labels + custom tooltip
   via `useHeatmap`/`useHeatmapInteraction` + `TooltipBox`; `aspectRatio` sizing). Copy explains the
   read ("how these market signals move together across Lee + Collier ZIPs"); diverging gulf ramp,
   never stock red/green.
6. **Flash-event → project-item bridge** — extend `FlashFeed` items with the same file-this action
   the KPI tiles have: a small "file" affordance per Wire item that hands `{headline, detail, asOf,
   sourceLabel, href, disclosure}` to the existing filing-bridge path (twin of
   `DeskHighlightBridge`'s datum contract — news/closing items are lane-1/lane-3 facts with named
   sources). No new persistence shape: files as a standard project item via the same client the
   pin path uses.

## Deferred to the follow-up handoff (not built here)

- **Mini-map choropleth** — the served contractor SVG still welds Fort Myers Beach (33931) to the
  mainland (standing hold from the zip-report map); Mapbox GL is a new dep + token + design pass.
- **STORMS/PERMITS tabs** — permits ingest has landed one live write ever (WAF saga); a tab on a
  dead feed violates the desk's empty-tolerant credo.
- **New-construction/foreclosure filter tabs** — the mix strip already surfaces the counts; real
  tab filtering reshapes every zone loader; own pass.

Handoff file: `docs/handoff/2026-07-11-desk-v2-deferred-handoff.md` (written in this build).

## Honesty guardrails (inherit the parent spec's, plus)

- Alert thresholds are code constants with inline rationale — never model-chosen, never invented
  figures; every alert names its source datum's as-of.
- Correlation zone states the n (ZIP count) and window in visible copy; correlations are
  descriptive ("moved together"), never causal or predictive; no projection ⇒ no [INFERENCE] tag
  needed.
- Histogram counts come from the view only; if the view is empty or stale > 7 days the zone hides.
- Watchlist is client-side personalization of server-rendered figures — nothing hydrates from a
  client fetch (Spec-B seam intact).
- No system nouns/IDs in copy; gulf palette; `prefers-reduced-motion` honored (cmdk dialog is
  motion-free anyway).

## Error handling

Every new loader follows the desk pattern: try/catch → `null`/`[]` → zone hidden. localStorage
guarded (SSR-safe, quota/JSON errors → empty watchlist). The command bar mounts nothing until
first open; if the page payload lacks ZIP rows the ZIP jump group is simply absent.

## Testing

- `bun:test` for the pure cores: `alerts.test.ts` (each rule fires/holds on boundary fixtures,
  partial-day suppression), `correlation.test.ts` (known Pearson fixtures, min-n gate),
  `watchlist.test.ts` (toggle/dedupe/corrupt-storage), price-band mapper.
- `bunx next build` green; existing `lib/desk/mappers.test.ts` untouched and green.
- Live-verify (closes `desk_v2_additions_live_verify`): deployed /desk — ⌘K opens + jumps + files,
  a pinned ZIP survives reload, alert chips show real thresholds with as-of, histogram + heatmap
  render real values with own as-of, Wire file-this lands a project item.
