# Round 1 — Social-listening question backlog (Reddit / X / Instagram via SteadyAPI)

**Purpose:** before we build/ship on top of an assumption, verify it against what real agents,
investors, and buyers/sellers actually say — not what industry blog posts or competitor
marketing claims they want. This file is the full-width first pass across everything currently
being built. Once it's reviewed, we split into per-area files and go run the sweeps.

**Rule this file follows:** don't assume we're doing things correctly except where we already
have real research behind it. Section 1 lists what's ALREADY settled (don't re-ask). Everything
after that is open.

---

## 0. How to actually run these against SteadyAPI (mechanical notes — read before sweeping)

Field-verified against the live API, not the vendor's docs page (source: `docs/vendor-notes/INSTAGRAM-SOCIAL-STEADY.md`):

- **Reddit:** the generic `/v1/reddit/search` endpoint site-wide-ranks and mostly returns
  unrelated viral posts for niche topics — do NOT rely on it for pain-point mining. Use
  `/v1/reddit/posts?url=<subreddit>&filter=hot|new|top|rising` per target subreddit instead, then
  filter client-side by keyword. Also: `/search` can return HTTP 200 with
  `{"success": false, ...}` on innocuous queries — always check `body.success`, a 200 status
  alone doesn't mean you got data.
- **Twitter/X:** `/v1/twitter/search` returns an entity object (users/topics/events/lists), never
  actual tweet bodies. To read real tweets: resolve `/v1/twitter/user` → `user_id` →
  `/v1/twitter/user/tweets`. Budget for the two-hop call pattern per handle/topic.
- **Instagram:** `/v1/instagram/search` is token-only — single hashtag-style words, not phrases.
  `"email marketing AI"` returns `{success:false}`. Captions carry no external URLs, so IG is a
  sentiment/volume signal, not a link-crawl source. Best used for hashtag-level pain vocabulary
  (`#floridacondo`, `#hoahorror`, etc.), not phrase search.
- **Rate limits:** global 15 req/s; IG `/search` costs weight 2, everything else weight 1. IG
  pagination tokens expire in 15 min, capped at 20 requests/15 min per session — plan sweep speed
  accordingly, don't leave a paginated IG session idle mid-sweep.

Suggested subreddits to seed across most sections below: r/RealEstate, r/realtors,
r/FirstTimeHomeBuyer, r/HOA, r/fuckHOA, r/REBubble, r/realestateinvesting, r/CommercialRealEstate,
r/CapeCoral, r/FortMyers, r/Naples, r/AskFlorida, r/floridarealestate, r/Insurance.

---

## 1. Already settled — do NOT re-ask these

(Sourced from `docs/superpowers/plans/2026-06-30-steadyapi-sole-spine/06-full-audit-and-continue-decision.md` §4 and `docs/superpowers/plans/2026-06-14-redfin-data-strategy/findings-swfl-dynamics.md` — real multi-subreddit corroboration, not a guess.)

1. Condo/HOA reserve & special-assessment opacity is a real, validated, financially severe pain
   ($100K–$224K surprise assessments, SB 4-D driven). Recurring community advice: "ask what's in
   reserves" because no structured public source exists.
2. Permit/renovation-history fragmentation and undisclosed flips are a real, recurring
   cross-market complaint.
3. Flood/insurance risk is surfaced too late in the transaction, with no trend sense — explicit
   r/AskFlorida quote: "is there a real estate site that lets you filter by flood zone?"
4. Zestimate/Redfin-estimate/AVM distrust is "extremely recurring" — buyers want to know where a
   number came from. This validates the four-lane citation model directly; no need to re-verify
   the underlying distrust.
5. Rental-comp trust gap — investors manually cross-check RentCast/Rentometer/Zillow, no
   consensus source.
6. Agents want to see the comps and the math behind a CMA, not a black-box adjustment.
7. Insurance premium shock is documented and quantified (+72% since 2020 to $3,249/yr median;
   r/capecoral individual trajectory $700→$5,200 peak→$3,834).
8. SB 4-D/154's causal link to condo sales collapse (-30%/yr then -19%/yr, months-of-supply
   14.6 vs 0.6 at the Dec-2021 low) is documented with a direct HUD CHMA quote.
9. SteadyAPI carries no HOA/reserve/fee field anywhere in its schema (checked `/search`,
   `/similar-homes`, `/new-construction`) — confirmed absent, not just unused. The pain is real;
   the sourcing mechanism is a separate, internal data question (state DBPR condo filings /
   whether `condo-sirs-swfl` can extend), not something more social listening resolves.

