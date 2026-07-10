# Event-fired market-area alert emails

**Date:** 2026-07-10
**Status:** APPROVED design (operator, in-session 07/10/2026) — awaiting spec review → writing-plans
**Check:** `market_area_alerts_live_verify` · Deferred question tracked: `alert_signup_conversion_funnel`
**Supersedes:** the CONTENT pipeline of `2026-07-03-weekly-read-design.md` (operator ruling 07/10/2026:
"Replace it" — the deterministic engine becomes weekly-read's content builder; that spec's subscriber
table, cadence, send, and CAN-SPAM plumbing all stand).

---

## Problem

The recurring free email (weekly-read) is calendar-driven and AI-built: every subscriber gets a
scheduled stat sheet whether or not anything happened. Operator critique (07/09/2026, verbatim
extracts): "No one is walking around asking for random zip numbers everyday. … Can build algos that
produce an email when these things happen. Numbers are just wired into the cards and shipped.
Receive emails for key indicators on this zip plus weekly movement. … Anything but receive another
email you have to delete from your inbox."

Calendar stat dumps get deleted; event-fired mail gets opened. The recurring email must become
event-driven, deterministic (no LLM in the loop), and quiet when nothing moved.

## Goal

A subscriber gives an email + ZIP. From then on they receive: (a) an alert email when a real,
detectable market event fires in their market area, and (b) a weekly movement roundup that only
sends when there is real movement to report — where "their market area" is a named group of 3–6
neighboring ZIPs, and quiet local weeks fill from city- and county-grain data we already hold.
Every number in every send is a held, citable figure (four-lane rule; lane 1 throughout). Every
send is tagged so opens/clicks per trigger type are measurable from day one.

## Research evidence (RULE 0.4 — crawl4ai, all pulled 07/10/2026)

- **Zillow Help Center, "Email types consumers can receive"** (zillow.zendesk.com article
  16115195331091): Zillow's consumer email set is event-driven at the core — saved-search alerts
  fire instant/daily on new or changed listings and deliberately send NOTHING when the search
  matches nothing ("a saved search for sale listings in Seattle will not generate an email";
  a ZIP + price band does); property alerts fire on price changes of $1,000+, status changes, and
  open houses. The ONLY calendar product in the catalog is the ~monthly, ZIP-scoped "Market Report"
  (subject: "90024 Market Report"). Alerts queue overnight and send once daily. This is the
  market-leader template for exactly this build: event alerts + a movement floor, silence by design.
- **Omnisend, "Email marketing statistics"** (omnisend.com/blog/email-marketing-statistics, citing
  their 2025 Ecommerce Marketing Report): automated/triggered emails ran 52% higher open rates and
  332% higher click rates than scheduled campaigns; automated messages were ~2% of send volume but
  drove 37% of email-generated sales in 2024; automated opens 38% vs 30.7% for campaigns.
- **Validity, "The State of Email in 2024"** (validity.com, PDF cited by the Omnisend page):
  behavioral-trigger marketing emails generate ~10x the revenue of other marketing email types.
- **Realtor.com, "Hottest ZIP Codes 2025"** (realtor.com/research/hottest-zip-codes-2025):
  methodology = market demand (unique viewers per property — proprietary, we do NOT hold) + market
  pace (days on market — we DO hold). Grounds the heat-leaderboard block: our producible variant
  ranks on pace + tightness + momentum from held fields only.

## Probe evidence (RULE 0.5 — what already exists; extend, never rebuild)

- **Deterministic delta engine** — `lib/email/activation/delta.ts` + `types.ts`: pure
  `computeReportDelta` diffs a STORED `ActivationSnapshot` against a fresh assembly; freshness
  tokens/dates stripped before fingerprinting; `has_change=false` is first-class. The snapshot-diff
  pattern this build reuses at ZIP grain.
- **Property Watch** (spec `2026-07-07-property-watch-design.md`, BUILT; crons parked): pure
  classifiers `lib/project/watch-event.ts` / `watch-delta.ts` — typed events
  (nearby_sale / nearby_new_listing / nearby_price_cut), fail-closed thresholds, raw-fact copy, no
  LLM, digest batching, "never stamp notified_at without a real send." The discipline template —
  but welded to authenticated projects; NOT reused directly (see rejected approach B).
- **Weekly-read plumbing** (spec `2026-07-03-weekly-read-design.md`, BUILT):
  `weekly_read_subscribers` table (email, zip, status, next_send_at, issues_sent, consent),
  `lib/email/weekly-read/cadence.ts` (pure), `send.ts` (Resend batch, chunk 100, per-recipient
  unsubscribe, List-Unsubscribe headers), runner `scripts/email/weekly-read-run.mts` with the
  safety ladder (DRY_RUN default, previews-before-send, gates skip, live needs
  WEEKLY_READ_APPROVED=1 + postal + verified From). ALL reused; only the content build path swaps.
