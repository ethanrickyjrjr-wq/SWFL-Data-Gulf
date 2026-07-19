# Why Isn't It Selling — free seller diagnostic + agent radar (v1: engine + seller page)

**Date:** 2026-07-19 · **Check:** `why_isnt_it_selling_live_verify`
**Approved by operator in-session 07/18–07/19/2026** (audience, voice, ladder, and pricing shape
chosen via Q&A; "continue. we will add more to it when we can").

## Problem

A homeowner whose listing has sat for months has no honest, data-backed answer to "why isn't it
selling." The industry HAS the answer — an entire propensity/seller-stress scoring market
(Homebot, CoreLogic Sell Score, Datazapp) computes it and deliberately hides it from the seller
(07/17/2026 landscape research, 168 ranked findings). Search results for the question are
content-marketing listicles and agent-referral funnels (FastExpert "22 reasons", EffectiveAgents
"7 fixable problems" — DuckDuckGo sweep 07/18/2026); no product computes the answer for a
specific address. Meanwhile agents pay a blended **$503 per lead** (NAR survey of 5,400
professionals via jtek.app benchmark, 05/18/2026; Google Search $53–66, Realtor.com $165, Zillow
Premier Agent $139–223) and $60+/mo for *expired* listing feeds (REDX; realestateagentleads.com
roundup 05/30/2026) — lists of homes that already failed, with no diagnostics and no pre-expired
window.

We now hold the data both sides lack: de-floored per-listing days on market (07/18 backfill),
cumulative DOM across relists, full price-cut event history, daily ZIP-grain typical DOM from our
own book, and the FDOR parcel spine (prior sale price/date, year built, living area — verified
live 07/18). ~4,700 Lee/Collier active listings sit 180+ days: an addressable, identifiable
population.

## Positioning (locked)

**Nobody works FOR the seller — we do.** The homeowner report is FREE and complete; we never
default-route the homeowner to agents (opt-IN only, never pre-checked). Money lands on the agent
side (radar subscription) where willingness-to-pay is verified. Officialness comes from
provenance — named sources + as-of dates on every figure + county-record joins — not from an
agent-network badge.

## Product ladder (operator-locked 07/18–07/19)

1. **v1 (this spec): free seller report** at a public route. Full report free, no card anywhere.
   Email required only to TRACK the home (re-run + delta email until it sells). Explicit opt-IN
   (default OFF) for "connect me with one vetted local agent" — email-only routing, never phone.
2. **Fast-follow (own spec): agent "Stale-Listing Radar"** — $19.99/mo intro (anchored vs $503
   blended lead cost / REDX $60): daily feed of new long-sitters in chosen ZIPs, per-home
   diagnostics, exportable talking points, diagnose-your-own-listing. Volume/feed features are
   the fence — no identity verification anywhere.
3. **Later: print-and-mail add-on** inside radar ("mail the owner a letter" button — PostGrid/Lob
   confirmed as API print-mail vendors 07/18; per-piece pricing to verify then) and **our own
   direct-mail growth loop** to the 180+ cohort with personalized report links.
4. **Pricing is a knob**, not a foundation: repricing = Stripe lookup-key swap
   (`scripts/stripe/reprice-tier.mts` precedent). No Stripe work in v1 at all.

## Research the design leans on (crawl4ai, 07/18/2026 — RULE 0.4)

- No seller-facing diagnostic product exists (SERP = content + referral funnels). Whitespace
  confirmed live, consistent with the 07/17 landscape memo.
- Lead-cost anchors: NAR blended $503/lead (jtek.app 05/18/2026); REDX seller leads from $60/mo.
- **FCC one-to-one consent rule formally eliminated** (final rule ~09/2025; Goodwin Law
  09/15/2025 alert) — multi-agent routing of a consented lead is not per-se blocked. We still
  route **email only** and never the phone number (baseline TCPA + Florida telemarketing statute
  stay out of scope entirely).
- PostGrid print-mail pricing page live; G2 runs a 2026 Lob-vs-PostGrid comparison — the
  print-mail lane is real; verify per-piece rates when that add-on is specced.

## Code substrate (probed live 07/18–07/19 — RULE 0.5)

- `data_lake.listing_dom` view — the DOM authority: `dom_days`, `dom_is_floor`, `cdom_days`,
  pass-through listing columns. De-floored by the 07/18 `backfill_listed_date` run (in flight at
  spec time; ~98% vendor-date hit rate past the miss-head).
- `data_lake.zip_active_dom_median(zip)` — per-ZIP median over exact (non-floored) active rows,
  with `sample_size` (07/18 migration).
