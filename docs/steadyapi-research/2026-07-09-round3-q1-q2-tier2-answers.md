# Round 3 — Q1/Q2 (Tier 1) + Q5–Q9 (Tier 2) answers — live SteadyAPI run, 07/09/2026

> **Recommended model:** ⚡ Sonnet — 7 tasks, keywords: migration



Runs the Sonnet-session half of `2026-07-09-round3-question-backlog.md` per the scope split in
`docs/handoff/2026-07-09-round3-sonnet-run-handoff.md`: Q1/Q2 (Tier 1, mine) then Q5–Q9 (Tier 2, ran
as the credit window allowed). Q3/Q4 (crawl4ai) belong to the parallel Fable session — see
`2026-07-09-round3-q3-q4-answers.md`, already closed. Raw JSON for every call is in this session's
scratchpad (`steadyapi-round3/*.json`), never committed — real Reddit usernames stay off GitHub
(standing rule).

**Live SteadyAPI calls made this run:** ~30 (Reddit `posts` + `post`, `new_steady` key). Rate limit
(15 req/s global) was never approached.

---

## TIER 1

### Q1. Residential-agent willingness-to-pay — ANSWERED, closes the residential-agent gap

**Why this mattered:** round 2 found real CRE-broker pricing ($157–700/mo Reonomy) but explicitly
could NOT find residential-agent voice on tool pricing in the general subs. This is the targeted
retry the round-2 file recommended (r/proptech, r/RealEstateTechnology, r/newagent instead of
generic r/realtors browsing).

**Sources read (live-pulled 07/09/2026):**

1. **r/RealEstateTechnology, "Do you use a lead management tool and what don't you like about it"**
   (47 comments, `/r/RealEstateTechnology/comments/1u7rak8/`). Named numbers, direct quotes:
   - "Two-way texting built in, simple pipeline view, and **under $50/month**. Most charge way too
     much for features agents never use."
   - "Price wise anything **over $80/month** better handle CRM, follow up sequences, and skip
     tracing in one spot or I'm not touching it."
   - "Follow Up Boss nails the workflow but you pay for add-ons; **Lofty/kvCORE** bundle the dialer
     and IDX but the automations feel robotic out of the box... **I'd pay $50-80/seat** for that
     [the ideal tool]."
   - "For a solo agent maybe **$50-$100/mo**. For teams... pricing based on volume or managed leads
     probably makes more sense than strict per-seat pricing."
2. **r/PropTech, "Giving Saleswise.ai CMA a try"** (2 comments, `/r/PropTech/comments/1qu09dr/`) —
   a direct CMA-tool price point: **"The price is $39/m."** This is a live competitor sitting at our
   *exact* price point, not an inference.
3. **r/RealEstateTechnology, "Anyone built a worthwhile RE CRM?"** (118 comments) and **"Anyone
   using Brivity for CRM?"** (33 comments) — the "worth it" framing here is NOT about sticker price,
   it's about switching cost and data lock-in: "the best CRM is the one you will use," 18-month
   churn cycles, and repeated warnings that "activity history almost never migrates... check the API
   access on YOUR plan tier before signing, half these platforms lock it behind the expensive tier."
   One ad-comment for a competing CRM (DealBound) pitches itself explicitly as "without paying
   **hundreds of dollars a month**" — implying full-platform CRMs (kvCORE/BoomTown-class) run there.

**Searched, not found:** Cloud CMA, BoomTown, Ylopo, and Curaytor did not surface by name in any
thread (client-side keyword filter across all fetched threads). r/newagent returned 0 posts
(`meta.total: 0` — subreddit is empty or effectively dead, not worth another attempt).

**What this changes:** our $39–79/mo band is validated by real point-in-time evidence, not just
competitor-sticker-price inference — Saleswise.ai's CMA tool prices at exactly $39/mo, and named
lead/CRM-tool WTP clusters $50–100/mo per seat, with $80/mo cited as a real ceiling for a
fully-loaded single tool. Combined with round 2's CRE finding, there is room to price at the top of
our existing band (or add a bundled-features tier) with real evidence behind it, not just guessing.
The stronger design lesson is about the *switching* decision, not the sticker price: agents evaluate
churn cost (contact/activity history migration, API-tier gating) as much as monthly price — worth
surfacing "your data, exportable, no lock-in" as a value line, distinct from a WTP number. Closes
the residential-agent half of `paid_path_wtp` and feeds `highlighter_pricing_matrix` directly
(checks updated with this evidence).

