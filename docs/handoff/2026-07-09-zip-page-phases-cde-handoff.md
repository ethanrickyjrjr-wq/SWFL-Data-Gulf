# Handoff — zip-page-destination: Phases C, D, E (+ Phase B operational notes)

**Spec (read first):** `docs/superpowers/specs/2026-07-09-zip-page-destination-design.md`
**Check:** `zip_page_destination_live_verify` · **Date:** 07/09/2026
**State: Phase A SHIPPED (c286dbe4) · Phase B BUILT (6543c3af, table live) · C/D/E not started.**

## What already exists (do not rebuild)

- **Routing:** homepage map/rail clicks → `/r/zip-report/[zip]` (`components/landing/Hero.tsx`).
- **Bake harness (ONE root — extend, never fork):** `lib/narratives/` — `types` (sections
  contract), `hash` (delta gate; facts+asOf only, context excluded by design), `cadence`
  (BAKE_CADENCE switch), `prompt` (THE one prompt root), `validate` (no-invention numeric
  whitelist, [INFERENCE]+hedge+falsifier, jargon guard), `store` (untyped supabase —
  allowlisted), `zip-inputs` (zip surface adapter). Runner: `scripts/bake-narratives.mts`
  (`SURFACE_ADAPTERS` map — a new surface is ONE entry + one adapter file). Renderer:
  `components/narratives/NarrativeSections.tsx` (every surface mounts this, nothing else).
- **Table:** `public.narratives` keyed (surface, surface_key) — migration
  `migrations/20260709_narratives.sql` RUN + verified 07/09/2026 (RLS public-read, 0 rows
  until first bake).
- **Workflow:** `.github/workflows/narrative-bake.yml` — daily cron 10:40 UTC; script
  self-gates on repo var `BAKE_CADENCE` (unset/weekly → Mondays UTC; daily → every run).
  **Launch flip = set repo var BAKE_CADENCE=daily. Nothing else.**
- **Spend:** every call → `getAnthropic("narrative_bake")` → `api_usage_log` (ops /spend
  line item) + SpendCapError daily/monthly seam; `NARRATIVE_BAKE_RUN_CAP_USD: "1.00"` is an
  explicit line in the workflow. Tests: `lib/narratives/narratives.test.ts` (10).

## Phase B — first real bake (operator-gated, paid)

- ~123 ZIPs × ~2.6¢ ≈ $3.20 total, but the $1 run cap stops each run at ~38 ZIPs.
  Either dispatch `narrative-bake` (force=false) on three successive days (daily $5
  ceiling is fine), or temporarily set the workflow cap line to "3.50" for one dispatched
  run and revert in the same PR-less edit. After: verify rows in `public.narratives`,
  the `narrative_bake` line on ops /spend, and the sections rendering on a real ZIP page.
- Sync-vs-Batch: v1 calls are synchronous through the metered seam (spec notes this);
  Batch API (50% off) is a flagged optimization for Phase E volume.
- Cadence proof (spec verification item): dispatch on a non-Monday with BAKE_CADENCE
  unset → expect `[bake] skip:` + zero api_usage_log rows.

## Phase C — ZIP-radius pulse news (next up)

1. **VENDOR VERIFY FIRST (RULE 0.4, crawl4ai only):** geocoder storage terms. Mapbox
   standard geocoding restricts storing results (permanent geocoding = separate product);
   US Census geocoder is free/storable but address-only (no POI/landmark). Verify live
   terms, pick the ladder's vendors, write evidence into SESSION_LOG before code.
2. Distiller: add nullable `location_anchor` to the extraction `input_schema` in BOTH
   `ingest/pipelines/city_pulse/distill.py` and `city_pulse_corridors/distill.py`
   (same distill call — zero extra LLM cost). Most-specific place named: street address /
   intersection / plaza-landmark / neighborhood / null (city-wide).
3. Geocode ladder (plain code, post-distill): address→geocode→point-in-ZIP; landmark→POI;
   neighborhood→communities-swfl name-join; null→city→ZIP tagged `city_wide`. A miss at
   every rung stays city-grain — never invent a ZIP (G1: location-derived only).