- `data_lake.listing_transitions` — price cuts as discrete events (`from_state = to_state`,
  `price_delta < 0`, date `at`); relists as `from_state='holding'` rows. Per-address read
  precedent: `lib/back-on-market/relist-fact.ts` (reused unchanged, one authority).
- `lib/listings/dom.ts` `formatDom`/`formatSoldSpell` — the ONE DOM wording authority.
- `lib/listings/select.ts` — probe-on-use healing for floored rows (≤3/request), address-key
  matching (`lib/listings/address-key` lane), `LAKE_LISTING_COLUMNS` read shape.
- `lib/buyer-leverage/` — the buyer-side sibling (07/18 design): `dom-read.ts`, `zip-benchmark.ts`
  (sample-size suppression pattern to copy), ReportShell chrome + `resolveQToZip` on
  `app/r/back-on-market` / buyer-leverage routes.
- Parcels (verified live 07/19): `data_lake.lee_parcels` / `collier_parcels` both carry
  `sale_prc1/sale_yr1/sale_mo1` (+ `_2` prior pair), `actual_year_built`, `effective_year_built`,
  `living_area_sqft`, `land_value`, homestead fields, and site address (`phy_addr1/2`,
  `phy_city`, `phy_zipcd`). **No owner-name / owner-mailing columns exist** — owner/absentee
  features are OUT of scope pending a source probe (follow-up check).
- Parcel↔listing join: the existing address-key machinery (`matchSubdivision` lane; see open
  check `ingest_parcel_year_built_join`). Known miss class: condo units (Marco 0/360 precedent) —
  a join miss OMITS the affected check, never guesses.
- ZHVI (`zhvi_*`, home-values-swfl) — label **"typical home value," NEVER "median"** (T2,
  data-roots). Used only as a %-change series for the anchor-gap check.
- Email: Resend send path exists (`lib/email/`); CAN-SPAM = 4 requirements incl. physical postal
  address (open operator item `platform_postal_address_operator` — the watch email ships AFTER
  that address exists).
- Billing exists (`lib/billing/` Stripe client/sync/tiers) but is untouched in v1.

## What we're building (v1)

### 1. Diagnostic engine — `lib/why-not-selling/` (pure, testable)

One module per check; each check is a pure function over injected rows returning
`{ status: "flag" | "clear" | "unavailable", headline, detail, figures[] }` where every figure
carries `{ value, source, asOfMdy }`. A check with missing inputs returns `unavailable` and the
page omits it (four-lane: gaps are omitted or filled from a named lane, never invented). Wording
for any DOM number goes through `formatDom` — no local composition.

**The v1 checks:**

1. **Market speed** — subject `dom_days` (floor-honest) vs `zip_active_dom_median` AND vs the
   subject's own price band: new SQL function `zip_band_dom_median(zip)` (returns all price
   quintiles + sample sizes in one call) over `listing_dom` for that ZIP's active book. Suppress the ZIP figure below the
   `sample_size` floor (reuse the zip-benchmark suppression convention).
