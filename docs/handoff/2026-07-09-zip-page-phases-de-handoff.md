# Handoff — zip-page-destination: Phases D + E

**Spec (read first):** `docs/superpowers/specs/2026-07-09-zip-page-destination-design.md`
**Check:** `zip_page_destination_live_verify` · **Date:** 07/09/2026
**State: A SHIPPED (c286dbe4) · B BUILT (6543c3af) · C BUILT (cadbb15d..0659e6d5, plan
`docs/superpowers/plans/2026-07-09-zip-radius-pulse-news-phase-c.md`) · D/E not started.**
Supersedes `2026-07-09-zip-page-phases-cde-handoff.md` (C section done; its B notes still apply).

## What exists now (extend, never rebuild)

- **Narration (B):** `lib/narratives/` ONE-root bake harness + `scripts/bake-narratives.mts`
  (`SURFACE_ADAPTERS` — a new surface is ONE entry + one adapter file) + renderer
  `components/narratives/NarrativeSections.tsx` mounted on the zip page. Table
  `public.narratives` live, 0 rows until the operator-gated first bake. Launch flip =
  repo var `BAKE_CADENCE=daily`, nothing else.
- **Radius news (C):** distillers (city + corridor twins) emit nullable `location_anchor`
  in the same forced-tool call; `ingest/lib/geo_ladder.py` resolves post-distill
  (cache → Census address → SWFL-bounded Nominatim → Census coords→ZCTA; miss = native
  grain, never an invented ZIP); pulse tables carry
  `location_anchor/lat/lon/zip_code/geo_grain` + `data_lake.geo_anchor_cache` (migration
  `20260710_pulse_geo.sql` RUN); city-pulse pack emits `pulse_by_zip` (ONE row per ZIP —
  `fetchDetailRow` matches first-by-key); zip page mounts
  `components/narratives/PulseNearby.tsx` fed by `lib/pulse/nearby.ts` (point ≤3mi band →
  neighborhood → city-wide via reverse `fixtures/swfl-place-zip-crosswalk.json`, grain
  labeled, OSM attribution line, empty-tolerant).

## Phase D — funnel weave (next up; small)

- Inline module **directly after the narration** on `app/r/zip-report/[zip]/page.tsx`
  (mount region ~line 397: `<NarrativeSections/>` then `<PulseNearby/>` — D slots between
  them per spec "directly after the narration"): live miniature of THIS ZIP's branded
  email — `lib/email/zip-seed.ts` already builds the doc — + copy "This breakdown, branded
  as yours, in your clients' inboxes weekly — free to build." → `openZipLab(zip)`
  (`lib/lab-entry/destination.ts`, the ONE lab-entry root).
- **Render-engine landmine:** EmailDoc has THREE render engines that diverge on
  fonts/styling — the miniature must reuse an existing preview render path (grid-lab
  preview / DeliverableThumbnail pattern), never a fourth renderer.
- No brochure sections. Bottom build-bridge + DigestSubscribe stay. Zip-seed email content
  itself untouched. Evidence for the shape is already in the spec (daydream Zillow
  playbook; userp.io product-led content) — no new crawl needed for D.
- Verify: visual check in lab preview + phone width (grid-lab phone standard) before the
  phase closes.

## Phase E — all report pages

- Per surface: (a) adapter `lib/narratives/<surface>-inputs.ts` + one `SURFACE_ADAPTERS`
  entry in `scripts/bake-narratives.mts`; (b) page mounts `NarrativeSections`; (c)
  **report-shell one-root migration** — move each page's hand-rolled
  `ReportHighlightBridge` mount + `metricSuggestions` assembly into
  `app/r/_components/report-shell.tsx` (spec §One root #1; six /r/ pages carry duplicated
  wiring today). While migrating zip: extract the page/bake shared glue into
  `lib/zip-report/assemble.ts` (`lib/narratives/zip-inputs.ts` deliberately mirrors ~80
  lines of page assembly until then).
