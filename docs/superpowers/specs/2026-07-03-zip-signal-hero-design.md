# Signal-driven ZIP hero + shared sourced figures

**Date:** 2026-07-03
**Check:** `zip_signal_hero_live_verify`
**Follow-up checks:** `zip_hero_pool_all_brains`, `city_permits_ingest_odd`

## Problem

Operator escalation 07/03/2026 (screenshots, ZIP 33914): the ZIP report page
(`app/r/zip-report/[zip]/page.tsx`) renders a fixed 3-metric template
(flood / median home value / permits) in THREE surfaces — hero stats bar,
"at a glance" blocks, "Data Summary" rail — plus a fourth partial repeat in the
below-fold grid. Root causes traced in-session:

1. **Flood em-dash on 51 of 57 ZIP pages.** The page looks up
   `swfl_zip_<zip>_flood_aal_usd_per_insured_property` in env-swfl key_metrics,
   but `aggregateZipRollupTop6` (`refinery/sources/fema-nfip-source.mts:512`,
   view path `buildZipFragmentsFromView:603`) ranks ALL SWFL ZIPs then emits
   only the top 6 (33957, 33931, 33921, 33908, 33924, 34102). The upstream SQL
   view already computes paid claims / claim counts / median building value for
   EVERY SWFL ZIP — we truncate held data at emission.
2. **Permits em-dash on every incorporated-city ZIP.** `permits_by_zip`
   (permits-swfl) has no top-N filter; it emits every ZIP present in the Lee
   Accela feed. Cape Coral (33904/09/14/90/91) runs its own permitting portal,
   so those ZIPs never appear; Collier has no ZIP column at all. The page
   presents a structurally-partial source as a universal stat.
3. **Same number three times.** The template renders the same 3 metrics in 3
   surfaces. With 2 of 3 missing, the page degenerates to "$485K × 3" — while
   the page already holds DOM, homes sold, inventory, months of supply,
   sale-to-list (with YoY deltas) and census figures, shoved below the fold.

## Goal

