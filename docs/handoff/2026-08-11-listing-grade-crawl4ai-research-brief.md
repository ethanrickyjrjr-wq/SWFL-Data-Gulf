# Listing Grade — what to look for with crawl4ai (research brief)

**Date:** 08/11/2026 · **Status:** research brief, NOT a build plan · **Rule:** RULE 0.4 (ours first, then crawl4ai)
**Origin:** operator session 08/11/2026 — "grade listings and send observations to agents in nice
emails with data… we would want to look at price, comps, the writing style, give tips, show
documentation of research, explain reasoning, show past data. Grading scale, everything."
Then: *"All we do is crawl4ai an agent website and we have 3-10 listings we can run over. I can feed
listings all day. Then we track what we say against what happens when it sells. We will only get
better."*

---

## 0. READ THIS FIRST — what is already answered. Do NOT re-crawl these.

Four separate sessions have already paid for parts of this. Re-crawling them is the documented
`didnt-read-what-we-hold` failure (7 strikes).

- **Listing copywriting rules** — `_RESEARCH/voice-and-positioning/2026-07-15-sell-side-copywriting-research.md`
  (10 pages crawled 07/15/2026). Has the frameworks (Hook/Story/Ask), the hard numbers (headline
  ≤10 words, body ≤250 words), "numbers beat adjectives," and the five named failure modes (ALL
  CAPS, over-exclamation, vague adjectives, Fair Housing language, photo/copy mismatch). **The
  writing-style grade's rubric is already sourced. Do not re-derive it.**
- **Seller-diagnostic whitespace + lead economics** — `docs/superpowers/specs/2026-07-19-why-isnt-it-selling-design.md`
  (crawled 07/18/2026). No seller-facing diagnostic product exists; $503 blended cost per lead (NAR
  via jtek.app 05/18/2026); REDX expired feeds from $60/mo. **Pricing anchors are set.**
- **Comp standard** — `docs/superpowers/specs/2026-07-22-comp-distance-ranker-design.md`, built to
  Fannie Mae Selling Guide B4-1.3-08 fetched live 07/22/2026 (minimum three closed comps; going
  outside the market area requires commentary; never mix vacant land).
- **The community pairing key** — `_RESEARCH/data-and-ingest/2026-08-03-neighborhood-amenities-full-scope.md`
  (08/03/2026). The listing feed carries 0% subdivision (re-verified live 08/11/2026: 298 of 36,137).
  The named neighborhood **with boundary polygon + centroid** comes from the vendor's
  `/neighborhood-amenities`, property id is the only input, dedupe by neighborhood slug. Same call
  returns 12 location scores, schools with ratings, 31 amenity categories. HOA fees absent from THAT
  vendor (the paid per-house record does carry `hoa_fee` — do not generalize the absence).
- **Propensity/lead-mining method + legal** — `_RESEARCH/data-and-ingest/2026-07-22-predictive-analytics-and-lead-mining.md`.
  ⚠️ **Its Fair Housing section governs WHO WE MARKET TO — audience selection and eligibility
  scoring. It does NOT govern comp selection.** Comparing a golf community only to a golf community
  is correct appraisal method. Misapplying that section to comps was an error made 08/11/2026 and
  logged in the scratchpad; do not repeat it.

**What we hold, measured live 08/11/2026** (so no crawl re-establishes it): 36,137 rows on the
listing spine, 42 columns, **no description/remarks column**; days-on-market 92.5% real (Lee 91.9%,
Collier 93.6%, Hendry 97.2%); 1,162 sold events in the last 120 days, 707 with a price; Lee county
sold comps through 06/2026 carrying beds, baths, pool (3-state), living area, year built, sale
price; ~247 sales in 33909 since 02/2026. Agent-supplied listings: **0 rows**. Paid per-house
records with remarks: **~26 rows**.

---

## 1. The seven questions worth crawling, in priority order

Each names the question, why it blocks, and what a usable answer looks like. **A crawl that does
not change a decision is not worth running.**

