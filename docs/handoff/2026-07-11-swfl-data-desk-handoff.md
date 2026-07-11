# Handoff — SWFL Data Desk (/desk): live market terminal + filing bridge

**Date:** 2026-07-11 · **Owner:** a website-builder session (Phase 1a) + deliverable-builder
awareness (Phase 1b) · **Check:** `swfl_data_desk_live_verify`
**Spec (authoritative, read first):** `docs/superpowers/specs/2026-07-11-swfl-data-desk-design.md`
**Companion (do NOT build here):** Spec B — `2026-07-11-desk-discovery-flywheel-design.md`
(check `desk_discovery_flywheel_live_verify`). Build A so B bolts on — see "Seams for Spec B".
**Origin:** parked `desk_showpiece_parked`, unblocked by the /charts glow-up; scope + route +
deep-research verdict decided with the operator 07/10–07/11/2026.

## Why this build (one line)

Not eye candy — the desk is a live product demo that funnels into the free-build → paid-send
paywall, a uniquely-cited daily dataset (AI-citation + backlink asset), and a first-class research
input. The filing bridge (Phase 1b) is what makes that true — without it the desk is a beautiful
dead-end. Build both phases.

## The build (scope: /desk page only — Spec B is a separate track)

**Phase 1a — the terminal** (server component, dark, data-dense, `revalidate = 300`):
wire ticker · liveness header · stat-hero+gradient-area hero (+ rebased %-change secondary tab) ·
count-up KPI row · Daily Market Pulse · Movers board · flash feed · gauge cluster. All eight zones
detailed in the spec. Reuse vendored `AreaChart` (gradient), `ChartStatFlow`, `Gauge`,
`@number-flow/react`, and the existing `MarketTemperatureGauge`. New client components: `WireTicker`,
`FlashFeed`, `DeskKpiRow`, `DeskTabs`.

**Phase 1b — the filing bridge** (ship right behind 1a; the ROI needs it):
`DeskHighlightBridge` (twin of `ReportHighlightBridge`, publishes KPI provenance so "File this
figure" captures real source+as-of), frame-backed "pin to my weekly email" on brain-backed tiles
(files a `frame` item that re-binds live at each send), register desk chart rootIds in
`PANEL_CONFIGS` + `AddChartToProject`, and the shared "turn this into a report" CTA.

## Corrected data sources — verified live 07/10/2026 (do not regress)

- Inventory from **`data_lake.listing_state`** (SteadyAPI spine, 67 core ZIPs, daily) + aggregate
  views `listing_active_stats` / `listing_momentum_stats` — **NOT** `active_listings_residential`
  (legacy scrape, out-of-scope Charlotte/Sarasota, untrusted DOM).
- Daily flow: **`listing_transitions`** (new / price-cut / holding / sold). Price line + mortgage:
  **`daily_truth`** (web-verified, ~2-month window). News: **`news_articles_swfl`** (sparse —
  empty-tolerant). Gauge: `market_details_swfl_latest`.
- **DROP days-on-market entirely** — the spine carries none (baths 0.3%, DOM 0% — dead).

## Non-negotiable honesty guardrails

- **Per-zone as-of MM/DD/YYYY** — feeds differ (spine 07/10, histogram 07/06); never one global stamp.
- **Partial-scan annotation on the Daily Market Pulse** — some days are incomplete sweeps (07/07 =
  3 new is a partial scan, not a lull); detect + label, or the flagship zone discredits the page.
- **"Holding" = ambiguous departure**, never sold/delisted. **Solds = "recent notable closings"**
  with the luxury caveat (sampled, median sold ~$1.975M vs. market median list ~$339K) — never
  market median sale price; each carries its sold-honesty tag.
- **Provenance scrub** (reuse comp-helper path): citation "SWFL Data Gulf", never vendor/MLS#/
  permalink/`property_id`. **Photos via `lib/media/listing-photo` watermark path**, never raw CDN.
- Clamp outliers (a $222M `reduced_amount` is a bad row — lead with median). Real+sourced only; a
  dead feed hides its zone. Gulf palette up/down, never stock red/green; delta always paired with
  an arrow. No system nouns / internal IDs / raw freshness tokens in copy.

## Seams for Spec B (leave these in — full list in the spec)

SSR the numbers; per-zone `{label,value,unit,sourceLabel,asOf,takeaway?}` contract; emit the
existing Dataset JSON-LD on /desk from day 1; shared "turn into report" CTA slot; each zone a
standalone component; leave /desk fully indexable (no `noindex`).

## Constraints

- RULE 3.5 is already satisfied — the spec exists and the brainstorm + crawl4ai research are done
  (design, GEO/growth, SteadyAPI capability, deliverable reuse); findings are in the two specs.
  This handoff is the brief, not a re-brainstorm.
- Verify with `bunx next build` (not `npx tsc`). Empty-tolerant everywhere; no sample data.
- Robots.txt answer-engine carve-out is an **operator decision in Spec B** — do NOT touch
  `robots.ts` as part of this build.
- Live-verify on deployed /desk (browser screenshot + a11y snapshot) closes
  `swfl_data_desk_live_verify`.