- **Listing lifecycle at ZIP grain** — `data_lake.listing_transitions` + `listing_state` (the same
  tables Property Watch scans) carry new-listing / price-cut / sold transitions with prices.
- **Geocoded news** — pulse tables carry `location_anchor/lat/lon/zip_code/geo_grain` (zip-page
  Phase C); `lib/pulse/nearby.ts` already ranks items by distance band from `swfl-zip-centroids.json`.
- **Ranked signal pool** — `lib/zip-report/candidates.ts` (`loadRankedZipSignals`) ranks each ZIP
  against the region across metrics; the zip page and zip-seed email both read it.
- **Card composition + render** — zip-seed's deterministic grid blocks; `renderEmailDocHtml`
  (`lib/email/render-email-doc.ts`) is the ONE EmailDoc→HTML root.
- **Engagement tracking** — `app/api/webhooks/resend/route.ts` maps opened/clicked/bounced/
  complained per product tag (`did` blast / `rid` outreach / `wid` weekly-read, see
  `lib/email/blast-events.ts` and outreach `mapResendOutbound`); `/api/r/[token]` click-wrap exists.
- **Geo fixtures** — `fixtures/swfl-zip-centroids.json` (100 ZIPs), `swfl-zip-county.json`
  (100 entries; **Lee+Collier = 58 ZIPs** — the real data footprint), `swfl-place-zip-crosswalk.json`
  (11 named places, USPS-verified), corridor membership + barrier-island classification via
  `refinery/lib/zip-resolver.mts` (`resolveZip` → places, county, corridors, barrier).

## Operator rulings (in-session 07/10/2026)

1. **One engine, direct subscribers first.** Build the detector engine once; first surface is the
   public opt-in pipe (weekly-read subscribers). The agent-branded version rides the same engine
   later as the paid product.
2. **Alerts + movement-gated weekly, with fill.** Quiet ZIPs borrow movement from 2–3 nearest ZIPs
   (→ generalized to the market-area group); content is not ZIP-only — city and county fill-ins are
   wanted as attract content ("we don't have to be all about zips"). Occasional "insider extra" —
   a paid-tier morsel included free once in a while, flagged as such ("makes us look better and
   costs us nothing").
3. **Track opens + clicks; dashboard required** ("we are going to need a dashboard for that").
4. **Replace weekly-read's AI content pipeline** with the deterministic engine (reverses the
   07/03 content ruling; subscriber/send plumbing untouched).
5. **Footprint = data-backed ZIPs only**: Lee + Collier's 58 (operator caught the 100-ZIP
   overcount — 100 is the crosswalk file including counties with no real data; never imply
   coverage there). Hendry's 5 later only if its data earns it.
6. **Deferred, not dropped:** "people are reading, why aren't they signing up?" → instrument the
   page→subscribe funnel now (dashboard scope), diagnose when data exists. Check:
   `alert_signup_conversion_funnel`.

## Architecture

**Chosen — Approach A: a new pure detector module that becomes weekly-read's brain.**
New `lib/email/zip-events/` (working name; module docs use "market-area alerts") holding pure,
unit-testable detectors that mirror the two proven in-repo disciplines: activation's snapshot-diff
(a change is a comparison of two stored numbers — true by construction) and Property Watch's
classification (typed events, fail-closed thresholds, no LLM). Detection state is one snapshot row
per ZIP — scales with the 58-ZIP geography, never with list size. The existing weekly-read
subscriber table, cadence, batch send, unsubscribe, and webhook plumbing carry over; only the
content builder swaps.

**Rejected — B: generalize Property Watch to ZIP grain.** Its pipeline is welded to authenticated
projects (project feed/digest surfaces, per-property event vocabulary, `projects.watch_*` spec).
Bending it to anonymous public subscribers muddies both products — the same reason the weekly-read
spec refused to bend `outreach_recipients`.

**Rejected — C: detect in the brain layer.** Packs already compute deltas, but "what did we last
show this ZIP" is send-side state that doesn't belong in pure rebuild-from-scratch packs, and a
detection stage there would erect a new mandatory pre-materialization gate (RULE 3 C2). Brains stay
reporters; movement-vs-last-shown is the email layer's job.

## Components

### 1. Market-area fixture — `fixtures/swfl-market-areas.json` + generator

Generator script (`scripts/geo/build-market-areas.mts`) groups the **58 Lee + Collier ZIPs** into
~12–18 named market areas of 3–6 ZIPs and writes a committed, human-reviewable fixture. Rules, in
order:

