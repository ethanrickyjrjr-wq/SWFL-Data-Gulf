# Lift /r/ brain report pages to ZIP-report bar (commentary + sources accordion + charts)

**Date:** 2026-07-18

## Problem

Emails and the assistant link readers to `/r/<brain>` pages (housing-swfl, cre-swfl,
communities-swfl, and the 40 generic `/r/[slug]` brain reads). Those pages are a numbers
dump: one-line conclusion → auto bar chart → grid of stat boxes → a "members-only" blurred
sources paywall → a subscribe form for the **daily digest that was killed 07/16**. No
commentary, nothing tying the page to why the reader arrived, nothing they'd want. The
ZIP-report page (`/r/zip-report/[zip]`) is already the professional bar: a written "What's
going on here", a forward "Down the road" call, a real closed Sources accordion, live
charts. The brain pages were never wired to the same pieces.

Root finding (2026-07-18, verified in-session): every piece the ZIP page uses **already
exists and already runs** — the brain pages just aren't fed by it.

- Commentary: `bake-narratives.mts` has a working `brain` surface adapter. A `--force
  --dry-run` shows **all 40 brain pages assemble** ("would bake brain/housing-swfl (6
  facts)" … cre-swfl 241 facts, permits-swfl 170, etc.). `housing-swfl/page.tsx` and
  `[slug]/page.tsx` already MOUNT `<NarrativeSections>`. They render blank because the bake
  isn't reaching brains: `BAKE_CADENCE` is unset (→ weekly, Mondays only) and all surfaces
  share one `NARRATIVE_BAKE_RUN_CAP_USD=$1.00` per-run cap, so the 55+ ZIP keys starve the
  brain keys out.
- Sources: `components/CitationList.tsx` IS the closed, collapsed Sources accordion (opens
  collapsed, one main source previewed). ZIP page uses it. Brain pages use `SourcesGate` (a
  members-only blur paywall) instead; housing shows no sources at all.
- Charts: `/charts` is a shelf of real, daily `data_lake`-fed components (MetroAreaChart,
  MarketTemperatureGauge, HurricaneRingChart, MomentumProfitLossPanel, ZipMomentumHeatmap,
  TierProjectionChart). Brain pages show only the auto HBar. `MetroAreaChart` +
  `loadMetroTrend` are already reused on the ZIP page — the reuse pattern exists.

Not a bug (verified, do NOT "fix"): the housing HBar chart rendering `$0.00` in a crawl /
headless tab is rAF starvation in a hidden tab — a real focused browser counts up to the
correct values ($3,299,254 …). Data is correct.

## Goal

Make every `/r/` brain page feel like something someone would want, updated daily, by
switching on and wiring the pieces that already exist — no new engines. One file
(`/r/[slug]`) serves 40 pages, so the generic fix lifts all of them at once.

## What we're building

### 1. Commentary (headline) — paid backfill + daily cadence
- One-time backfill: bake all 40 brain narratives (`--surface brain --force`). Sub-$1 at
  batch rates (operator-approved 2026-07-18). Lights up "What's going on here" + "Down the
  road" on every brain page. No-invention validator already gates it.
- Keep fresh daily: set repo var `BAKE_CADENCE=daily` (delta-gated → only re-bakes a page
  whose numbers moved; pennies/day).
- De-starve brains: give the brain surface budget it won't lose to ZIPs — a dedicated
  scheduled `--surface brain` bake and/or a raised/again per-surface cap. (Decide in build;
  simplest = dedicated daily brain bake step.)

### 2. Closed sources accordion (free)
- `/r/[slug]`: replace `SourcesGate` with `CitationList` fed from `display.metrics`
  sourceUrls (+ methodHref where present).
- `housing-swfl`: add `CitationList` (built from housing + seller-stress metric sources).
- Keep the login/members upsell OUT of the sources box — sources are the credibility proof,
  not a paywall (operator direction 2026-07-18).

### 3. Real charts from /charts (free)
- Add the matching rich chart to headline brains (housing/home-values → MetroAreaChart home
  values + MarketTemperatureGauge; env → HurricaneRingChart; etc.), reusing the existing
  components + their `data_lake` loaders (extract loaders from `app/charts/page.tsx` into
  `lib/charts/*` where needed). Keep the auto HBar as the per-page default fallback.

### 4. Layout + dead CTA (free)
- Reorder each brain page to the ZIP rhythm: header/signals → What's going on here → Down
  the road → chart(s) → key metrics → closed Sources accordion.
- Remove the dead daily-digest `DigestSubscribe` from the brain pages. (Global-footer dead
  CTA tracked as a separate check — see below.)

## Sequencing
Free wins first (2 → 4, verifiable via `bunx next build`, no spend), then kick the paid
backfill (1) and flip cadence. Verify served bytes on a real focused browser (not a crawl).

## Deferred / tracked as checks
- Global site-footer still runs the dead daily-digest signup (`SiteFooter.tsx`) — separate
  check.
- The real per-page "build this as an email" offer (region templates) — the email pass
  Ricky deferred.