4. Storage: pulse rows gain `lat`,`lon`,`zip_code`,`geo_grain` (point|neighborhood|city|
   county). **Same PR must ship the consuming pack change** (city-pulse emits
   `pulse_by_zip` detail table) — Gate 3/brain-first. Vocab slugs same commit if any new
   slugs emit. Ingest rules apply (ingest/CLAUDE.md): guards before destructive writes,
   $1 RunBudget, grant+reload after any new table.
5. Page section "What's happening near {ZIP}": order point-radius (~3mi primary band —
   reuse the trade-area band thinking in `ingest/event-radius-config.yaml`) →
   neighborhood → city → county, bigger grains visibly labeled (operator: fine). Items
   keep citation spans; TTL/supersession untouched. Render inside the narrative/news
   area — extend `NarrativeSections` or a sibling under `components/narratives/`, never
   per-page markup.

## Phase D — funnel weave

- Inline module directly after `<NarrativeSections/>` on the zip page: live miniature of
  THIS ZIP's branded email (zip-seed already builds it — see `lib/email/zip-seed.ts`) +
  "This breakdown, branded as yours, in your clients' inboxes weekly — free to build."
  → `openZipLab(zip)` (`lib/lab-entry/destination.ts`). No brochure sections. Bottom
  build-bridge + DigestSubscribe stay. Zip-seed email content itself untouched.
- Evidence for the shape (already crawled, in spec): conversion affordance native to
  content utility (daydream Zillow playbook); artifact demonstrates product (userp.io).

## Phase E — all report pages

- Per surface: (a) adapter in `lib/narratives/<surface>-inputs.ts` + one
  `SURFACE_ADAPTERS` entry; (b) page mounts `NarrativeSections`; (c) **report-shell
  migration** — move that page's hand-rolled `ReportHighlightBridge` mount +
  `metricSuggestions` assembly into `app/r/_components/report-shell.tsx` (spec §One
  root #1; six /r/ pages carry duplicated wiring today — this is the drift killer).
  While migrating zip: extract the page/bake shared glue into `lib/zip-report/assemble.ts`
  (zip-inputs.ts deliberately mirrors ~80 lines of page assembly until then).
- Inventory: corridors 27 (`fixtures/corridor-centroids.json`) → `/r/cre-swfl/[corridor]`;
  brain topic pages `/r/[slug]` + `/r/housing-swfl` (enumerate from route registry);
  communities/neighborhoods (count from the communities pack detail tables). Excluded:
  /r/search, /r/method/*, /r/source/*.
- Phone standard applies to every new section (spec §Phone): sized for phone, no
  horizontal scroll, no hover-gated affordances — verify at phone width before closing
  each phase's live-verify. Grid-lab reference: `2026-07-05-grid-lab-phone-design.md`.

## Open checks (ledger, not this file)

- `zip_page_destination_live_verify` — closes when: homepage click → narration + news +
  Down the Road render live + a delta-gated bake shows in api_usage_log under cap.
- `anthropic_workspace_spend_limit` — OPERATOR: Anthropic Console monthly workspace
  limit (~$199k balance; only guard outside our code). Suggested $100–250/mo.
- `zip_page_queue_line_sync` — add the build-queue line once the parallel session's
  claim on `_AUDIT_AND_ROADMAP/build-queue.md` frees.
- `lab_phone_side_panel_visibility` — separate build, operator-reported phone gap.

## Landmines

- `database-generated.types.ts` doesn't know `narratives` yet — `lib/narratives/store.ts`
  is on the untyped allowlist. On the next types regen, type it and remove the allowlist
  entry.
- Bake script refuses a REAL run without ANTHROPIC_API_KEY (dry-run works offline);
  weekly gate means a Tuesday manual dispatch without `--force`/`force=true` no-ops.
- Validator strictness: if live bakes fail on legitimate phrasing (e.g. hyphenated
  number-words), fix by widening `lib/narratives/validate.ts` deliberately — never by
  skipping validation. Failed bakes keep the previous row by design.
- Never point the bake at `master --force` GHA habits — narrative-bake is its own
  workflow; the daily brain rebuild is untouched by this build.