### Q1 — What does an agent's own website actually expose, and can we parse it? (HIGHEST)
**Blocks:** the entire intake. The whole idea starts with "crawl an agent website and get 3–10
listings." If their listings are rendered inside a third-party IDX iframe or hydrated by JS from a
vendor API, a markdown crawl returns navigation chrome and zero listings.

**Crawl:** the public marketing/docs sites of the platforms SWFL agents actually run on — kvCore /
BoldTrail, Sierra Interactive, BoomTown, Real Geeks, Luxury Presence, Placester, plus plain
WordPress/Squarespace with an IDX plugin (IDX Broker, Showcase IDX, iHomefinder). Also 3–5 REAL
SWFL agent sites end-to-end with crawl4ai as the actual test.

**A usable answer states, per platform:** are listing detail pages server-rendered or JS-only; is
there a stable URL pattern for a listing page; do remarks/description, beds, baths, sqft, price,
photos appear in the HTML; does robots.txt or the ToS forbid automated retrieval; is there a
sitemap. **Verdict per platform: parseable / needs JS rendering / blocked.**

**⚠️ Standing constraint:** we do not fetch listing portals (Zillow/Realtor/Redfin listing pages) —
that is a locked rule. The agent's OWN site is a different surface, but the ToS question still gets
answered per platform, in writing, before anything is built.

### Q2 — Does Florida regulate what we're about to publish? (HIGHEST — legal, and it's the RIGHT legal question)
**Blocks:** whether the grade may carry a price opinion at all, and how it must be labeled.

**Crawl:** Florida Statutes Chapter 475 Part II (real estate appraisers), the Florida Real Estate
Appraisal Board / DBPR guidance on **broker price opinions and comparative market analyses** (FS
475.612 / 475.6295 are the sections to find and quote verbatim), the Appraisal Foundation / USPAP
public guidance on what constitutes an appraisal, and the AVM rule finalized by the federal banking
agencies (quality-control standards for automated valuation models).

**A usable answer states verbatim:** whether an automated price-position or value statement produced
by a non-licensee, published to an agent, is (a) an appraisal, (b) a BPO/CMA that only a licensed
broker may issue, or (c) outside both because it is not an opinion of value for a transaction. And
the exact disclaimer language that keeps us in (c). **This is the legal question that actually
attaches to a listing grade — not Fair Housing.**

### Q3 — How do appraisers actually adjust for a pool, a bedroom, a bath, age, garage?
**Blocks:** the credibility of the whole grade. Our comp weights are hand-chosen and the spec says
so outright ("Hand-chosen constants, NOT fitted"). If a published method exists for deriving
adjustments, our numbers should be defensible against it.

**Crawl:** Fannie Mae Selling Guide B4-1.3-09 (adjustments / net-and-gross adjustment guidance —
B4-1.3-08 is already fetched and covers comp selection), Appraisal Institute material on **paired
sales analysis**, and any published FHA/HUD handbook 4000.1 appraisal adjustment guidance.

**A usable answer gives:** the named method for deriving an adjustment from the data itself (paired
sales), any published limits on total/net adjustment percentages, and whether a percentage or dollar
adjustment for a pool/bedroom is ever published as a standard figure or is always market-derived.
**If it's always market-derived, that is the finding — and it is an argument FOR the operator's
outcome-tracking loop, because our own sold set becomes the derivation.**

### Q4 — Does anything already grade a listing, and what does its output look like?
**Blocks:** positioning and the shape of the deliverable. We know no SELLER-facing diagnostic
exists. We do NOT know the agent-facing landscape.

**Crawl:** Restb.ai (photo/condition scoring from listing images), Lundy / Lundy Listing Score,
Homes.com and Zillow listing-quality or "listing health" documentation, MLS listing-quality or
compliance-scoring programs (search "MLS listing quality score" plus specific MLS names), ShowingTime
and Lone Wolf analytics, and any "listing audit" or "listing report card" product sold to agents.

**A usable answer gives, per product:** what it scores, on what inputs, whether it publishes a scale,
what it costs, and who buys it. Plus one explicit read on whether anyone combines **county-record
facts + live market behavior + copy critique** in one artifact, which is the thing we would be doing.

