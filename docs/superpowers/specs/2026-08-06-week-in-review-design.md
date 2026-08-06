# Week in Review — builder-facing period read off the transitions feed

**Date:** 2026-08-06
**Status:** DESIGN — measurements in this file are live and dated. Implement from here; do not re-derive.
**Check:** `week_in_review_live_verify`

---

## Origin

Operator, 08/06/2026: *"do we have any pages helping builder speak that can auto consolidate a
'week in review' based on the week for different zip codes, cities and county... we need all
important data brought to one area, seperated into buckets/catagories/time and give builder a better
vocabulary."*

Then, when the first pass came back asking which grains to bake: *"WHAT ARE WE FANNING OUT ON? WE
ALREADY HAVE THE DATA COMING IN ON ZIP PAGES, DO WE NOT AND /R/ PAGES AND ALL OTHER PAGES. WE START
BUILDING FROM NOW FORWARD. WE DON'T NEED NEW DATA. WE WILL WORRY ABOUT QUARTER AND YEARLY WHEN WE
NEED TO."*

He was right. The fan-out question was the defect — it priced a bake matrix for data already
collected. **No new ingest. No new source. No fan-out.**

Standing rule for this surface, same session: *"MAKE SURE WE STICK TO PROVEN TACTICS FROM SOLID
INTERNET REFERENCES AND USE CRAWL4AI... I WANT RESEARCH EVERY TIME WE WORK ON THIS TO GET A LITTLE
BETTER. BUT WE NEED TO START OFF ON THE RIGHT FOOT SO EVERYTHING FROM HERE IS ONLY MINOR
ADJUSTMENTS."* See §7.

---

## §1 — The feed already exists and already accrues. Measured, not assumed.

`data_lake.listing_transitions` — the log half of the daily listing spine (`data-roots.md:562`, :593).
Every state change carries a timestamp (`"at"`), a price delta, and an address key that joins to geo
through `listing_state`.

**Live probe 08/06/2026 — last 7 days, whole coverage:**

```
active->active     1060   price changes
active->holding     527   went pending
holding->sold       122   sold out of pending
holding->active      74   back on market
active->sold         73   sold direct
active->withdrawn    27   withdrawn from active
holding->withdrawn   25   withdrawn from pending
```

**Correction (Sonnet 5, 08/06/2026, live-verified):** the loader's own live coverage-start query
returns **2026-07-02**, not 06/22 as originally measured — the earliest date below was stale by the
time Task 1 shipped. `loadWeekInReview` queries this live rather than trusting either number, which
is exactly why: a hardcoded coverage-start would have been silently wrong here. `listing_state`
newest `last_seen` 08/06/2026, 35,622 rows.

~~Six unbroken weeks of rows back to 06/22/2026.~~ (superseded, see correction above)

**Those seven transition kinds ARE the buckets.** Not a taxonomy we invent — the states the sweep
already writes. The page groups by them; it does not rename them.

Existing rollups on the same root — reuse, don't rebuild:
- `listing_transitions_recent_zip_stats` — 30d/90d counts per ZIP in ONE pass (price cuts, raises,
  new holdings, sales, new listings, pending sale price), joins `listing_state` for geo. Read today by
  `lib/email/market-context.ts:458` and `lib/concoctions/defs/zip-listing-activity.ts:38`.
- `listing_pulse_daily` — daily view, read by `/desk` (`lib/desk/loaders.ts:339`) and the charts
  gallery (`lib/charts/gallery-loaders.ts:148`).

---

## §2 — WHY the forward-only lane is the RIGHT root here (and wrong elsewhere)

`data-roots.md` **T11** (:76, :119) is load-bearing; read it before touching any price-cut number on
this surface. A price cut has two honest answers that disagree BY DESIGN:

- `listing_transitions.price_delta` — **our FORWARD-ONLY sweep.** Sees only cuts after we started
  watching a listing. On an older listing a "total cut" is confidently too small. Complete inside the
  window, blind before it.
- `steadyapi_listing_events_v.price_change` — the **vendor's BACKWARD history**, the whole trail back
  to the original ask, but only for the ~17.9k properties we probed. Listing-scoped; **can never roll
  up to a ZIP or county.**