---

### Q2. Which CMA/comp adjustments do agents actually name? — ANSWERED

**Why this mattered:** the SteadyAPI comp helper Phase 2B is specced and active; this shapes which
adjustment factors it surfaces first.

**Sources read (live-pulled 07/09/2026):**

1. **r/RealEstate, "Appraisal came in $40k lower than agreed price"** (255 comments,
   `/r/RealEstate/comments/1up75v5/`) — by far the richest thread found in this entire round.
   Agents, appraisers, and underwriters all comment, and the adjustment factors they name
   unprompted, ranked by repetition:
   - **Condition** — dominant factor, named explicitly as "the condition adjustment" on the
     appraisal grid: *"If the house had inferior condition due to damage or neglect, it should
     receive a condition adjustment to mathematically make it similar to your house."*
   - **Comp selection / arm's-length exclusion** — a distress/divorce/foreclosure sale should be
     excluded or heavily adjusted, not used at face value: *"that comp... does not sound like a
     good arm's length transaction and the appraiser should have either excluded it or made
     adjustments."* Appraisals require a **minimum of 3 comparables**, and one pattern named
     repeatedly: take 5 comps, drop the highest and lowest, average the remaining 3.
   - **Square footage** (including finished-basement sqft) — several commenters cite exact
     $/sqft math as the first sanity check.
   - **Garage count, bed/bath count** — named together as standard grid line items.
   - **Lot size / site** — present but secondary in the residential thread; the r/appraisal
     technical thread (`/r/appraisal/comments/1ur5dlf/`) shows land/site adjustment is done via
     extraction or allocation method when there are no vacant-land sales — this is appraiser-side
     methodology, not something agents name unprompted.
   - **View** — named rarely, and only as a *large* driver in extreme cases (a mature-tree removal
     that revealed a golf-course view was the one cited example of a real valuation bump).