### Q5 — Photo scoring: is there a citable standard, and does photo count/quality move outcomes?
**Blocks:** whether photos belong in v1. We hold a photo URL on the spine and the paid record
carries up to 50 images, so this is reachable — but only worth building if the effect is real and
citable.

**Crawl:** NAR research on listing photos and days on market, Redfin/Zillow research posts on photo
count and sale outcomes, Restb.ai's published condition/quality taxonomy, and any academic paper on
listing photographs and sale price/time.

**A usable answer gives:** a cited effect size (photos vs days on market or price), a named quality
taxonomy we could score against, and a verdict on whether this is v1 or later.

### Q6 — Where do roof age, renovation recency, and HOA fee actually live?
**Blocks:** three variables the operator named explicitly that are **not** on our free spine.

**Crawl:** the vendor's own docs for any endpoint carrying roof/HOA/renovation fields (vendor-first
rule — read the live docs, never memory), Lee and Collier **permit** portals for roof-permit records
as a proxy for roof age, and the FDOR/property-appraiser field dictionaries for any roof or
effective-age field.

**A usable answer states, per variable:** is it in a source we already pay for, a free county source
we could ingest, or only ever in the agent's own listing text. **Roof age via permit records is the
one most likely to be free and ours** — Lee/Collier permit data is already in the lake, so check
that BEFORE crawling anything.

### Q7 — How do you publish a track record credibly?
**Blocks:** the "we track what we said against what happened" loop, which is the operator's core
idea and the thing that makes the weights fittable.

**Crawl:** published calibration practice — Brier score and reliability-diagram explainers, how
forecasting outfits (Metaculus, Good Judgment, weather services) present hit rate and calibration to
non-technical readers, and any real-estate product that publishes its own accuracy (Zillow publishes
a Zestimate error rate — find the exact page and the metric definition).

**A usable answer gives:** the metric we'd publish, the minimum sample before publishing anything,
and two real examples of how it's shown to a lay audience. **Note we already hold the spine for
this** — a predictions log with 148 rows, a grader at `refinery/grade/grade-predictions.mts`, and a
workflow that runs it. The gap is that nothing writes a per-listing row and the outcomes table is
empty.

---

## 1b. DECISION RECORDED 08/11/2026 — BOTH SIDES. The output is a VERDICT, not a grade.

Operator, verbatim: *"Both. We are reading both sides. We are looking for reasons why it is a good
or bad deal. That helps both sides… Listings priced perfectly taking all the variables into account
are possible. Maybe not perfect but very well priced. Or at least deserve an offer, but we can still
give reasons to buyer agent as to why. If too low, based on variables, we have to look at DOM and
what we may be missing. So I guess there will always be an answer for someone, which is great."*

**This resolves open question 1 in §4 (audience) and reshapes question 2 (grade shape).** The read
is directional and every listing produces one:

- **Priced above what the variables support** → the seller-side read. Reasons it sits, what the
  comparable set says, what the cut history and time on market say.
- **Priced in line with the variables** → the buyer-side read. It deserves an offer, and here are
  the reasons to hand the buyer's agent — same comps, same figures, argued the other direction.
- **Priced below what the variables support** → the interesting case, and the honest one. Look at
  time on market first. If it is priced low AND sitting, we are missing a variable (condition, a
  defect, a lot problem, an assessment, a lease-back) and the read must SAY that rather than call it
  a deal. If it is priced low and NOT sitting, it is a real deal and speed is the message.

A single composite letter/number cannot carry that — the same house is a good deal to one side and a
bad one to the other, and which side it favors IS the answer. So the shape is a **verdict + the
reasons behind it, directed at a side**, with the per-check flag/clear/unavailable machinery
underneath supplying the reasons. That preserves the honest-omission behavior while giving the
operator the headline he wants.

**Operator's stance on source legitimacy, recorded:** *"I'm not worried about using data that is
presented to us freely on the internet to determine what is a good deal or not. We aren't creating
anything they are not telling us. They have responsibilities to tell buyers all they know. Price is
subjective in most cases. We are here to make it make sense because we can."* Q2 (Florida licensing)
and new Q8 (disclosure duty) exist to put verbatim citations under that position, not to relitigate
it.