The important numbers drive the page. Each ZIP's page ranks the metrics we
actually hold for it and leads with the most distinctive ones. No number
renders twice. No em-dash for a source that structurally can't cover the ZIP —
a gap becomes a "Find it" button (lane 3: AI + named web source, cited,
cached). Every figure found this way lands in a shared store read by the ZIP
page, the site assistant, and the email/social builders — data is never
page-local ("we don't want flood looked up in 33908 and the builder AI saying
I-don't-know").

## Research (RULE 0.4, crawl4ai, 07/03/2026)

- NN/g "Dashboards: Making Charts and Graphs Easier to Understand"
  (Laubheimer, 06/18/2017, nngroup.com/articles/dashboards-preattentive/):
  dashboards impart at-a-glance information with minimum cognitive processing —
  supports leading with the few signals that matter, not a fixed grid.
- NN/g "Progressive Disclosure" (Nielsen, 12/03/2006,
  nngroup.com/articles/progressive-disclosure/): show only the few most
  important options first; the larger set on request — supports hero = top-3
  scored, remainder ranked below, detail on demand.

## Operator decisions (Q&A, 07/03/2026)

- **Importance = extremity + movement blend**, deterministic in code.
- **Pool v1** = what the page already loads (housing metrics + YoY deltas +
  census figures) + flood unlocked for all 57 ZIPs. Permits compete only where
  Lee Accela covers. Follow-up registered to widen to all brains via the ZIP
  machine (`zip_hero_pool_all_brains`).
- **Render-once**: hero top-3 with why-tags; one ranked grid for the rest;
  rail becomes context/coverage card, never a number repeater.
- **Coverage gap → Find-it button**: click → AI finds the number live with a
  named source → cached for everyone ("then we have the number").

## Design

### 1. Shared sourced-figures store

New Supabase table `sourced_figures` (service-role writes; idempotent upsert
on scope_kind + scope_key + metric_key):
`id, scope_kind ('zip'|'county'), scope_key, metric_key, label, value_num,
value_text, unit, source_name, source_url, cited_text, as_of (date),
fetched_at, expires_at, requested_from`.
TTL default 30 days (per-metric-class override later). Table lives in the
PUBLIC schema (typed client — phantom columns are compile errors). Migration
idempotent, run via Bun.SQL (`.dlt/secrets.toml`, `sslmode=require`); verify
row access post-migration.

Reader: `lib/figures/sourced.ts` — `getSourcedFigures(scope)` → figures shaped
like `MarketFigure` (key, label, value, source, as_of). Empty-tolerant by
contract: no creds / no rows / error → `[]`, never throws, never invents.

Consumers wired IN THIS BUILD:
- ZIP report page (renders cached figures where held data is absent),
- `lib/email/market-context.ts` (merge into `zipFigures` output → email lab AND
  social builders inherit, since market-context is the builder data feed),
- site assistant ZIP context — same reader, merged at the assistant's per-ZIP
  figure-assembly seam (implementation plan MUST name the exact file after
  probing `lib/assistant/`; candidates are the compose-chart held-figures path
  and the project/ZIP context assembler — probe, don't guess).

### 2. Signal ranker

`lib/zip-report/signal-rank.ts` — pure, no I/O.
Candidate: `{ key, label, value, display, percentile (0–100 across SWFL ZIPs
for that metric), movement (normalized |YoY %| or |z|), covered: boolean,
source, as_of }`.
Score = `0.6 × extremity + 0.4 × movement` where
`extremity = |percentile − 50| / 50` (0..1) and movement is capped at 1
(YoY: |yoy|/20 capped; z: |z|/3 capped; metrics with no delta → 0).
Deterministic tie-break by fixed priority list. Uncovered candidates are
excluded (they don't compete; they surface as Find-it slots).
Output per candidate: rank + `why` tag derived from the winning term —
"#1 of 57 ZIPs for flood loss" / "prices moving +18% YoY". The why-tag only
restates held rank/delta values — no invented numbers, no jargon, dates
MM/DD/YYYY.

### 3. Page restructure (render-once)

- **Hero strip** = top-3 scored signals, large, each with its why-tag.
- **Ranked grid** = every remaining held metric exactly once — absorbs today's
  "at a glance" blocks AND the below-fold unified grid (census figures join
  the same ranked pool; ranked order, one card per number).
- **Rail** = context card: identity (ZIP, place, county), as-of date (once),
  coverage lines ("Building permits: issued by the City of Cape Coral —
  <link>" where structurally absent), CitationList unchanged as the ONE
  sources root.
- Em-dashes eliminated: absent metric → doesn't compete; its slot (grid or
  rail) renders the Find-it button.
- Layout uses `dvh`/`h-full`; no "ZIP-level" framing anywhere in copy.

### 4. Flood emission for all 57 ZIPs

env-swfl adds detail table `flood_by_zip` (grain `zip`): one row per SWFL ZIP
from the pre-aggregated view — `aal_usd_per_insured_property`, `pct_rank`,
`claim_count_in_window`, `county`. Existing top-6 key_metrics UNTOUCHED (thin
pipe: downstream readers unaffected). Page reads the table first, falls back
to key_metrics. Vocab/slug registration for anything new emitted ships in the
SAME commit (Gate 2/5); detail-table cells follow the established zip-drill
pattern. Rebuild with `--target-only`.

### 5. Find-it button (lane 3, cached)

- Client component on gap slots (fixed ALLOWLIST of metric gaps — v1:
  `permits_90d` on city-permitted ZIPs; the public cannot request arbitrary
  lookups).
- `POST /api/figures/find { scope, metric_key }` → rate-limit (per-IP +
  global daily cap) → cache check (`sourced_figures`, unexpired → return) →
  cold: reuse the existing gap-fill engine (`lib/assistant/gap-fill.ts`
  wiring: `web_search_20250305` on the pinned search model; a value is
  accepted ONLY when its digits appear verbatim in a returned `cited_text`
  from a real publisher URL — else dropped) → upsert → return figure with
  source + as-of.
- Button states: idle → finding → found (figure + named source) / not-found
  (honest line + named pointer to the real issuing source, e.g.
  City of Cape Coral permit portal link). Never an invented number; a miss is
  a miss.
- Found figures flow to ALL consumers via §1 automatically.

### 6. Non-goals (this build)

- No new brains; no changes to master routing.
- No arbitrary-metric public search.
- City permit portal ingest (Cape Coral / Naples / Fort Myers) is the
  registered follow-up `city_permits_ingest_odd` (ODD scaffold), not this
  build — lane 1 replaces lane 3 there when it lands.
- All-brains candidate pool is follow-up `zip_hero_pool_all_brains`.

### 7. Testing

- `signal-rank` bun tests: deterministic fixtures — extremity-led winner,
  movement-led winner, tie-break order, uncovered exclusion, why-tag text.
- `sourced.ts` reader: empty-tolerant (no creds → `[]`).
- `market-context` merge test: a stored figure appears in builder context with
  citation + as-of.
- env-swfl pack test extension: `flood_by_zip` row count == view ZIP count,
  top-6 key_metrics unchanged.
- Find-it endpoint contract test with gap-fill mocked (no paid calls in CI);
  rate-limit path covered.
- Verify with `bunx next build` (not bare tsc). `*_live_verify` check is
  operator-run (no autonomous paid calls).

## Sources

- Code traced in-session: `app/r/zip-report/[zip]/page.tsx`,
  `refinery/sources/fema-nfip-source.mts`, `refinery/packs/env-swfl.mts`,
  `refinery/packs/permits-swfl.mts`, `lib/email/market-context.ts`,
  `lib/assistant/gap-fill.ts`.
- NN/g dashboards (06/18/2017) + progressive disclosure (12/03/2006), fetched
  via crawl4ai 07/03/2026.