**A week-in-review asks exactly one question — what happened inside this window — so the forward-only
lane's known weakness is irrelevant here.** This is the one surface where that root is not merely
acceptable but correct, and where the vendor lane would be actively wrong (it cannot form an area
statistic).

**Hard rules carried from T11:** label which lane a figure came from; never sum across lanes; never
let the vendor lane leak into an area share (that root is `listing_momentum_stats.price_reduced_share`,
T3).

---

## §3 — Structure: proven, sourced, not invented

Source for all of §3: `_RESEARCH/email-and-social/2026-08-03-strongest-real-estate-email-concepts-structure.md`.
Quoted here so implementation never re-derives it.

**Section order — Rev Real Estate School "Market Mondays"** (Part C, verbatim template captured via
crawl4ai). A named, currently-taught WEEKLY email:
1. **Feedback** — counts, "what this means for us," always "we" never "you."
2. **Market Update** — position vs. market via hard figures + links to comparable listings, **not
   embedded charts**. Language rule: hedge ("suggests"), never assert.
3. **Marketing** — view/favorite counts + non-MLS traffic.
4. **Recommendation** — a specific numeric ask, reasoned from the two sections above.
5. **Conclusion** — closes pushing to a **phone call**, never stays in the surface.

Cadence is weekly *deliberately* — it exists to force a recurring touchpoint and build a paper trail,
paced to the seller's anxiety cycle, **not to data freshness.** That is the argument for week as the
base window, independent of what our data supports.

**Sentence shape — NAR existing-home-sales release** (Part C, cleanest "big number to a lay reader"
example found): one giant bare number first, above any sentence → one plain-English paragraph
translating it → named-authority commentary explicitly separated from the raw number → escalating
depth links, cheapest first → **the exact date of the NEXT release, stated plainly**.

NAR's grain is national + 4 regions only; it explicitly leaves ZIP/neighborhood to local layers.
**That is our lane** — stated in the research file verbatim.

**Failure modes to design against — EmerickTech, quoted:** *"A useful market update email should
explain what changed, what that change may mean for the recipient, and what they should consider doing
next. It should not simply repeat market statistics."* Named failure modes: same update to buyers and
sellers; stats with no stated reporting period; broad-market content when the contact cares about one
price band; predictions the data doesn't support; no next step.

**Cadence evidence:** GetResponse 2024, 4.4B messages — newsletter engagement peaks at **1/week**;
drip response **halves after the 2nd message**. (A crawl4ai pass this session on Campaign Monitor's
benchmark page returned **2022** figures — older than what we already hold. Recorded so nobody
re-fetches it expecting an upgrade.)

---

## §4 — What we build

**One page. One window. The window is a parameter, not a schema.**

- **Grain:** zip, city, county — same query, geo resolved through `listing_state`. The enum already
  exists and is typed: `MarketEventGrain = "zip" | "area" | "city" | "county"`
  (`lib/email/zip-events/types.ts:16`).