**Both sides are already half-built — audit before designing anything.** Live in the tree
08/11/2026: `/r/offer-check` (buyer-and-seller offer fairness, `lib/offer-check/verdict.ts`, area
read free, comps behind a $19 one-time unlock, metered calls capped at 4 and only after payment),
`/r/should-i-sell`, `/r/why-isnt-it-selling`, `/r/back-on-market`, and `lib/buyer-leverage/`
(dom-read, cut-history, zip-benchmark). Plus
`_RESEARCH/competitor-and-strategy/2026-07-17-buyer-seller-agent-augmentation-landscape.md` — 168
ranked findings across both sides, whose headline is that nobody sells standalone, agent-independent
decision support for the stress moments, on either side. **The gap is not the sides. It is that
these are four separate consumer pages and none of them is a per-listing read an agent gets in an
email.**

### Q8 (NEW) — What must a Florida seller disclose, and what may a buyer's agent rely on?
**Blocks:** the buyer-side read's footing. The operator's position is that sellers already owe
buyers the facts; that needs a citation under it.

**Crawl:** *Johnson v. Davis* (Fla. 1985) and its current statement of the seller's duty to disclose
known latent defects materially affecting value; the Florida Realtors seller disclosure form and its
scope; FS 475.278 on brokerage relationship duties and honest dealing; and any Florida guidance on
"as-is" contract effect on that duty.

**A usable answer gives verbatim:** what must be disclosed, what may be withheld, and whether a
public listing's stated facts carry any warranty. Which tells us how hard our buyer-side read may
lean on the listing's own claims versus county-verified facts.

### Q9 (NEW) — What does a buyer's agent now have to justify, post-settlement?
**Blocks:** whether the buyer-side email has a live commercial need behind it or is a nice-to-have.

**Crawl:** the NAR settlement practice changes as they now stand — written buyer agreements before
touring, compensation no longer displayed in the MLS, and how buyer agents are being coached to
demonstrate value. NAR's own practice-change pages and 2025–2026 brokerage guidance.

**A usable answer gives:** what a buyer agent must now put in writing, and whether "here is the
sourced reasoning behind this offer" is a documented pain point in that transition. **If it is, the
buyer-side email is the stronger commercial wedge of the two, not the softer one.**

---

## 2. Anti-goals — do not spend a crawl on these

- Re-deriving listing copywriting rules (Q0, done 07/15/2026).
- Re-establishing that no seller-facing diagnostic exists (done 07/18/2026).
- Fair Housing as it relates to comp selection — it does not relate. Audience targeting only.
- Lead-generation pricing anchors (done — $503 blended, REDX $60).
- Anything answerable from our own lake. Check the lake first, every time; that is RULE 0.7a and the
  reason `paid-before-free` sits at 4 strikes.

---

## 3. Method notes

- crawl4ai only, never Firecrawl. Pinned CLI at `C:\Users\ethan\.local\bin\crawl4ai` (bare URL →
  clean markdown).
- Output ships: as of 08/11/2026 crawl output is committed under `_RESEARCH/` with source URL and
  date. Never commit a credential, client data, or a paywalled body verbatim.
- **Every finding gets its `_RESEARCH/INDEX.md` line in the same pass.** Unindexed research does not
  exist — that is RULE 0.4 step 2 and it has been violated before.
- Each question above closes with a one-line verdict that names a decision, not a summary.

---

## 4. What planning still needs, beyond the crawl

Three things no crawl answers — they are operator calls:

1. **Audience first.** Agent-facing radar or seller-facing diagnostic. Same engine, different email,
   different money. The 07/19/2026 positioning says free to the seller, paid on the agent side.
2. **What the grade looks like.** Per-check flag/clear/unavailable with a "N of 7 ran" headline was
   the recommendation, and the coverage objection behind it is now dead (days-on-market is 92.5%
   real). A composite score is back on the table and needs a decision.
3. **First ZIP.** 33909 recommended — ~247 sales since 02/2026, beds filled on nearly all, spread
   from $100,000 to $1,499,900. Multi-unit rows (8-bed/8-bath under a residential use code) get
   dropped before grouping.
