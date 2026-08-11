# UNDER CONTRACT EMAIL — what it is FOR, and how it is designed

**Date:** 08/05/2026 · **For:** the email assembly line, 4th of 17 (`under-contract` in `RECIPE_KEYS`)
**Method:** our own research first (RULE 0.4), then crawl4ai. WebSearch used ONLY to find candidate
URLs after guessed URLs failed — every page that produced a finding below was READ by crawl4ai.

---

## HONEST SOURCE COUNT — 5 of 13 URLs yielded content (round 1 was 1 of 10)

Recorded first because a thin pass reported as a thorough one is the defect (RULE 0.8).

**ROUND 1 WAS SEARCHED WRONG — operator caught it.** I searched the literal phrase "under contract
email template," which returns nothing but deal-desk transactional junk (see §1), and reported 1 of
10 as if the corpus were thin. The corpus is not thin; the query was. **Round 2 searched per BENEFIT
instead of per phrase** — farming/social-proof, backup-offer/recapture, days-on-market-as-proof — and
every one of the three returned usable primary material on the first try. Lesson for the next pass:
this email has no canonical name in the marketing corpus, so name the JOB, never the artifact.

**Yielded (5):**
- oakleysign.com "How Agents Build Neighborhood Market Share" (06/18/2026) — the status-rider
  narrative argument + Rule of 7 + farm sizing. **The single best source in this pass.**
- coffeecontracts.com "Just Sold Post Ideas for Real Estate Agents" — the seller-facing CTA formula,
  the two-number speed comparison, the 24–48h timing, the overlay-detail list.
- redfin.com "What is a Backup Offer and Should You Make One?" (07/13/2026) — NAR's 6% fall-through,
  the "off the market" misconception quote, practitioner quotes.
- maestrolabs.com "5 Effective Under Contract Email Templates" — the TRANSACTIONAL type, §1.
- theclose.com real-estate-email-templates — a NEGATIVE finding worth keeping: 20 templates, **no
  under-contract template at all**; the closest is a testimonial framed as social proof.

**Read, produced nothing (8):** listed below.

realtor.com contingent-vs-pending (**404** — the URL in circulation is
dead), realtor.com /advice/buy/ index (no link matching contingent/pending/escrow),
docs.steadyapi.com (landing page is generic market-data marketing, NOT the real-estate field docs —
so `flags.is_pending` remains vendor-undocumented to us), placester.com templates (empty), luxurypresence.com email-marketing
blog (cookie-consent boilerplate only), followupboss.com blog templates (empty), homelight.com
what-does-under-contract-mean (empty), html.duckduckgo.com (blocked).

**Still UNVERIFIED, do not treat as settled:** whether Florida practice says "under contract" or
"pending." Three attempts failed. Our own ingest field is `flag_pending` off the vendor's
`flags.is_pending` (`ingest/pipelines/listing_lifecycle/extract_api.py:198`) — that is an argument
for "pending" as the DATA word, and no evidence at all about the AGENT-FACING word.

---

## §1 — THE FINDING THAT MATTERS MOST: there are TWO different emails wearing this name

The entire crawlable corpus for "under contract email" is the **transactional** one. Ours is not
that. Getting this wrong would have built the wrong email.

**Type A — TRANSACTIONAL (what the internet means by the term).** Audience = the parties already
inside the deal. maestrolabs' five templates are the canonical shape, and the sequence is the
content: (1) initial under-contract announcement — *"Both parties have agreed on the terms of the
sale, and we are now in the process of finalizing the transaction"*, (2) inspection update,
(3) closing-date confirmation, (4) appraisal follow-up, (5) final walk-through reminder. Stated
purpose is operational, not persuasive: keep parties "abreast of updates," save the agent time,
maintain professionalism. **There is no marketing in it and no market data in it.** Our own
07/01/2026 lifecycle research independently reached the same place: *"deal-in-motion emails become
transactional — once under contract, content shifts to timeline/updates, not marketing."*