2. **Cumulative time / relists** — `cdom_days` vs `dom_days`; relist events from
   `relist-fact.ts`. Framed exactly like the buyer report but voiced to the seller ("buyers'
   tools see the cumulative number").
3. **Price-cut history** — the subject's cut events (count, total %, dates, gaps) vs the ZIP's
   price-cut share (`listing_momentum_stats`). States facts; the `price-reduced.ts` framing
   prohibition list applies verbatim (no "why it moved" inference).
4. **Price position** — ask vs the ZIP's ACTIVE book: percentile of list price and $/sqft within
   property-type cohort where sqft is held. Computed in SQL over `listing_dom` rows, not in TS.
5. **Anchor gap** — parcel `sale_prc1` + `sale_yr1/mo1` ("purchased MM/YYYY for $X") + ZHVI
   typical-home-value % change from purchase month to now ("typical value here moved +Y% since");
   states what the current ask implies, draws no conclusion. Join miss (condo class) → check
   omitted. Multi-parcel-sale flag rows (`multi_parcel_sale_1`) → omitted (price isn't the
   home's own).
6. **Competition** — active count in the ZIP now, share sitting 90+/180+ days (from
   `listing_dom`), plus sold-side context labeled as such: months of supply, sale-to-list,
   sold DOM (housing brain / `redfin_swfl` — sold-side root, never interchanged with list-side).
7. **Cross-check line** — realtor.com's monthly ZIP median DOM (market-heat root) shown as a
   labeled discrepancy line ("our live daily read vs realtor.com's monthly") per the
   discrepancy-reporting rule.

**The honesty block (always rendered):** "what the data can't see" — condition, photos, staging,
showing feedback — and that this is exactly where a good local agent earns their fee. This block
is the natural home of the opt-in.

### 2. Route — `app/r/why-isnt-it-selling/page.tsx`

Server, `runtime="nodejs"`, `dynamic="force-dynamic"`, mirroring the back-on-market /
buyer-leverage shell (ReportShell/Header/Footer chrome, `resolveQToZip`):

- **Address entered** → subject-home report (all checks) + area context. Subject row fetched from
  `listing_dom`; floored subject gets the existing probe-on-use heal (≤3 cap shared).
- **Bare ZIP** → area read only (speed/competition/cut-share/cross-check).
- **Address with no active-listing match** → area read for its ZIP + a plain "we don't see an
  active listing at this address" (covers sold/withdrawn/never-listed; no fabricated signal).
- **Out of scope** → plain ask, never a dead end. (Hendry: subject reads stay Lee/Collier-only;
  a Hendry ZIP gets the area read once — and only once — its book is de-floored.)
- Every figure: named source + as-of MM/DD/YYYY. No system nouns anywhere on the page.

### 3. Track-it — email capture + watch store

- New `public.report_watches` table (id, email, address_key, zip, created_at, confirmed_at,
  unsubscribed_at, agent_optin_at, consent_text) — RLS deny-all client access; service-role only.
- Email is required ONLY for tracking (the on-page report never gates). Double-entry kept
  minimal: capture → confirmation email with one-click confirm.
- **Watch update email**: deterministic re-run of the checks on a weekly cron; sends only the
  DELTA (days climbed vs typical, new cuts nearby, competition change). Zero LLM, $0/run,
  unsubscribe one-click, ends automatically when the listing departs the active book ("your home
  left the market — this was our last update") or at a 12-month cap.
- **Gate:** the cron does NOT go live until (a) the operator reviews a rendered sample and (b)
  `platform_postal_address_operator` resolves (CAN-SPAM postal line). Ship the sender dark.
- **Agent opt-in**: default OFF, explicit checkbox ("have one vetted local agent review this with
  me"), consent text + timestamp stored. Routing is EMAIL ONLY and is a later phase — v1 only
  stores the consent; no agent sees it yet.

### 4. SQL (idempotent migrations, run directly per RULE 1)

- `zip_band_dom_median(zip)` — per-price-quintile median exact DOM + sample sizes.
- `zip_active_stale_share(zip)` — active count, 90+/180+ counts over `listing_dom`.
- Both `STABLE`, `GRANT EXECUTE TO service_role`, `NOTIFY pgrst` — same shape as
  `zip_active_dom_median`. `report_watches` migration with RLS.

## Non-goals (v1)

- No payments/Stripe surface, no radar, no print-mail, no owner-name/absentee features (columns
  absent — probe first), no bought/appended homeowner emails EVER, no LLM narrative, no phone
  collection, no new Tier-2 ingest (reads existing roots only — brain-first gate not triggered).

## Follow-up checks (opened at ship, not built)

- `stale_listing_radar_build` — the $19.99/mo agent surface (own brainstorm + spec).
- `parcel_owner_fields_probe` — FDOR layer: are owner name / mailing address exposed at source?
  Full-scope-first: census the fields, update `source_scope` in cadence_registry, THEN decide.
- `wins_print_mail_addon` — PostGrid/Lob per-piece pricing + the radar mail button.
- `wins_direct_mail_loop` — our own mailer to the 180+ cohort with personalized report links.
- `wins_watch_email_live` — flips when the operator approves the sample + postal address exists.

## Testing

- Pure-function unit tests per check: flag/clear/unavailable per input class; sample-size
  suppression; multi-parcel-sale omission; join-miss omission.
- Route smoke: address/ZIP/no-match/out-of-scope render classes (fixture rows, no live calls).
- Wording: every DOM string in output came from `formatDom` (grep-guard test like the existing
  one-authority tests).
- Watch store: RLS denies anon; unsubscribe idempotent; cron sender respects dark gate.
- Live-verify (`why_isnt_it_selling_live_verify`): after deploy, one real long-DOM address
  renders ≥5 checks with real figures, sources, and as-of dates; a ZIP-only query renders the
  area read; a floored subject heals or renders the floor honestly.

## Sequencing note

Engine aggregates are only truthful AFTER the 07/18–07/19 `listed_date` backfill completes and
`dom_backfill_listed_date_live_verify` closes; implementation can start immediately (fixtures),
but live-verify waits on the de-floored book. Hendry stays area-read-only until its cohort is
de-floored.