- **Window:** 7 days, a parameter with a default. Quarter/half/year change the parameter and nothing
  else. **Do not build them now** (operator: *"WE WILL WORRY ABOUT QUARTER AND YEARLY WHEN WE NEED
  TO"*).
- **Buckets:** the seven transition kinds in §1, grouped, in Market Monday's section order.
- **Chips:** reuse the existing `MarketFact` shape — `label`, `from`, `to`, `value`, `unit`, `source`,
  optional `url` (`lib/email/zip-events/types.ts:21`). It is already the "number that names its
  source" contract. Do not mint a second one.
- **Open slots:** the builder's own commentary and CTA are open fields, per the slot rule in
  `lib/email/CLAUDE.md` — empty string means the slot gets filled; a filled value may simply be kept.
- **Charts:** via `buildChartForQuestion`, subject to `assertHeroChartCoherence`. Note Market Monday's
  own rule — link to comparables rather than embedding charts in the update section.

---

## §5 — Explicitly OUT of scope, with the reason recorded

**The snapshot store. Do not wire to `market_event_snapshots`.**

Measured 08/06/2026: **0 rows.** Structural, not a backlog. `lib/email/zip-events/state.ts:322`
verbatim: *"Upsert snapshots AFTER a confirmed send only (never stamp without a send). DRY_RUN never
calls this."* Its only callers are `scripts/email/weekly-read-run.mts:608,651`, and
`.github/workflows/weekly-read.yml` has its `schedule:` **commented out** pending an operator-approved
live cycle. `weekly_read_subscribers` holds **1 row**. Market history accrues only as a side effect of
emailing a subscriber; with no cron and one subscriber it stays empty indefinitely.

That store answers *"what did we last SHOW you"* — alert dedup. This surface answers *"what happened
this week."* Different questions. Wiring to it inherits the send-lock for zero benefit.

**Also out:** quarter/half/year windows (§4); the ZHVI chart question (tracked as
`zhvi_index_plotted_as_value_market_pulse` — `data-roots.md:75,:115` demoted `zhvi_*` to index-only
07/18 and Market Pulse still plots it).

---

## §6 — Failure modes and the guard for each (RULE 3.5 — no design ships without this)

1. **Cross-lane price-cut sum.** Someone adds the vendor's backward history to our forward-only sweep
   and reports one "total cuts" number. → **Guard:** a test that fails if any figure on this surface
   sources from `steadyapi_listing_events_v`; this surface reads `listing_transitions` only. T11 quoted
   in the loader's header comment.
2. **Silent window truncation.** The sweep is blind before it started watching a listing, so an early
   window looks artificially quiet. → **Guard:** the surface states its own coverage-start date
   alongside the window (NAR's "reporting period stated plainly") and refuses to render a window
   beginning before the feed's earliest row.
3. **Empty window rendered as "nothing happened."** A quiet ZIP and a broken query look identical.
   → **Guard:** empty-tolerant like `getSourcedFigures` — zero events renders as an explicit "no
   recorded changes in this window," never a blank section, and a query ERROR renders differently from
   a genuine zero.
4. **Unsourced number reaching a reader.** → **Guard:** every figure travels as a `MarketFact` with a
   populated `source`; the caller's `unanchoredNumbers` check runs before any prose ships — the same
   contract `bakedAreaRead()` already enforces.
5. **Stale read presented as current.** → **Guard:** as-of stated once, MM/DD/YYYY, plus the
   next-update date (NAR anatomy element 5). If baked prose is ever used here it goes through
   `bakedAreaRead()`, which recomputes `inputsHash` and rejects a moved-input row.
6. **Grain leak.** A city figure computed from a partial ZIP set presented as the city's number.
   → **Guard:** geo resolution through the `listing_state` join only; a grain with incomplete ZIP
   coverage inside the window is labelled, never silently rolled up.
7. **Recipe-shape mismatch.** Wiring baked prose into a recipe whose gate rejects digits. → **Guard:**
   check the target recipe's guard shape first — `market-pulse` runs a zero-digit audit
   (`auditConnective`) and would reject on contact; `sphere-weekly` deleted its digit-token guard and
   has nothing to validate against. Documented in RULE 0.7b.

---

## §7 — Standing ritual (operator decree, 08/06/2026)

**Every work session on this surface opens with a crawl4ai pass** on current engagement craft —
subject lines earning clicks now, format, return-rate tactics — and files findings into
`_RESEARCH/email-and-social/` **with the `INDEX.md` line written in the same pass.** Unindexed research
does not exist (RULE 0.4).

The bar: v1 must be right enough that everything after is a minor adjustment. That is why every
structural choice above names the source that proved it, and why nothing here is invented.

Known craft gaps already identified in the 08/03 research, worth closing next pass: subject-line
convention (Luxury Presence's 14-type taxonomy is captured; we have no documented convention in
`lib/email/`), and merge-tag token syntax (no industry standard — 4 conventions observed; we pick and
document once).

---

## §8 — TDD (RULE 3.5, mandatory)

Write the failing test named after the failure mode, then implement. Minimum one per deterministic
guard in §6: cross-lane rejection (1), coverage-start refusal (2), empty-vs-error distinction (3),
unanchored-number rejection (4), grain-completeness labelling (6).

§6.5 (staleness) and §6.7 (recipe-shape) are guard-type failures, not logic failures — a green suite
does not cover them, per the TDD scope limit in RULE 3.5.