1. **Place anchor:** every ZIP that `resolveZip` maps to the same named place joins that place's
   area (Cape Coral, Lehigh Acres' six, Marco Island, Sanibel, …). Customer-clean labels
   ("the Cape Coral market", "Sanibel & Captiva") — a label never exposes internal ids.
2. **Barrier lock:** island-classified ZIPs never merge with mainland areas regardless of centroid
   distance (Sanibel is not the Cape Coral market). Reads the resolver's barrier classification.
3. **Nearest-anchor fill:** unplaced ZIPs join the nearest anchor by centroid distance
   (`swfl-zip-centroids.json`), county-locked (a Lee ZIP never joins a Collier area), capped at a
   max-distance constant.
4. **Band flag:** a distance-joined ZIP whose median sale price is far off the area's band
   (constant, e.g. >2x median ratio — operator-tunable) is emitted with `needs_review: true` and
   listed by the generator, never silently auto-joined. Operator eyeballs the fixture once.

Static fixture, not runtime clustering, on purpose: a subscriber's market area must not churn
week to week; membership is citable (fixture carries sources + generation rules) and reviewable.
Fixture shape per area: `{ area_id, label, county, anchor_place, zips[], needs_review[] }`.
Excluded counties (Charlotte/Sarasota/Glades/Hendry) never appear — no implied coverage.

### 2. Detector engine — `lib/email/zip-events/` (pure)

Discipline (mirrors `watch-delta.ts` exactly): NO DB, NO disk, NO Date.now(), NO network — every
input injected; missing input ⇒ no event (fail closed, never an invented value); identical inputs ⇒
identical events. All thresholds are named exported constants (operator-set v1; subscriber-tunable
is out of scope).

v1 detector catalog — each emits typed `MarketEvent { type, grain: "zip"|"area"|"city"|"county",
area_id, zip?, class: "alert"|"weekly", facts: {label, from?, to?, value, unit, source}[] }`:

- **threshold-cross** (grain zip/area): median sale price, days on market, inventory/actives, or
  sold count crossing a round level or moving ≥ a % band vs the STORED snapshot. Reuses the
  activation snapshot-diff pattern (`computeReportDelta`-style numeric diff; same
  fingerprint/token-stripping rules where text is compared).
- **rank-flip** (grain zip): a ZIP entering the top-N of, or moving ≥ K places within, the ranked
  signal pool (`loadRankedZipSignals`) on a headline metric.
- **lifecycle-burst** (grain zip/area): ≥ N price cuts in the window, new-listing surge vs trailing
  baseline, or a notable sale — aggregated from `data_lake.listing_transitions` (aggregate at
  source; never haul raw rows).
- **nearby-news** (grain area/city): geocoded pulse items within the area's radius band (reuses the
  `lib/pulse/nearby.ts` distance logic + OSM attribution rule where Nominatim-resolved).
- **heat-shift** (grain area): a market area entering/leaving the county's top 3 on the heat rank
  (below).

**Heat rank (the signature block):** deterministic score per market area from held fields only —
pace (median DOM trend) + tightness (sale-to-list ratio) + momentum (median price + sold-count
movement). Formula = fixed weights over normalized ranks (constants in code, documented in the
module header). Research grounding: realtor.com's hotness = demand + pace; we hold pace/tightness/
momentum, we do not hold demand-views, so ours is named and cited as our own lake-derived rank —
never presented as realtor.com's. Ranked within Lee + Collier only.

**State:** new table `market_event_snapshots` (one row per ZIP: the facts last shown + heat inputs
+ as-of). Migration idempotent, run via Bun.SQL. Snapshot advances ONLY after a confirmed send
(Property Watch lesson: never stamp without a real send) — a failed send never swallows an event.

### 3. Composer — deterministic EmailDoc

