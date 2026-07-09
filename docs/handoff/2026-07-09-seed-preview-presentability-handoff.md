# HANDOFF — Make the 27 seed previews actually presentable (variety pass)

**Date:** 07/09/2026 · **From:** the session that shipped `66dc049e` + `ead18bb6`
**Check:** `seed_preview_variety_pass` (open in `checks`; supersedes the chart half of
`seed_previews_recapture_after_enrichment` — coordinate, don't double-do)
**Spec base:** `docs/superpowers/specs/2026-07-09-template-preview-gallery-design.md`
**Recommended model:** Sonnet is fine — the design decisions are made below; this is execution.

## Why this handoff exists (operator escalation, verbatim problem)

The operator opened the Weekly Market Pulse preview on the live /showcase and got **the identical
ZHVI line chart three times in one email** — a template whose own description says "two charts
side-by-side." Same failure class across the whole gallery: one shared figure pool + ONE committed
chart + three photos cycled type-wise through 27 templates. Each tile read fine in isolation; the
assembled gallery reads copy-pasted and lazy. That is the opposite of what a showcase is for.

**The miss to not repeat:** the shipping session reviewed captures ONE AT A TIME and signed off.
Presentability is a property of the SET — the grid view and every overlay at full height. QA the
set, not the tile.

## What exists and must not break (all shipped, tested, on main)

- `lib/email/doc/preview-fill.ts` — display-only fill. Pure; capture-script-only; a guard test
  (`preview-fill.test.ts`) fails the suite if any lab entry path imports it. Purges the legacy
  $485K/4521-Surfside demo placeholders. KEEP ALL OF THIS.
- `lib/email/doc/seed-previews.ts` — manifest (id → webp, 6 job groups) + existence-guard tests.
- `scripts/capture-seed-previews.mts` — bun; renders `previewFill(seed.build())` via
  `renderEmailDocHtml`, screenshots with the crawl4ai venv's playwright (`C:\Users\ethan\
  crawl4ai-venv\Scripts\python.exe`) + Pillow → `public/showcase/seed-previews/<id>.webp`.
  Re-run + commit webps after ANY fill change: `bun scripts/capture-seed-previews.mts`
- Consumers: `components/showcase/SeedGallery.tsx` (/showcase, above Visual Templates) and
  `components/email-lab/TemplateGallery.tsx` (New-Project first-run picker). Both read the
  manifest — fix the fills + recapture and both surfaces improve for free.
- **Invariants:** four-lane honest (every figure names a real source — lake → upload → named web
  source → operator-given; INVENTED is the only hard block) · picking a template still commits the
  untouched slot-rule skeleton (`seed.build()`) · listing citations say "SWFL Data Gulf", never
  vendor/MLS# · never claim SOLD on an actively-listed address (just-sold uses the LeePA recorded
  aggregate for exactly this reason) · no hotlinked externals in previews.

## The fix — three workstreams

### 1. Distinct charts (the loudest failure)

One committed chart cannot serve ~6+ chart slots. Build a tiny deterministic SVG chart helper in
the capture path (or pre-commit one SVG per series — either is fine, charts must be REAL data),
and give every chart-bearing template ITS OWN chart; a template with two chart slots gets TWO
DIFFERENT charts. Real series already verified queryable via lake MCP this session:

- `zhvi_swfl` — monthly home-value series per county/city/ZIP (the one existing chart uses the
  Lee County avg; keep it for ONE template only — trend-snapshot is its natural home).
- `market_heat_core_swfl` — per-ZIP monthly rows (June 2026 live): median listing price, median
  DOM, pending ratio, price-reduced share, active/new listing counts. → ZIP-comparison BAR charts
  (e.g., median asking across the 6 biggest Lee ZIPs) and DOM comparisons.
- `pg.data_lake.listing_state` — live listing aggregates by city/price band (21,934 active Lee
  rows on 07/09/2026; group-bys verified fast).
- LeePA `last_sale_*` views — recorded sales by month (`DoS`), e.g. 3,865 (03/2026) / 3,650
  (04/2026) medians $319K/$330K → sales-by-month COLUMN chart for monthly-digest/year-in-review.
- `redfin_price_drops`, `redfin_contract_cancellations`, `redfin_delistings_relistings`,
  `zori_swfl` (rents), `fred_listing_swfl` — more series if needed.
- Freddie Mac PMMS historical weekly rates:
  https://www.freddiemac.com/pmms/docs/historicalweeklydata.xlsx (named web source, lane 3) →
  rate trend line for rate-watch. Current anchors already sourced: 6.49% (07/09/2026), 6.43%
  prior week, 6.72% a year ago.