- Inventory: corridors 27 (`fixtures/corridor-centroids.json`) → `/r/cre-swfl/[corridor]`;
  brain topic pages `/r/[slug]` + `/r/housing-swfl` (enumerate from the route registry at
  plan time); communities/neighborhoods (count from the communities pack detail tables).
  Excluded: `/r/search`, `/r/method/*`, `/r/source/*`.
- News where geo applies: corridor pages can reuse the `PulseNearby` pattern over
  `city_pulse_corridors` (rows already gain geo columns from C) — sibling component under
  `components/narratives/`, never per-page markup.
- Cost envelope: ~2.6¢/surface, delta-gated, weekly until the `BAKE_CADENCE=daily` flip;
  Batch API (50% off) is the flagged optimization if E volume warrants.
- Phone standard applies to every new section; verify at phone width per phase close.

## First bake (operator-gated, paid) — still pending from B

- ~123 ZIPs × ~2.6¢ ≈ $3.20 total; the $1 run cap stops each run at ~38 ZIPs. Either
  dispatch `narrative-bake` on three successive days, or temporarily set the workflow cap
  line to "3.50" for one dispatched run and revert.
- After: verify rows in `public.narratives`, the `narrative_bake` line on ops /spend, and
  sections rendering on a real ZIP page.
- Cadence proof (spec verification item): dispatch on a non-Monday with `BAKE_CADENCE`
  unset → expect `[bake] skip:` + zero api_usage_log rows.

## Landmines (C additions on top of the B set)

- **`--dry-run` is NOT free:** both pulse pipelines' dry-run still makes the real paid
  Sonnet distill call (only uploads/DB writes are skipped). Free verification = unit
  tests + the ladder's 3-call vendor smoke (`geo_ladder` functions directly).
- **Vendor terms are load-bearing (verified live 07/09/2026, SESSION_LOG):** Mapbox is OUT
  (temporary results may not be cached; Search Box POI temporary-use only; Permanent bars
  distribution). Census + Nominatim only. Nominatim: 15s in-process throttle, pinned
  User-Agent in `geo_ladder.py`, results MUST stay cached (`geo_anchor_cache`; misses
  negative-cached 30 days), OSM attribution stays on any surface rendering
  Nominatim-resolved items.
- **Grain semantics:** city-wide rows keep `zip_code NULL` (a city spans many ZIPs — the
  page reverse-crosswalks at read time; G1). Unresolved corridor rows keep `geo_grain
  NULL` (native corridor grain; the enum has no 'corridor'). Only city_pulse misses fall
  back to `geo_grain='city'`.
- **Communities tables hold NO geometry** (`neighborhood_stats`/`community_profiles` —
  verified): neighborhood anchors resolve via Nominatim, not a name-join. Don't re-add
  the join without shipping coordinates first.
- **Empty news section is correct** until the next scheduled pulse run writes geocoded
  rows — don't "fix" it; the rendered + phone proof lands with the live-verify.
- **Untyped allowlist debt:** `lib/pulse/nearby.ts` joined `lib/narratives/store.ts` on
  `verification/supabase-untyped-allowlist.json`. On the next
  `database-generated.types.ts` regen, type both and remove the entries.
- Never point bakes at `master --force` GHA habits — `narrative-bake.yml` is its own
  workflow; the daily brain rebuild is untouched by this build.

## Open checks (ledger, not this file)

- `zip_page_destination_live_verify` — closes when: homepage click → narration + news +
  Down the Road render live + a delta-gated bake shows in api_usage_log under cap.
- `anthropic_workspace_spend_limit` — OPERATOR: Anthropic Console monthly workspace limit.
- `lab_phone_side_panel_visibility` — separate build, operator-reported phone gap.
- `zip_page_queue_line_sync` — CLOSED 07/09/2026 (queue line added with this handoff).