2. **r/appraisal, "effect of landscaping/outside conditions on home valuation"**
   (`/r/appraisal/comments/1urywiv/`) — landscaping and adjacent-property condition (a leaning
   shared wall, a neighbor's pool) do **not** move valuation meaningfully in ordinary cases; only a
   dramatic change (the golf-course-view example above) does.

**Complaint format — direct answer to the "show me the math" vs "the adjustment values are wrong"
split:** it's the second one, and more specifically it's "the comp *selection* + the *condition*
adjustment applied to it are wrong or missing," not "I don't understand adjustments conceptually."
Every real appraiser/underwriter commenter in the thread describes the *actual* math (3-comp
minimum, drop-high-drop-low, condition grading) unprompted — the complaint from agents/homeowners is
that a specific comp should have been excluded or adjusted differently, not that the method is
opaque.

**What this changes:** the comp helper's default adjustment set + display order should be
**condition first, comp-selection/arm's-length flag second, sqft third, garage/bed/bath fourth, lot
size fifth**, with **view and landscaping explicitly de-prioritized** (real but rare, large-swing
only) rather than given equal billing. Closes the open comp-adjustment question in round1 §4.1.

---

## TIER 2

### Q5. Digest cadence + recipient frequency tolerance — SEARCHED, EMPTY

**Recipe run:** r/Emailmarketing hot (25 posts) + r/FirstTimeHomeBuyer hot (25 posts), filtered for
"market report" / "newsletter" / "unsubscribe" / "realtor email" / "spam" / "every day" / "every
week." Fallback recipe run (reusing Q1/Q2's already-fetched pulls, no extra calls): r/realtors hot
(25 posts) + r/RealEstate hot (25 posts), same filter.

**Result:** zero hits across all four subs' current hot snapshots. r/FirstTimeHomeBuyer's hot list
is almost entirely "I did it!" / "Got the keys!" celebration posts right now — no cadence/frequency
complaints surfaced at all. r/Emailmarketing's hot list is general email-marketer shop-talk
(segmentation, deliverability, tool pricing) with nothing about market-report cadence specifically.

**Per the stop condition** (Tier-1 recipe + one fallback both empty → log and move on, don't invent
a third venue mid-run): this stays genuinely open. Logged idea for a future attempt, not chased now:
try `filter=new` or `filter=rising` instead of `hot` (a non-viral complaint thread may simply not be
"hot" right now), or a targeted search framing like "unsubscribe from my realtor" rather than
browsing. Round1 item 1 stays open exactly as written.

---

### Q6. Snowbird / out-of-state / sight-unseen buyer pain — ANSWERED (directional, not high-volume)

**Sources read (live-pulled 07/09/2026):** r/CapeCoral hot, r/FortMyers hot (both returned only
hyperlocal daily-life content — food, weather, activities — no relocation-specific threads; weaker
subs for this question than hypothesized). r/Naples redirects to **r/Naples_FL** (confirmed via
empty 2-item response with a redirect notice) — refetched there:

1. **"Shipping vehicle from out of state to Naples"** (`/r/Naples_FL/comments/1un67le/`) — poster
   self-identifies: *"This may be a question geared more to snowbirds... looking to send one of my
   vehicles down to Naples from Pennsylvania."* Confirms the out-of-state relocation population is
   real and active on this sub, not just an internal assumption.
2. **"Realtor recommendations"** (`/r/Naples_FL/comments/1uraztx/`) — a newcomer explicitly can't
   evaluate agent trustworthiness or area fit remotely and crowdsources it instead. Commenters name
   the failure mode directly ("a lot of 'part time' realtors here who do less than 4-5 deals a
   year"), and local agents answering in-thread recommend **renting first** or **driving the
   different neighborhoods in person** before buying, because "Naples and Collier County are huge...
   two completely different areas and very, very different" block to block.
3. **r/AskFlorida, "Moving to Florida"** — Orlando-specific (not SWFL), but the underlying
   relocation-research complaint transfers directly: *"There's only so much you can learn about a
   place from various platforms and sites before they begin to toe the line between honesty and
   advertising."*

**What this changes:** validates round1 §3.4 (snowbird/out-of-state pain) as real, if not a
high-volume signal in the two core-county subs specifically — r/Naples_FL and r/AskFlorida are the
better venues than r/CapeCoral/r/FortMyers for this question. A remote-buyer packet that substitutes
for "come drive the neighborhoods yourself" is validated whitespace, reusing the showing-prep
pipeline. Not urgent, but no longer a zero-research guess.

---

### Q7. CRE broker pain sweep beyond pricing — ANSWERED

**Sources read (live-pulled 07/09/2026), r/CommercialRealEstate hot:**

1. **"Has anyone actually gotten compliance to sign off on AI for underwriting?"** (43 comments,
   `/r/CommercialRealEstate/comments/1ufyphp/`) — the richest hit. Individual brokers and family
   offices are **already using Claude specifically**, informally, for exactly the kind of work our
   product does: *"Family Office Developer here — we do whatever the fuck we want it's great.
   **Claude** has turned my monthly reporting from a 2 full day grind to maybe 2-3 hours of slight
   formatting changes and footnoting."* Enterprise adoption is stalled on compliance (VPC deployment,
   contractual no-training-on-data guarantees, audit trails), not model quality: *"Too many decision
   makers while small brokerages are running circles around them while they decide... brokers at the
   large firms who are ai savvy are doing it, just on their personal Claude."*
2. **"We built an off market CRE acquisitions pipeline as a two person team, watched it crash 74%,
   and rebuilt it in house"** (34 comments) — a real deal-sourcing volume/quality account (paid
   sourcing shop delivered ~43% dead-on-arrival deals; in-house rebuild recovered quality over
   volume). Reinforces the round-2 finding (quality over volume, ROI justified by deals sourced) but
   doesn't surface new tooling-gap language beyond that.

**What this changes:** directly reinforces the already-locked bottom-up positioning — the CRE
persona most receptive to an AI-authored deliverable tool is the solo broker / family-office
operator already using Claude informally for reporting, not an enterprise compliance-gated sale.
This is corroborating evidence for a decision already made, not a new build item.