**Type B — MARKETING (what OURS is).** Audience = the agent's database and, most sharply, the
buyers who inquired on THAT house. The surfaced subject line for this type is
*"[Address] went fast, but I've got more for you!"* — sent when a property someone was interested in
goes under contract. Our 07/01 research files this as lifecycle stage 6 of 7: *"Under Contract /
Pending — status update; the tone shifts from marketing to transaction/social-proof."*

**We are building Type B.** `under-contract` is the 4th key on the listing-lifecycle spine beside
New Listing, Coming Soon and Market Comps — a database email about one house, not a deal-desk
update to a buyer and seller. Do not import the five-template transactional sequence.

---

## §2 — WHAT THE EMAIL IS ACTUALLY FOR (the benefit, three of them)

Ranked by how well each is evidenced.

1. **SOCIAL PROOF FOR THE NEXT LISTING CONVERSATION.** The strongest and best-attested, and the
   crawl found the mechanism stated outright. Oakley Signs, 06/18/2026, on why a status rider exists
   at all: *"A rider clipped beneath the panel (Just Listed, Under Contract, Sold) tells a story that
   neighbors follow in real time. They watch a listing come to market, move through the cycle, and
   close. That narrative, repeated across multiple properties, is what builds the perception of an
   agent who gets results in this neighborhood. **Each status update is another impression**, and
   another reason for a curious neighbor to take note of your name."*

   **That is the entire argument for this email, written about a yard sign.** Under Contract has
   nothing to sell — the house is spoken for — and that is not a weakness, it is the point. Its value
   is being a BEAT in a narrative, and the beat is missing if you only send Just Listed and Sold. The
   same source names the counting rule behind it: the *"Rule of 7"* — *"a prospect needs to encounter
   your brand roughly seven times before taking action."* Under Contract is one of the seven. It also
   sizes the audience: a farm area of **200–500 homes** with **5–7% annual turnover**, on the logic
   that *"smaller and tighter is better than large and scattered."*

   Our own 07/01 lifecycle research had already named the behavior — *"agents who win aren't doing one
   big push — they're showing up every week … Just Listed, Week 2 Promotion, Open House, Price Update,
   Under Contract, and Sold"* — but not the WHY. This is the why.

2. **RECAPTURE OF THE UNDERBIDDERS.** The buyers who inquired on this house are, at the moment it
   goes under contract, the most qualified and most disappointed segment the agent owns — known band,
   known area, known moment of wanting. *"[Address] went fast, but I've got more for you!"* is that
   pivot in one line.

   **The crawl materially WEAKENED the backup-offer version of this pitch, and that is a useful
   correction.** Redfin (07/13/2026) cites NAR: *"only 6% of home sales fall through."* So an email
   whose ask is "submit a backup offer" is selling a 1-in-17 shot. The honest recapture CTA is
   **"here's what else," not "get in line."** What survives is the framing, from The Boland Team via
   the same page: *"One of the biggest misconceptions is that a property with an accepted offer is
   essentially off the market. In reality, many transactions never make it to the closing table."*
   And the practitioner advice is to keep looking regardless — *"we still recommend continuing to
   look at other homes while you wait"* — which is the same message our email would carry.

   **RULE 4 DISCREPANCY, unresolved:** a search summary attributed a *16.3% of purchase agreements
   cancelled (December 2025)* figure to Redfin, but the Redfin page I actually crawled cites NAR's
   **6% of sales fall through**. Different definitions (contracts cancelled vs sales failing) and I
   did not reach a primary source for the 16.3%. **Do not print either number in an email** until one
   is read at its own source.

