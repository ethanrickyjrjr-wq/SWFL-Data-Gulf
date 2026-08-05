# NEW LISTING — THE INGREDIENT CENSUS. What, where, how, and how much. Counted live 08/05/2026.

**Operator decree, verbatim:** *"take notes so we can replicate and make sure it works. try for least
expensive inhouse with paid fall back. crawl4ai what a new listing email entails and make ours
better. every build doesn't need all the data, but we need to have it available so find out what,
where, how and how much we can get and put it together according to the rules."*

**Every number below was produced by a query run in this session, not quoted from a doc.** The
scripts are in the session scratchpad; the queries are reproduced inline so they can be re-run.
Re-count before quoting any of it — the 08/04 postmortem was a two-week-stale DOM number copied out
of a doc instead of counted.

---

## 0. THE ONE-PARAGRAPH ANSWER

**The free lane covers the shape of the house; it does not cover the SELL.** Price, type, photo and
coordinates are ~100%. Beds/size are ~70–78%. **Baths are 15.3%.** And the three things that
actually make a New Listing email good — **the marketing description, the photo GALLERY, and the
year built — do not exist on the free spine at all.** They exist only on the paid row we already
bought. So the ladder is: free spine first for everything it holds, our own county records second,
**the already-purchased paid row third (costs nothing — it is on disk), and a NEW paid call last and
only on an explicit miss.**

---

## 1. THE FREE SPINE — `data_lake.listing_state` (daily SteadyAPI api_feed sweep)

**35,202 rows** · **34,904 `for_sale`** · 298 with a null status (a different, tiny source).
**Lee 24,548 · Collier 9,142 · Hendry 1,512.** Currently carrying the new-listing flag:
**Lee 1,967 · Collier 610 · Hendry 107.**

Fill, counted live:

| Ingredient | Column | Non-null | % of 35,202 |
|---|---|---|---|
| Asking price | `list_price` | 35,202 | 100% |
| Property type | `property_type` | 35,202 | 100% |
| Hero photo (ONE) | `photo_url` | 34,673 | 98.5% |
| Coordinates | `lat`/`lon` | 34,576 | 98.2% |
| List date | `listed_date` | 31,309 | 88.9% |
| Lot size | `lot_acres` | 27,448 | 78.0% |
| Beds | `beds` | 25,934 | 73.7% |
| Square feet | `sqft` | 24,861 | 70.6% |
| **Baths** | `baths` | **5,372** | **15.3%** |
| Subdivision | `subdivision` | 298 | 0.8% |
| Brokerage | `brokerage` | 298 | 0.8% |

**Baths by county:** Lee 3,211 of 24,548 (13.1%) · Collier 1,600 of 9,142 (17.5%) · Hendry 561 of
1,512 (37.1%). **This is the weakest cell in the email and now it has a number.**

**THE COLUMN CEILING, read live from `information_schema` — what the free spine does NOT have:**
no `year_built`, no `description`/remarks, no photo gallery, no HOA fee, no stories, no garage, no
pool. It has 42 columns and they are listed in the census script. **Do not plan a free-lane fallback
for a field that is not on this list.**

**Type mix (why "single family" framing is wrong):** single_family 16,410 · **land 9,046** ·
condo 6,489 · other 1,742 · multi_family 616 · townhouse 601 · residential 298. **A quarter of the
book is LAND** — beds/baths/sqft are legitimately absent there, not missing.

---

## 2. TIME ON MARKET — `data_lake.listing_dom`

**34,904 rows · 31,825 real (91.2%) · 3,079 floored (8.8%).** `dom_days` present on all 34,904;
the honesty flag is `dom_is_floor`. **Coverage is good and this cell is safe to build on.** A
floored count is still never printed as a fact.

---

## 3. THE PAID ROW WE ALREADY OWN — `data_lake.apify_property_records`