`lib/email/zip-events/compose.ts`: events → EmailDoc using the existing grid card blocks (the same
builders zip-seed uses) → `renderEmailDocHtml` (the ONE render root; grid docs hit the compileGrid
engine real sends use — never a fourth renderer). No LLM anywhere. Copy is slotted template
micro-copy around held numbers (Property Watch's `describeWatchEvent` precedent); subject line IS
the event ("3 price cuts in the Cape Coral market this week"). No hedge-encoding of hard numbers;
as-of date stated once, MM/DD/YYYY; sources ride in the collapsed list per the consumption contract.

Email anatomy (weekly roundup): subject-ZIP/area event cards → heat leaderboard (bar/table card,
"hottest market areas in Lee & Collier this week") → city fill (pulse items) → county fill (trend
line from county-grain data) → occasional insider card (one paid-tier detail-table morsel, plainly
flagged as usually-paid; frequency constant, e.g. every 4th issue — operator-tunable) → build-your-
own funnel CTA (existing lab-entry root) → unsubscribe/CAN-SPAM footer (existing).
Alert email: the firing event's cards + minimal context, same skeleton.

**Movement gate + fill ladder:** subject ZIP events → market-area sibling events → city pulse →
county trends. With four grains feeding, a genuinely empty week should be rare (the operator's
"most likely something will happen" — now true by construction, with zero invented content). A
truly flat week ⇒ NO send (reported skip). Never a padded or bare email.

### 4. Cadence, caps, runner

- Daily detector pass (cron): scan all 58 ZIPs' fresh data vs snapshots, classify events, queue.
- **Alert class:** batches into at most ONE email per subscriber per day (Zillow's overnight-queue
  pattern). An alert send within the roundup window absorbs the roundup (no double-send).
- **Weekly class:** roundup on the configured weekday, movement-gated with the fill ladder.
- Runner: `weekly-read-run.mts`'s content path swaps `buildContentDoc` → the composer; safety
  ladder unchanged (DRY_RUN default true, previews written before any live block, gate failures
  skip, live requires approval env + postal address + verified From; agent never sends live).
- Subscriber's `market_area_id` derives from their ZIP at read time via the fixture (no schema
  change needed for v1; an index-friendly derived column is a later optimization).
- Cost: zero per-send LLM calls; the only paid surface is Resend sends (existing).

### 5. Tracking + dashboard

- Every send tagged: product tag (`ma` — market-area alerts; distinct from `did`/`rid`/`wid`),
  issue id, `trigger` = the detector type that caused the send, area_id.
- Webhook route grows an extract for the new tag (mirrors `extractBlastAction`) → engagement rows
  per event type. From the FIRST send we learn which triggers earn opens and tune the catalog on
  evidence.
- Click-wrap through the existing `/api/r/[token]` path where links need attribution.
- **Dashboard = ops app** (house rule: ops pages live in swfldatagulf-ops, not brain-platform).
  Its own small build, out of scope here; the tags ship NOW so data accrues from day one. Scope
  when built: opens/clicks by trigger type, subject, area; deliverability (bounce/complaint);
  page→subscribe funnel (the `alert_signup_conversion_funnel` question).

### 6. Coexistence + capture reframe

- The AI content engine keeps powering the lab and agent deliverables — it only stops writing this
  recurring email. Daily digest (Phase 2) untouched. Activation 2-step sequence untouched.
- Zip-page `DigestSubscribe` copy reframes around the alert promise ("Get alerted when this market
  moves"); the Phase D funnel module's "weekly email" line gets the same reframe in a small
  follow-up commit (separate, after this ships).

## Error handling

- Detector: any missing input (null metric, absent snapshot, unresolvable ZIP) ⇒ that detector
  emits nothing for that ZIP; first-run ZIPs (no snapshot) seed a snapshot and emit nothing.
- Composer: zero qualifying events after the fill ladder ⇒ reported skip, never a send.
- Runner: a subscriber row failure never throws past its boundary (existing pattern); snapshot
  state advances only after confirmed send; DRY_RUN mutates nothing.
- Fixture: generator failures/review flags block fixture commit, not the send path (previous
  fixture stays in force).

## Testing

- Pure cores TDD'd with bun:test (Property Watch precedent: watch-delta/event/digest = 29 tests):
  every detector (fires / fails closed / respects thresholds), heat rank (deterministic ordering,
  missing-input ZIPs excluded not zero-filled), movement gate + fill ladder, alert-absorbs-roundup.
- Fixture generator: snapshot test over the committed fixtures (place anchor, barrier lock, county
  lock, band flag) — regeneration diffs must be intentional.
- Composer: golden EmailDoc tests (event cards, leaderboard block, insider flag, CTA + unsubscribe
  present); render through `renderEmailDocHtml` in tests (no new renderer).
- Runner: DRY_RUN end-to-end writes previews + sends nothing (existing harness pattern).
- Live verify (`market_area_alerts_live_verify`, operator-run): a real subscriber receives an
  event-fired email whose every number traces to a held row; webhook logs open/click rows tagged
  with the trigger type; a flat-week dry-run shows the reported skip.

## Out of scope (v1)

- Agent-branded paid version (same engine, next build).
- Ops dashboard build (tags ship now; dashboard is its own build in the ops repo).
- Subscriber-tunable thresholds/frequency (operator constants v1).
- SMS/push. Hendry expansion. Anything outside Lee + Collier.
- Folding the activation sequence or daily digest into this engine.

## Open questions (tracked, not blocking)

- `alert_signup_conversion_funnel` — why do readers not subscribe? Instrumented by the dashboard
  scope; diagnose with data.
- Heat-rank weights and every detector threshold are [PROVISIONAL] operator-tunable constants;
  first weeks' engagement data (per-trigger opens) inform tuning.