**Also settled by the 07/08/2026 sweeps** (`docs/superpowers/plans/2026-07-08-reddit-ai-cheats-and-deliverable-hacks.md`
+ its companion `2026-07-08-ai-design-and-email-marketing-hacks-sweep.md` — see the folder README
for the full inventory):

10. **"Showing prep packet" is a real, named, unprompted pain point** (r/realtors, "POV: You spent
    3 hours preparing for homes your clients no longer want to see," resonant top-comment thread):
    agents describe manually pulling comps, permit history, tax records, disclosures, and organizing
    it all before every showing. This is the highest-fit, most implementable finding in either sweep
    — it maps directly onto data we already hold (comps via `steadyapi-comps.ts`, permits via
    existing county pipelines, tax/parcel via LeePA) and the existing deliverable pipeline.
    **UPDATE 07/09/2026: this is BUILT, not a candidate** — shipped 07/08 as
    `lib/email/showing-prep-{assemble,doc,copy,intent}.ts`, `lib/listings/showing-prep-source.ts`,
    `app/project/ShowingPrepButton.tsx`, `app/api/projects/[id]/showing-prep/route.ts` (spec:
    `docs/superpowers/specs/2026-07-08-showing-prep-packet-design.md`). Don't re-research and don't
    re-spec; remaining work is live-verification only.
11. **AI-written email "sounds like a robot" is a massive, validated pain** (r/ChatGPT, ~22,927
    upvotes) — and it's **already fixed**: the `voiceGuard` banned-phrase lint
    (`lib/email/voice-guard.ts`) was built directly off this finding. Don't re-research; if anything,
    verify the lint's banned-phrase list stays current.
12. **Gmail Promotions-tab avoidance is a live, active pain** (r/Emailmarketing) — **UPDATED
    07/09/2026: a concrete playbook now exists, see Section 1 item 17.** The "no silver-bullet
    solution found" framing from the 07/08 sweep is superseded; don't re-search this, item 17 has
    the answer.
13. **Subject-line/CTA micro-optimization is a named time-sink** agents complain about (r/Emailmarketing)
    — informs a candidate feature (AI-suggested subject-line variants), not an open question. Check
    `lib/email/` AUTHOR_TOOL before building — may already partially exist.
14. **Manual deliverability diagnosis (complaint rate + bounce + DNS + send history cross-referenced
    by hand) is a named pain** (r/Emailmarketing) — validates the shape of a future deliverability
    panel if we ever prioritize it; not an open question, a validated shape.
15. **Trust/authenticity anxiety around AI-touched listing photos is real** (r/realtors, "Is there
    any way to tell if listing photos have been enhanced with AI") — reinforces the existing
    "structural guarantee, not AI virtue" positioning; a marketing-copy point, not a build question.
16. **Recurring-newsletter cadence signal: "short + daily + curated" wins** (thebilig.com AI-newsletter
    rankings, every entry states its cadence + a one-line coverage promise up front). This partially
    answers Section 2 item 1 below (digest cadence) for *general* newsletter consumption habits — it
    does NOT confirm SWFL real-estate agents specifically want this cadence for a market-report
    product; that half stays open.

**Also settled by the 07/09/2026 recurring-pain sweep** (live SteadyAPI Reddit calls against the
question backlog below — full evidence trail + raw JSON pointers in
`2026-07-09-recurring-pain-questions-and-answers.md`):

17. **Gmail Promotions-tab avoidance HAS a concrete playbook**, not just a named pain (supersedes the
    "no silver-bullet solution found" framing in item 12 below — read item 12's rewrite). Source:
    r/Emailmarketing, "After months fighting the Promotions tab..." (48↑/31💬, live-pulled
    07/09/2026). Five tactics, ranked by the poster's own account: (1) send to most-engaged
    recipients first and widen gradually — "the single biggest lever"; (2) cut tracking/redirect
    links — hurt deliverability more than images; (3) real reply-to + conversational tone + a
    closing question to prompt replies; (4) consistent cadence (bursty sends read as "campaign-y");
    (5) seed-test placement before every real send. Two of these cut against things we do or plan:
    click-tracking (`email_lab_tracking_live_verify`) trades against deliverability — a real
    tradeoff, not a free feature. Engagement-staggered sending and pre-send seed-testing are both
    NEW feature candidates, neither currently in our scheduler.
18. **CRE/proptech tool pricing is real-numbered and opaque** — partially answers Section 2 item 3
    below (read item 3's rewrite for the residential-agent gap that's still open). Source:
    r/CommercialRealEstate, "Brokers: what are you paying on a Reonomy renewal?" (live-pulled
    07/09/2026, 9 comments). Real quoted seat prices: $157–$700/mo (median chatter ~$300–400/mo),
    CoStar (the bigger incumbent) quoted at "3X this price" by one commenter, API-tier ~$30k/year
    enterprise. A self-identified proptech founder in the thread states the category's pricing is
    *deliberately opaque* — "the regular rate quoted at renewal is usually a starting point, not the
    clearing price." Buyers justify cost via deals-sourced ROI, not data volume. Not agent-voice at
    our exact $39–79/mo price point, but hard evidence the category tolerates 2–10× that price for a
    comparable data product — we are not priced high relative to the category.

---

## 2. Open — product-format assumptions (nobody's actually asked real people)

These are internal hypotheses baked into current builds. None have been checked against a real
agent/investor statement.

1. **AI-narrated digest cadence, for OUR domain specifically.** General newsletter research already
   says "short + daily + curated" wins (Section 1 item 16) — but that's AI-news newsletters, not a
   SWFL real-estate market report. Do agents/CRE brokers specifically want a daily/weekly/monthly
   "brief categories" market email, or would they rather pull data on demand? Where to look:
   r/realtors, r/CommercialRealEstate — search "market report" + "newsletter" complaints (do people
   say they ignore/unsubscribe from automated market reports specifically?).
2. **Self-editing via chat ("tell AI to change the template").** Do agents want a conversational
   edit workflow for their own marketing, or do they want a fixed template they trust and reuse?
   Look for complaints about *too much customization* / decision fatigue in marketing tools
   threads, vs. complaints about being *locked into* a template.
3. **Willingness-to-pay at $39–79/mo — CRE comp evidence found, residential-agent half still open.**
   Competitor sticker prices were pulled (Cloud CMA/Chime/Mailchimp, Smartlead $59/mo, Lemlist
   $55–87/user/mo, Beehiiv $0–96/mo, Walter Writes $8–99/mo) plus real CRE-broker numbers for a
   comparable data tool (Section 1 item 18: Reonomy $157–700/mo/seat, CoStar 3×+ that) — but that's
   CRE brokers on an enterprise comps platform, not a residential agent's reaction to $39–79/mo
   specifically. Still open: searched r/realtors + r/RealEstate hot/new/rising (07/09/2026) and
   generic reddit-search for "worth it"/"subscription" framing — no residential-agent tool-pricing
   threads surfaced (confirms residential agents don't discuss SaaS pricing in the general subs the
   way CRE brokers do in r/CommercialRealEstate). Next attempt: try r/proptech, r/newagent, or a
   direct "what do you pay for [Cloud CMA/Chime/etc]" targeted search rather than generic browsing.
4. **Falsifiable "direction call" / forecast-trust format.** We invented this as a differentiator
   internally — never checked how agents actually talk about trusting (or distrusting) an
   AI-generated market prediction. Look for sentiment on "AI market prediction," "Zillow forecast
   wrong," "algorithm got it wrong" in r/RealEstate / r/REBubble.
5. **"One sentence → branded PDF/email" workflow.** Is this solving a pain agents actually voice,
   or are current Cloud CMA / Altos users simply satisfied with what they have? Only pricing was
   researched for these competitors, never satisfaction/complaint content. Look for
   Cloud CMA / Altos / Homesnap complaint threads specifically (not just pricing mentions).
6. **Watermark-only paywall (free build, paid send).** Partially supported by a cross-vertical
   precedent (Ed Zitron/wheresyoured.at: fully-valuable free tier + one repeated low-friction paid
   ask converts) — but that's a newsletter writer's personal audience, not our real-estate agent
   customer. Still open: do OUR users react well to a "free but watermarked" model, or does it read
   as cheap/annoying? Look at general SaaS/creator-tool subreddits (r/SaaS, r/Entrepreneur) for
   sentiment on watermarked free tiers — Canva, Loom, HeyGen-style precedent.
7. **Email/deliverable frequency tolerance.** How many automated emails before a recipient calls
   it spam vs. useful? Look for real complaints from homeowners/buyers about realtor newsletter
   frequency (r/RealEstate, r/FirstTimeHomeBuyer — "why does my realtor email me every day").
8. **AI-authorship anxiety — copy specifically, not photos.** Photo-enhancement trust anxiety is
   already settled (Section 1 item 15). Separately: do agents worry that AI-*written* copy will make
   them look inauthentic to clients, or get flagged as "AI slop"? The "sounds like a robot" pain is
   settled (item 11) and fixed via `voiceGuard` — but that's about *quality*, not whether the agent
   feels shame/pride about using AI at all. Look for agent-side comments about using ChatGPT/AI for
   client communication specifically — pride vs. shame framing, not phrasing complaints.
9. **Multi-tool fatigue.** Do agents complain about juggling separate CRM + CMA + email + social
   tools, which would validate an all-in-one pitch — or do they prefer best-of-breed and resent
   forced bundling? Look in r/realtors for "tech stack" / "which tools do you use" threads.

---

## 3. Open — segment-specific pain points (not yet swept at all)

1. **CRE broker/business-owner pain points.** All existing Reddit/BiggerPockets research skews
   residential/HOA/condo. No sweep of r/CommercialRealEstate for broker-specific complaints has
   been done (only CoStar *pricing* was researched, not CRE broker pain).
2. **Investor/landlord pain beyond rental-comp trust.** Do investors on r/realestateinvesting or
   BiggerPockets want a motivated-seller score, a market-regime signal, or listing-survival
   curves? These are currently product-whitespace guesses from academic/industry analogy
   (`findings-ai-products.md`), never validated against a real investor ask.
3. **Manufactured/mobile-home community pain points.** Lee/Collier have significant
   manufactured-home stock (`land_manufactured_swfl` is a known data gap) — zero social research
   exists on what buyers/owners in that segment actually struggle with.
4. **Snowbird / out-of-state / sight-unseen buyer pain.** SWFL's seasonal buyer base is
   structurally different (cash-heavy, remote) — no research yet on what specifically frustrates
   an out-of-state buyer transacting without walking the property first.
5. **Insurance-driven delisting, asked directly.** We've only inferred this indirectly (volume
   decline + inventory rise). Nobody has searched for a seller directly saying "insurance killed
   my sale" on r/florida, r/Insurance, or r/RealEstate.

---

## 4. Open — feature-shape validation (the pain is settled, the RIGHT FORMAT isn't)

These pains are already confirmed real (Section 1) — what's open is what specific format/detail
level people actually want, which changes how we build the feature, not whether to build it.

1. **Comp/CMA transparency — which adjustments specifically?** "Agents want to see the math" is
   settled. Which adjustment factors do they name most (sqft, age, condition, view, lot size,
   pool, waterfront/canal tier)? Look for specifics in CMA-complaint threads, not just the
   general "black box" framing.
2. **Flood/insurance risk — what format do buyers trust?** A 1-10 severity score? Plain-language
   tier ("Severe")? A raw trend chart? Do buyers trust third-party risk scores (First Street) or
   want to see raw underlying data instead? Look for reactions to First Street / Risk Factor
   scores specifically — do people call them useful or dismiss them as marketing.
3. **Permit/reno history — is unpermitted work a dealbreaker or a negotiation lever?** Would
   buyers actually pay for a permit-history feature, or do they expect it free as due diligence?
   Look for how buyers describe finding (or failing to find) unpermitted work — deal-killer
   language vs. "just renegotiate the price" language.

---

## 5. Explicitly out of scope for a SteadyAPI sweep (flag, don't spend time on)

- **TikTok-specific behavior.** SteadyAPI has no TikTok endpoint (confirmed absent from its
  social sections) — any TikTok research needs a different vendor/tool, not this pass.
- **Vendor black-box internals** (Zillow Market Heat Index weighting, Redfin's distress
  composite, exact delisting→price-cut lag). These are proprietary; no amount of Reddit/X/IG
  listening resolves them — this is a data-engineering dead end, not a research gap.
- **Unit-count of condos affected by special assessments / insurance-driven delisting counts.**
  These need public-records/dataset work (FGCU RERI reports, DBPR filings), not social listening.

---

## Next steps

1. Review this file — cut anything that isn't actually load-bearing for a build decision right
   now, add anything missing.
2. Split into per-area files (one per Section 2/3/4 area, or grouped by which build it feeds) so
   each sweep stays scoped and its findings land next to its question set.
3. Run the sweeps per the mechanical notes in Section 0 — targeted subreddit `/posts?url=` pulls,
   not generic `/search`.
4. Findings go back into this folder, dated, next to the question file they answer — not into
   SESSION_LOG prose alone (per RULE 2.4, anything that changes a build decision gets tracked).