---

### Q8. Forecast / direction-call trust framing — ANSWERED

**Source read (live-pulled 07/09/2026):** r/REBubble, **"The forces that lifted housing prices for
decades are reversing, what happens next?"** (67 comments, `/r/REBubble/comments/1uq3pxt/`).

**Sentiment texture:** not mockery — commenters treat the forecast as a serious, conditional debate
and explicitly reward hedged/falsifiable framing over confident claims. Two representative quotes:
*"It really depends on WFH and AI job future, which I believe is fully unknowable by anyone."* and,
of the post's weaker unconditional claims, *"There's some interesting points in here, but it's
mostly BS."* Readers actively distinguish grounded claims (rate environment, demographic shift) from
overreach (homesteading/farming predictions) within the same thread.

**What this changes:** validates the existing design choice — lead the master's direction call with
the falsifier ("wrong if X"), not with confidence. This is exactly how this audience already reasons
about market predictions; an unconditional-sounding claim reads as "mostly BS" to them. No format
change needed; this is confirming evidence for round1 §2.4.

---

### Q9. Pre-send review QA pain — ANSWERED (continuation of a round-2 secondary signal)

**Source read (live-pulled 07/09/2026):** r/realtors, **"Does anyone actually review agent email
responses before they go out, or is it just send and hope?"** (11 comments,
`/r/realtors/comments/1uqr1eh/` — surfaced but not chased in round 2, this is the targeted pull).

**Finding:** consistent "no" across every reply. *"In 23 years, I have never heard of a brokerage
reviewing anything whatsoever except contract documents for compliance."* *"We're independent
contractors, not employees. No one is reviewing an email."* One brokerage requires post-hoc email/
text archiving at deal close for the compliance file — but that's retrospective record-keeping, not
pre-send review. The independent-contractor structure of the industry means this gap is structural,
not a solvable training/policy problem at the brokerage level.

**What this changes:** validates a pre-send review/QA step as genuine product whitespace — nothing
in the industry's actual structure will ever fill this gap organizationally. Pairs naturally with
Q4's seed-test finding: a single "pre-send checks" step (deliverability seed-test placement +
content/tone review) is a more coherent feature shape than two separate ones.

---

## Round1 fold-in — APPLIED 07/09/2026 (follow-up session)

Originally blocked by a live parallel session's claim (`856ab63d…`) on the round1 file. Claim
released; applied as written: Q1/Q2/Q6/Q7/Q8 folded into `2026-07-09-pain-point-questions-round1.md`
Section 1 as items 19–23 — item 2.3 (WTP residential gap), item 2.4 (forecast trust), item 3.1
(CRE broker pain), and item 4.1 (comp adjustments) closed with pointers; item 3.4 (snowbird)
narrowed. Section 2 items 1 and 7 annotated "searched, empty" per Q5 above, still open.

## Vendor-note update — APPLIED 07/09/2026 (follow-up session)

Same claim conflict, same release; applied as written to
`docs/vendor-notes/INSTAGRAM-SOCIAL-STEADY.md`'s Reddit-quirks section (new 07/09/2026 round-3
block): the `/v1/reddit/post` content-filter false-positive (valid post URL → 200 with
`{"success": false, "message": "Please enter a valid subReddit URL."}`, identical immediate retry
succeeds) is documented as endpoint-agnostic — retry once before treating any `success: false` as a
real empty result — plus the r/Naples → r/Naples_FL redirect-as-near-empty-response quirk observed
in this run.

## Checks updated this session

- `steadyapi_round3_tier1_run` — CLOSED. All four questions (Q1/Q2 here, Q3/Q4 in the parallel
  Fable session's file) are answered.
- `paid_path_wtp` — annotated with the Q1 evidence (Saleswise.ai $39/mo CMA comp + $50–100/mo
  lead-tool WTP band); not closed, since the mechanic (bearer-gate + paid surface) is still unbuilt.
- `highlighter_pricing_matrix` — annotated with the same Q1 pricing evidence for the cross-feature
  matrix conversation.

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 17, Task 17, Task 17, Task 17, Task 17, Task 17, Task 17 |  |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