3. **SPEED — HOW FAST IT WENT.** The one number this email owns that no other lifecycle email does,
   and it is fully sourced: **listed date from our own free spine, minus the contract date the agent
   hands us when they trigger the build.** Lane 1 plus lane 4, two real sources, zero invention.
   `listing_state.listed_date` is populated on 5,661 of the 7,209 pending sale rows (08/05/2026); an
   agent triggering a build on their OWN listing knows the list date regardless, so lane 4 covers
   the remainder too. **Do NOT compute this from `days_in_state`** — see §4.

   **The crawl promoted this from "nice to have" to the headline number, and handed us the exact
   shape.** Coffee & Contracts' recommended post is literally a two-number comparison:
   *"Most homes in [City Name] sell in X days, this one sold in X — here's why."* That template needs
   a MARKET MEDIAN and THIS HOME'S NUMBER side by side. **We hold the median and nobody else emailing
   an agent's database does** — it is `listing_dom` off our own daily spine, and the second number is
   lane 1 plus lane 4. This single line is where the four-lane moat shows up inside a lifecycle email
   instead of inside a market report.

   Same source, what to overlay when a client will not be on camera: *"days on market, original
   asking price vs. sold price, number of offers"* — days on market listed first. And the
   listing-presentation corpus confirms agents already sell themselves on exactly this metric, citing
   *"specific sales stats like their average days on the market or how often their listings sell
   above the asking price to build credibility."* An Under Contract email is that credibility claim
   made once per house, in public, with a date on it — instead of asserted in a pitch deck later.

---

## §3 — HOW IT IS DESIGNED (against `docs/standards/emails.md` §0, which wins on conflict)

Nothing crawled contradicts §0. Applying it, plus what the corpus adds:

- **The 5-part skeleton holds** (header/greeting → context → data block → single CTA → agent
  sign-off), agent-identity block at the TOP — from the 08/03 anatomy research, unchanged here.
- **Body 50–125 words.** The floor bites harder than the ceiling. This email has less to say than
  New Listing and the temptation is to run short and empty; 25 words performs like 2000.
- **Subject: 3–4 words for a reply, 30–40 chars for an open.** The one crawled real-world example
  is a RECAPTURE subject, not an announcement subject — *"[Address] went fast, but I've got more for
  you!"* is 44+ chars and optimized for the underbidder, not the sphere. If the audience is the
  database, that subject is wrong for us.
