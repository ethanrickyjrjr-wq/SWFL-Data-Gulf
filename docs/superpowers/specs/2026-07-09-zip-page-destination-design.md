# ZIP page as homepage destination — narration, radius news, Down the Road

**Date:** 2026-07-09 · **Check:** `zip_page_destination_live_verify`
**Status:** operator-approved design (brainstorm 07/09/2026); reverses the 07/03/2026 "map click = email lab" ruling.

## Problem

Homepage ZIP clicks (map polygons + top-5 rail rows in `components/landing/Hero.tsx`)
land visitors in `/email-lab?zip=` holding a zip-seeded **email doc** — email footer,
"figures refresh when this email rebuilds," a "See the full ZIP report" CTA. A curious
visitor gets an email-authoring tool instead of intel (operator screenshot 07/09/2026:
"this isn't an email. no one wants this. they want claude telling them what is going on").

Meanwhile the rich destination already exists — `app/r/zip-report/[zip]/page.tsx` (ZIP
cutout hero, top-3 ranked signals with the why, full signal grid, city/county/SWFL dossier
prose, ZHVI trend chart, nearby ZIPs, citations) — and only the search bar routes to it.

Operator constraint: the page must still make clear what we do to get paid ("people have
Google"), without reading like a brochure.

## Research evidence (RULE 0.4, crawl4ai 07/09/2026)

- **Zillow programmatic pages** convert by making the forward action native to the page's
  purpose (browse → contact agent; compare rates → get pre-qualified) — conversion is part
  of the content's utility, never a bolted-on banner.
  Source: https://www.withdaydream.com/library/playbooks/zillow
- **Product-led content**: the artifact itself demonstrates the product (Yazio calculator →
  app; Typeform watermark makes every free artifact an ad — we already run this play with
  watermark-until-send). Source: https://userp.io/content-marketing/product-led-content/
- Applied: the ZIP page shouldn't *explain* the product — it should visibly **be** engine
  output, with "this breakdown, branded as yours, sent weekly" affordances at the moment
  of interest.

## Goal

Homepage ZIP click → a top-tier ZIP page: Claude-written narration from real numbers,
genuinely local (ZIP-radius) pulse news, a hedged "Down the Road" outlook — with the
build-an-email funnel woven into the content, not bolted on.

## What we're building

Four phases, each a separate PR, shipped in order.

### Phase A — routing flip (small; fixes the complaint immediately)

- `components/landing/Hero.tsx`: map polygon clicks + rail rows navigate to
  `/r/zip-report/[zip]` (replace `openZipInLab` call sites; keep `router.push` /
  full-page nav consistent with the report route).
- Copy: tooltip `tip-cta` "Click → open as a branded email" → "Click → full ZIP
  breakdown"; rail hint + `aria-label`s likewise; `map-sub` paragraph reworded.
- The email lab stays reachable via the zip page's existing build-bridge (`openZipLab`).
- Nothing else on the homepage moves (agent-first hero order stays per
  `2026-07-05-agent-first-homepage-design.md`).

### Phase B — baked narration + Down the Road

**Bake job** (post-daily-rebuild, GHA):
- Inputs per ZIP: ranked signals (`lib/zip-report/candidates.ts` + `signal-rank.ts`
  outputs), dossier lines, metro trend, master direction call, permits, flood.
- **Delta-gated**: hash the numeric inputs per ZIP; bake only ZIPs whose hash changed
  (housing moves weekly / ZHVI monthly, so most days most ZIPs skip).
- **Batch API + Sonnet** (`claude-sonnet-4-6` per the pulse-distill precedent; batches =
  50% off). Cost at list price: ~2.6¢/ZIP full; typical delta-gated day well under the
  $1/run cap; first full bake ~$1.60 batched → needs its own explicit per-pipeline cap
  env var line in the workflow file (ingest/CLAUDE.md rule — never a code default).
  Wired through `RunBudget` + daily-ceiling preflight like every LLM pipeline.
- Sink: new `public.zip_narratives` table (zip pk, sections jsonb, inputs_hash,
  baked_at, model, sources jsonb). Table, NOT committed files — the rebuild bot cannot
  push to main (live-data freeze). Idempotent upsert.
- **Quality gate**: sections run the narrative validators (facts-only where applicable,
  inference contract on the outlook, smoothing lint) BEFORE the upsert; a failed bake
  keeps the previous row — same failure posture as brains.

**Sections** (rendered between hero signals and the grid on the zip page):
1. *What's going on here* — plain-language read of this ZIP's ranked signals; every number
   already carries a source from the candidate pool; as-of date stated once MM/DD/YYYY.
2. *Down the Road* — 2–3 [INFERENCE] paragraphs; each cites its audited base value and
   states one falsifier; hedged per the corridor-character speculative pattern. No
   direction call of its own beyond master's thesis (tier discipline holds).

### Phase C — ZIP-radius pulse news

- **Distiller** (`ingest/pipelines/city_pulse/distill.py` + corridors twin): add
  `location_anchor` (nullable string) to the extraction `input_schema` — the most
  specific place the item names (street address / intersection / plaza-landmark /
  neighborhood / null = city-wide). Zero additional LLM calls.
- **Geocode ladder** (post-distill, plain code):
  1. street address → geocode → lat/lon → point-in-ZIP
  2. landmark → POI lookup → lat/lon → point-in-ZIP
  3. neighborhood/community → communities-swfl name-join
  4. null → city→ZIP mapping, tagged `city_wide`
- **VENDOR VERIFY BEFORE CODE (RULE 0.4):** geocoder choice is a flagged research item —
  Mapbox standard geocoding restricts storing results (permanent geocoding is a separate
  product/price); US Census geocoder is free + storable but address-only, no POI. Verify
  live terms via crawl4ai during writing-plans; do not guess.
- **Storage**: pulse rows gain `lat`, `lon`, `zip_code`, `geo_grain`
  (point|neighborhood|city|county). G1-clean (ZIP from item location only). Same PR ships
  the consuming pack change — city-pulse emits a `pulse_by_zip` detail table (G3 /
  brain-first satisfied). Vocab slugs in the same commit if any new metric slugs emit.
- **Page section**: "What's happening near {ZIP}" ordered by grain — point items within
  the ~3mi primary band (reuse the trade-area band thinking from
  `ingest/event-radius-config.yaml`) → neighborhood → city → county. Bigger-grain items
  visibly labeled (operator: city/county sneaking in is fine). Items keep their citation
  spans; TTL/supersession behavior unchanged.

### Phase D — funnel weave

- Inline module directly after the narration: live miniature of THIS ZIP's branded email
  (zip-seed already builds it) + "This breakdown, branded as yours, in your clients'
  inboxes weekly — free to build." Links to `openZipLab(zip)`.
- Existing bottom build-bridge + DigestSubscribe stay. No brochure sections anywhere.
- Zip-seed email itself is untouched — correct artifact for the lab audience; the bug
  was routing visitors into it.

## Explicitly out of scope

- Live per-view AI narration (cost + ungated-answer risk; the live layer is the existing
  ask/Q&A path, being fixed separately on the answer-path track).
- Changes to the email-lab grid or zip-seed email doc.
- New news sources or capture changes (Phase C reuses existing capture + distill).

## Error handling / failure posture

- Bake job: validator failure or budget stop → keep prior narrative row, exit loud
  (deterministic=exit 1) per silent-master-freeze rule.
- Page: missing `zip_narratives` row → page renders exactly as today (sections are
  additive, empty-tolerant). Missing pulse geo columns → news section hides.
- Geocode miss at every ladder rung → item stays city-grain; never invents a ZIP.

## Verification

- `zip_page_destination_live_verify`: operator clicks a homepage map ZIP → lands on
  /r/zip-report with narration + news + Down the Road rendering from live rows; a
  delta-gated bake run shows in api_usage_log under cap.
- Phase gates: A ships alone (routing + copy diff, `bunx next build`); B adds bake
  dry-run + golden narrative fixture test; C adds distill schema test + geocode ladder
  unit tests + pack Gate 5; D visual check in lab preview.