Chart craft: follow the dataviz skill (it was loaded last session; the validated ink on light
surface is `#0891B2`; single series = no legend + endpoint labels; comparisons = bars, one hue;
never two y-scales). The existing `chart-lee-home-values.svg` shows the target quality.

### 2. Distinct figures + prose per template (the quiet version of the same failure)

Today ~20 templates share one hero ($290,000) and one 5-sentence commentary pool. Give each
template a fill matched to ITS JOB via `SEED_OVERRIDES` in `preview-fill.ts` (mechanism already
exists — 7 overrides shipped; extend to all 27). Assignment sketch (adjust freely, keep sources
real):

- weekly-pulse → county pulse: ZIP-median bar chart hero + ZHVI line + price-cut trend (3 charts,
  3 series); stats: new listings 1,734 · pending 25.5% · DOM 83.
- trend-snapshot → the ZHVI line (sole owner of the current chart).
- rate-watch → PMMS series (override shipped for hero/stats; add the rate chart).
- monthly-digest → LeePA sales-by-month columns + month-over-month deltas.
- year-in-review → 12-month ZHVI move (−8.1%, $471,582→$433,549, override exists) + annual sales.
- neighborhood-report → ONE ZIP's own market-heat row (e.g. 33914 Cape Coral), not county-wide.
- investment-brief → ZORI rent level + price; any ratio is deterministic math from the two cited
  figures, labeled as computed.
- luxury-market-report → listing_state $2M+ segment (count/median/DOM — query it).
- just-sold / just-sold-grid → LeePA recorded-sale aggregates (overrides exist; differentiate the
  two templates' stats/prose from each other).
- price-reduced → redfin price-drop share + the real reduced listing (2121 SW 39th Ter, −$25,000
  → $605,000, already sourced).
- listing-feature / new-listing / open-house / listing-digest → DIFFERENT real listing per
  template (5-row pool exists in the fixture; assign per-seed instead of cycling; pull more clean
  rows if needed — filter `street_address ~ '^[0-9]+ '`, baths NOT NULL).
- welcome / stay-in-touch / agent-spotlight / minimal / editorial-letter / market-letter /
  magazine-issue → prose-led: one distinct figure + hand-written commentary each, grounded in
  that figure.
- skeletons (4) → they're sold as "blank canvases": keep the fill MINIMAL by design — structure
  is the product; do not force market data into them. Their group pitch already says so.

Photos: pool of 3 repeats visibly. Add ~5 more licensed coastal/property Pexels photos (precedent
+ license note: `public/showcase/seed-previews/assets/README.md`; download pattern in git history
of this session) and assign per-seed, not cycled.

### 3. Mechanical guards so this class can't ship again

Add to `preview-fill.test.ts` (or a sibling):
- **No duplicate chart inside one doc:** for every seed, the filled doc's chart-image URLs are
  unique within that doc. (This alone would have caught the operator's screenshot.)
- **Hero variety:** within each gallery group, no two templates share `hero.value`.
- **Global repeat cap:** across all 27 filled docs, no chart URL appears more than ~3 times.
- **Set-level QA step (human):** after capture, build a contact sheet (`Pillow` montage of all 27
  webps, or just open /showcase locally) and LOOK at the grid + open every chart-bearing overlay
  full-height. Do not sign off tile-by-tile.

## Definition of done

1. All 27 filled previews distinct: no duplicate chart within any doc; heroes vary within groups;
   photos don't visibly repeat inside a group.
2. Every figure/series still names a real source with as-of (MM/DD/YYYY, stated once) — extend
   the sources list in `SEED_PREVIEW_FILL` for any new series.
3. `bun test lib/email/doc/` green (incl. the new guards) · `bunx next build` green.
4. Recaptured webps committed; /showcase and the New-Project picker both show the new set.
5. SESSION_LOG entry; close `seed_preview_variety_pass`; leave
   `template_preview_gallery_live_verify` for the operator; fold the chart half out of
   `seed_previews_recapture_after_enrichment` (the enrichment re-run note still stands).

## Commands you'll need

- Figures/series: lake MCP (`mcp__lake__query_lake`, Tier-1 views + `pg.data_lake.*`).
- Recapture: `bun scripts/capture-seed-previews.mts` (local-only; playwright from the crawl4ai
  venv — nothing to install).
- Verify: `bun test lib/email/doc/ lib/lab-entry/` · `bunx next build`.
- PMMS history: crawl4ai the xlsx URL above (crawl4ai is the ONLY web tool — never Firecrawl).