- **ONE CTA, and the crawl handed us the formula.** The honest CTA is not "see this home" — the home
  is gone. Coffee & Contracts answers the exact question ("how do I make a just-sold post attract
  potential SELLERS") with a two-move structure, and it is the most directly usable thing found in
  this pass: **lead with the speed fact, close with the soft value ask.** Verbatim — instead of
  *"Congrats to my amazing buyers!"* write *"Sold in 9 days with 4 offers — here's what made this
  listing stand out,"* then add *"Thinking about what your home could sell for? Let's talk."* Their
  own framing of why: *"That shifts the post from a celebration into a soft pitch that speaks
  directly to anyone quietly wondering about their own home's value."*

  **This resolves what looked like a fork.** Benefit 1 (social proof) and benefit 3 (speed) are not
  competing designs — speed is the BODY and social proof is the CTA, in one email. A celebration
  with no ask is the failure mode this warns about, and a bare "congrats" is the wrong email.
- **Timing: post/send within 24–48 hours of the trigger.** *"The closer to closing day, the better …
  post within 24 to 48 hours while the story feels fresh. Waiting weeks dilutes both your enthusiasm
  and the storytelling impact that makes this type of content actually convert."* Written about
  just-sold content; the same decay applies to an under-contract beat, and it argues for building the
  email the moment the agent notifies rather than batching.
- **NO CHART.** Locked by `recipes.ts` and unchallenged by anything crawled: a lifecycle email about
  one house gets the photo as its visual. *"Two bars (was/now) is a fact wearing a chart costume —
  write the fact instead."*
- **The photo is the listing's own or nothing.** Never an aerial. Locked operator rule.
- **Cadence: trigger, then space.** Event-triggered, never calendar-locked — *"Email 1 immediately
  after the trigger, Email 2 three days later"*. Relevant to us only as a caution: see §4.

---

## §4 — WHO TRIGGERS IT, AND WHY THE LAKE'S GAPS DO NOT BIND (corrected 08/05/2026)

**CORRECTION, operator, same day. The first draft of this section was wrong and it was wrong at the
premise.** It reasoned that because our market feed never logs a pending transition, the email has no
trigger and no elapsed-time number — and concluded "speed is unusable." That is true only for a
market observer emailing strangers. **We are not the sender. The agent is.**

The agent owns the listing, builds the campaign, and **notifies us when it goes under contract. That
notification IS the trigger**, and it is lane 4 of four-lane sourcing (the user writes it in) — a
first-class lane under RULE 0.7, not a fallback. Treating an empty lane 1 as a dead end is exactly
the refusal RULE 0.7 forbids: a build is NEVER blocked because we don't hold the number. The agent
also chooses the recipients, so "who is this addressed to" was never our question to answer.

So the lake facts below are **cautions about columns, not limits on the email**:

- **Speed is fully available.** Listed date (ours) minus contract date (the agent's, at trigger).
  See §2 benefit 3.
- **`days_in_state` is a trap — never use it for this.** It ages only while `state` is unchanged and
  resets only on a state CHANGE (`transitions.py:66,80`), and `flag_pending` is not part of `state`.
  A live Lee row reads flag_pending true, state active, days_in_state 34, listed 09/13/2024 — that
  34 is days in ACTIVE. "Under contract in 34 days" off that column would be a fabricated number
  built from a real one.
- **Do not try to DETECT pending from the feed for this email.** We don't need to; the agent tells
  us. Recorded only so nobody rebuilds a detector: there is no under-contract state (`state` is only
  active 30,708 / sold 789 / withdrawn 223), pending is a flag on an otherwise-active row
  (`flag_pending` true on 7,209 sale rows, Lee 4,824 / Collier 2,221), `listing_transitions.to_state`
  is only active 49,996 / sold 820 / withdrawn 234, and the flag is stale on 462 sold rows so any
  consumer must read `flag_pending=true AND state='active'`. Those matter for INVENTORY COUNTING
  (check `pending_homes_counted_as_active_inventory`), not for this email.

- **There is no under-contract STATE.** `state` is only active 30,708 / sold 789 / withdrawn 223.
  Pending is a flag on an otherwise-active row: `flag_pending` true on 7,209 sale rows (Lee 4,824,
  Collier 2,221).
- **The trigger event is not logged.** `listing_transitions.to_state` is only active 49,996 /
  sold 820 / withdrawn 234 — never pending. So "trigger, then space" has no trigger from the free
  lane. The email can say a house IS under contract; it cannot say it JUST WENT under contract.
  **Operator decision 08/05/2026: it does not need the contract date.** So the email is a STATUS
  statement, and benefit 1 (social proof) and 2 (recapture) both survive without a date. Benefit 3
  (speed) does not.
- **`days_in_state` is a trap.** It ages only while `state` is unchanged and resets only on a state
  CHANGE (`transitions.py:66,80`); `flag_pending` is not part of `state`. A live Lee row reads
  flag_pending true, state active, days_in_state 34, listed 09/13/2024 — that 34 is days in ACTIVE.
  "Under contract in 34 days" would be a fabricated number built from a real column.
- **The flag is stale on sold rows** — 462 rows are flag_pending AND sold. A consumer must read
  `flag_pending=true AND state='active'`, never the flag alone. Check
  `flag_pending_stale_on_sold_rows`.

**Price: SHIPS.** Operator decision 08/05/2026 — *"Under contract price is whatever is listed."*
So the price cell is `listing_state.list_price` off the free spine, no paid rung needed, and no
"sold for" claim is ever made (we would not have it anyway).

**Contract date: NOT NEEDED.** Operator decision 08/05/2026. The date is not a printed cell. It is
still the thing the agent's notification carries, and it is what makes the speed number computable —
those are different jobs, and only the second one survives into the email.

---

## §5 — WHAT TO WRITE NEXT

**The audience is not ours to pick.** Operator, 08/05/2026: the agent sends it "to whoever they
want." So §2's three benefits are not competing options we choose between — they are the three jobs
the SAME email does depending on who the agent points it at, and the build must serve all three
without assuming one. Practically that means the middle carries the fact (it went under contract,
this fast, at this price) and the CTA is the agent's, not a hardcoded pivot to comps.

Unresolved and worth one more pass someday: the Florida "under contract" vs "pending" wording, and
whether `flags.is_pending` at the vendor means the same thing an agent means.