**26 rows.** This is the fallback lane and **reading it costs nothing** — it is already on disk,
already paid for. Fill:

description **20** · gallery (`alt_photos`) **20** · `baths_total` **20** · `year_built` **20** ·
`style` **20** · `new_construction` **20** · `list_date` **20** · `days_on_mls` **20** ·
AVM (`estimated_value`) **19** · HOA non-null **19** but **only 12 greater than zero** ·
`lot_sqft` **18** · garage **13** · stories **12**.

**HOA: serve `> 0` only.** A vendor `0` is indistinguishable from an unfilled field, so rendering
"$0/mo" is a fabricated figure. A `0` is an OPEN SLOT.

**This lane is already wired** — `lib/listings/paid-record-lane.ts`, read at the ONE inspection point
(`resolveSubject`), gap-fill only, runs last, and may never fill a moving fact (price, status, days
on market stay with the live record). **Do not rebuild it.**

---

## 4. THE THREE COMMUNITY LAYERS — never let one impersonate another

- **The subdivision (universal):** `data_lake.neighborhood_stats` — **20,400 subdivisions**, all
  20,400 with a median assessed value, **2,425 at true community grain** (50–2,000 homes). Covers
  every home in Lee and Collier. This is the one that always works.
- **Inside the gate:** `community_profiles` — **81 rows.** Thin. Golf/pool/gated/clubhouse.
- **Nearby businesses (NOT in-gate amenities):** `steadyapi_neighborhoods` **429** ·
  `steadyapi_neighborhood_amenities` **29,118** · property→neighborhood pairings **21,008**.
  These are businesses within about five miles and the copy must say so.

**Grain trap:** a `home_count` of 29,225 (Lehigh Acres) is a CITY, not a community.

---

## 5. THE AGENT'S OWN — `public.user_listings`

**0 rows, 0 users.** The lane exists and is empty. Anything that depends on the agent having
imported their book does not work today — the pasted description in the build box is the real
lane-2 source.

---

## 6. WHAT COULD NOT BE MEASURED, STATED AS A GAP

**`data_lake.lee_comp_sales_v` — the FREE baths/pool fallback — timed out** on a bounded
`LIMIT 5000` sample (statement timeout, 57014). The view is expensive; only single-row bounded reads
are healthy on it. The fallback IS wired in code (`lib/listings/resolve-subject.ts`, `withBaths`,
exact-address match only, Lee only) but **its coverage is unmeasured, and no coverage claim may be
made for it until someone measures it a cheaper way.** **Collier has no free baths fallback and no
pool source at all.**

---

## 7. WHAT THE OUTSIDE SAYS — crawl4ai, 08/05/2026

Four sources crawled. **The NAR "just-listed email" page 404s** — do not cite it; it is gone.
What the live pages actually said:

- **New listing announcements with high-quality photos lead every "most effective email types"
  list.** The photo is the product, which is why this email's chart policy is NONE.
- **Subject lines: use action words and name the payoff.** "See 5 new listings in [Neighborhood]"
  beats "Monthly newsletter update"; "New price drop on [Street Name]" names what the reader gets.
- **Personalize with a custom field** (first name or city) — raises opens and reduces spam
  filtering.
- **One clear call to action that states what opening gets them.**

**Where ours is already better, and where the crawl says we are not:** every source treats the
listing email as a template an agent fills in by hand. Ours sources each cell from a named root and
leaves an OPEN SLOT rather than a blank or a zero — that is the difference. **What they do that we
do not: put the recipient's name or their neighborhood in the subject line.** Our subject is
deterministic and address-only (`newListingSubject`). That is the one concrete, cheap improvement
the outside research actually supports.

---

## 8. THE LADDER — least expensive first, paid last. **The spec rungs are now IN CODE (08/05/2026).**

**What landed:** `lib/listings/paid-record-lane.ts` already filled description, gallery, baths and
HOA. It now also fills **beds, square feet, lot size and year built** — gap-fill only, never a zero,
never a moving fact, and it still issues **no vendor call** (the rows are already bought and on
disk). The unit seam is explicit: the free lane writes lot size in ACRES, the paid row stores
`lot_sqft`, and `acresFromLotSqft` converts at exactly 43,560 — pouring one into the other
unconverted printed "8712 ac" on a fifth-acre lot, and there is now a test named after that.

**Still NOT in code:** the county-records rung for baths (Lee, exact-address) sits in
`resolve-subject.ts` and its coverage is unmeasured (§6); and nothing yet reads the free spine's
`flag_new_listing`, `subdivision` or `brokerage`.


Per cell, in order. **Stop at the first hit. An exhausted ladder is an OPEN SLOT, never a zero and
never a guess.**

- **Price · street · city · state · ZIP** — free spine. No fallback needed (100%).
- **Property type** — free spine (100%).
- **Hero photo** — free spine `photo_url` (98.5%), **mirrored into our own storage** so a rotted
  vendor link never blanks the email months later. Fallback: the paid row's `primary_photo`.
- **Gallery (9–55 photos)** — **paid row only** (`alt_photos`, 20 of 26). The free lane carries ONE
  photo. No free fallback exists.
- **Beds** — free spine (73.7%) → paid row. Open slot on land.
- **Square feet** — free spine (70.6%) → paid row.
- **Lot size** — free spine `lot_acres` (78.0%) → paid row `lot_sqft`.
- **Baths** — free spine (15.3%!) → our Lee county records, exact-address only (Lee only,
  coverage unmeasured) → paid row `baths_total`. **For a Collier listing with no stated bath count
  the paid row is the only source.** Otherwise OPEN.
- **Year built** — **not on the free spine at all** → paid row (20 of 26) → OPEN.
- **$/sq ft** — computed, price ÷ sqft. Either won't parse → OPEN. Never a wrong number from a
  partial input.
- **Time on market** — our own DOM root (91.2% real). A floored count is never printed as a fact.
- **HOA fee** — paid row, `> 0` only (12 of 26). A `0` is an OPEN SLOT.
- **The description** — the agent's pasted words (lane 2, and the best source) → paid row
  `description` (20 of 26) → OPEN. **Never rewritten into a claim; it stays the source's words, and
  it does not count against the word budget.**
- **The subdivision** — `neighborhood_stats` (universal, 20,400).
- **In-gate amenities** — `community_profiles` (81 rows, thin). Absent stays SILENT — never "no golf".
- **Nearby** — the vendor amenity sweep, described as businesses within about five miles.

**Named gaps, not papered over:** pool is Lee only and Collier has none; a pool permit is an EVENT,
not proof of a pool. Annual taxes are parsed for ~16,500 properties but BLOCKED from customer-facing
use until one is validated against a real county bill. Schools are a MEASURED absence (`<NA>` on all
20 resolved rows of the bulk actor). Flood zone has no verified source.

---

## 9. THE BLOCKER ON ANY NEW PAID CALL

`apify_monthly_cap_state_unknown` — the account hit a 403 `Monthly usage hard limit exceeded` on
08/04/2026 and **its current state has never been re-checked.** Reading the 26 rows we already own
costs nothing and is unaffected. **Any plan whose first step is a NEW paid call is blocked until
that cap is checked.**

---

## 10. HOW TO REPRODUCE THIS CENSUS

The free-spine fill, the column ceiling, the DOM split, the paid-row fill, the community layers and
`user_listings` were each a single `SELECT count(...)` over the named table via `Bun.SQL` on the
`.dlt/secrets.toml` connection. **Do not use `Prefer: count=exact` through PostgREST for any of it** —
that header forces a full-view `COUNT(*)` and has twice invented a blocker (a fake HTTP 500 on the
comp view) and three wrong counts (`count=planned` returns the planner's estimate, not a count).
