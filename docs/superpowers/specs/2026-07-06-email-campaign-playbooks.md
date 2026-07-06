# Email campaign playbooks — button → follow-up → tracking

Research base for the click-triggered follow-up system: for each starting email template, what
buttons it actually carries, what fires when a recipient clicks one, how long to wait before the
next touch, and what gets tracked along the way. Compiled 07/06/2026 — every claim below was
fetched live via crawl4ai (`C:\Users\ethan\crawl4ai-venv\Scripts\python.exe`), including the
discovery pass itself (a direct crawl4ai fetch of `html.duckduckgo.com/html/?q=...`, not the
WebSearch tool) — RULE 0.4, no memory, no other crawler. Sources: moosend.com, activepipe.com,
realestatetoolkit.ai, sierrainteractive.com, followupboss.com, pivotamarketing.com, calendly.com,
realtymarketingpro.com, gmass.co, trimbox.io. This is the reference map; wiring click-tracking,
calendar OAuth, and the send-scheduler is separate implementation work (needs its own brainstorm
+ build registration per RULE 3.5 before any code lands).

## The one pattern everything reduces to

Every campaign is the same finite-state machine, repeated:

```
STARTING TEMPLATE (one visual family)
  → has ONE primary button (the ask)
  → CLICK  → fires the next email, same visual family, sent at a fixed delay
  → NO CLICK by a deadline → fires a different email (reminder or re-engagement), same family
  → that email has its own button → same rule applies, one level deeper
```

A = B, B = C: a "New Listing" click becomes a "Showing Confirmation" send; a "Showing
Confirmation" click (or non-click) becomes a "Directions Reminder" or a "Feedback Ask"; a
"Feedback Ask" click becomes either another Showing Confirmation (loop) or a Buyer Nurture entry.
The templates repeat; only the state advances. [Confirmed pattern] Sierra Interactive draws
exactly this distinction: "Drips are often time-based. Sequences can be behavior-based, with
branching paths depending on engagement" — and sequences auto-enroll leads "based on tags,
actions or source" and exit "if a lead replies, converts or is reassigned."
(sierrainteractive.com/glossary-term/real-estate-email-sequences/, fetched 07/06/2026)

## Prerequisite: calendar connection (before any "Schedule a Showing" button is trustworthy)

The showing-confirmation build broke here today: the AI substituted a chart because it had no
real appointment. A "pick a time" button must never offer time slots we didn't verify — that's an
invented value (RULE: no fabricated verifiable data). Concretely, per Calendly's own feature
list, "connecting a calendar" means: sync Google/Outlook/Exchange to avoid double-booking, define
available hours + buffers between meetings, auto-generate a video-conferencing link if virtual,
and produce one shareable booking link. (calendly.com/features, fetched 07/06/2026)

Two lanes, in order:
1. **Calendar connected** — the button offers real open slots pulled live from the connected
   calendar; the confirmation email that follows has REAL time/place data, no invention needed.
2. **Calendar not connected yet** — the button must degrade honestly to "Tell us what times work
   for you" (a request-form, not a fake picker) until the agent connects a calendar. Never render
   a "Monday 4pm" as if it were live-checked when it wasn't.

## Campaign 1 — New Lead / Prospect Welcome (our `agent-intro` recipe)

**Button:** one reply-ask ("reply with your address").

**Tracked:** reply detection, not clicks — replies are the real signal here, not opens.
RealEstateToolkit.ai: "Open rates and clicks are 'vanity metrics'... focus on reply rate and
conversions. A 15% open rate with a 3% reply rate beats a 40% open rate with 0% replies."
(realestatetoolkit.ai/blog/email-automation-real-estate-guide/, fetched 07/06/2026)

**If they reply:** agent takes it manual from there (a real conversation started — automation's
job is done). Named-source confirmation of the pause-on-reply rule: automation platforms "allow
agents to set conditions, like pausing emails if a lead responds, preserving a human touch in
automated follow-up emails." (realtymarketingpro.com, same source, fetched 07/06/2026)

**If no reply, the exact day-by-day fallback sequence** (named source, verbatim cadence):

| Day | Subject | Content focus |
|---|---|---|
| 0 | Welcome! Here's what to expect | Intro, how you help, what's next |
| 1 | Quick question about your search | Ask timeline and priorities |
| 3 | [Neighborhood] market update | Value-add, local expertise |
| 5 | 3 things buyers miss in [area] | Educational, build trust |
| 7 | Still looking for homes? | Check-in, offer to schedule a call |
| 10 | Free home buying checklist | Lead magnet, added value |
| 14 | One more thing before I go | Final outreach, move to nurture |

(realestatetoolkit.ai, same source, fetched 07/06/2026)

**Day 7's "offer to schedule a call" button routes into Campaign 2** (showing-confirmation family)
once a time is picked.

## Campaign 2 — Showing / Tour Confirmation (our `showing-confirmation` recipe, shipped today)

**Buttons this needs, concretely — the direct fix the operator called out:**
- Primary: "Add to your calendar" (an .ics link — no chart, ever; this recipe's prose already
  says exactly one button, but doesn't yet forbid the chart substitution the AI defaulted to when
  no photo was bound — needs a follow-up edit to the recipe text).
- A **clickable address** that deep-links to Apple Maps / Google Maps (a `tel:`-style URI scheme,
  not a static map image) — this is the concrete, missing piece. No vendor source is needed to
  justify a functioning link over a picture of a map; it's strictly more useful and this is a
  build task, not a research question.

**Tracked:** click on "Add to calendar" = confirmed attendance signal. Click on the map link =
secondary attendance signal (they're checking the route). Follow Up Boss's real mechanic: "your
agents get a desktop and mobile notification when a lead opens an email or clicks a link" — the
same click-then-notify wiring applies here. (followupboss.com/features/email, fetched 07/06/2026)

**Automatic follow-ups (deterministic on the appointment date, not click-gated):**
- Day-before or morning-of: a reminder email, same visual family, with the same maps-deep-link
  button as the primary action.
- Day-after: a feedback-request email — "How was the showing?" This is ActivePipe's named
  "Inspection and Appraisal Follow-Up" workflow verbatim: "Request feedback after an inspection or
  appraisal... Prompt contacts to book a follow-up call... Receive notifications when a contact
  submits feedback or engages." (activepipe.com/blog/email-automation-workflows-for-agents/,
  fetched 07/06/2026)

**If no click on "Add to calendar" within a set window:** create a task for the agent to call and
confirm manually — Pivota Marketing's exact pattern: "create triggers that automatically generate
tasks based on specific lead actions... if a lead clicks on a property link... a task could be
created for you to call them within [a set window]."
(pivotamarketing.com/blog/how-to-automate-follow-ups-for-real-estate-leads-and-why-youll-be-glad-you-did,
fetched 07/06/2026)

**Click "book a follow-up call/showing" on the feedback-request email** → loops back into this
same Campaign 2 for the next property, or → routes into Campaign 6 (buyer nurture) if the
feedback signals "not the right fit."

## Campaign 3 — Just Listed / New Listing Alert

**Buttons:** one primary ("Schedule a private showing"), one soft secondary text link ("See more
photos") — matches the one-hard-CTA-plus-soft-secondary convention already used in
showing-confirmation.

**Click "Schedule a private showing"** → this is the single highest-intent signal in the whole
system. Notify the agent immediately (Follow Up Boss's click-notification mechanic, cited above),
then route the recipient straight into Campaign 2's calendar-picker step.

**Click "See more photos" (soft link) or no click at all** → falls into ActivePipe's named
"Listing and Buyer Updates" workflow: preference-based filtering so "property alerts and listing
emails can be filtered based on preferences" instead of one more generic blast.
(activepipe.com, same source, fetched 07/06/2026)

## Campaign 4 — Open House Invitation

**Button:** "RSVP for [day]."

**Click RSVP** → reuses Campaign 2 (showing-confirmation) wholesale — an open house is a
scheduled-visit variant, not a new template. Same day-of reminder, same day-after feedback ask.
This exact shape is independently confirmed, not invented: "a lead registering for an open house
might trigger a confirmation email, followed by a thank-you message [24 hours later]."
(realtymarketingpro.com/automated-email-marketing-for-real-estate/, fetched 07/06/2026)

**Click "not this time" or no RSVP** → stays in the regular market-update cadence (Campaign 5),
no separate path needed.

## Campaign 5 — Market Update / Newsletter (our `monthly-newsletter` / `sphere-weekly` recipes)

**Button:** one reply-ask, matching the existing recipes' convention.

**Click any listing or area link inside the newsletter** → tags the recipient by area/property-
type interest for future filtering, rather than firing an immediate new email. ActivePipe's named
"Past Client Stay-in-Touch" workflow: "Emails that are triggered when past clients click on
listings, market updates, or specific property types" feed "targeted segmentation for local
market reports, suburb updates, or homeowner tips." (activepipe.com, fetched 07/06/2026)

**No opens/clicks over a long window** → move them to a lower-frequency "still there?"
re-engagement variant rather than continuing full cadence. ActivePipe's named "Re-Engaging Quiet
Contacts" workflow monitors "email opens and link clicks... length of time since last
interaction," and notes "removing consistently inactive contacts can improve overall engagement
rates and email deliverability." (activepipe.com, fetched 07/06/2026)

## Campaign 6 — Home Valuation / Seller Nurture

**Button:** "Get my home's value."

**Click** → fires a CMA/valuation-result email in the same visual family (one chart, one number)
— RealEstateToolkit.ai's Seller Nurture content idea names this exact offer: "Free CMA offer."
(realestatetoolkit.ai, fetched 07/06/2026)

**No click** → continues the named Seller Nurture drip verbatim: 8–12 emails over 3–6 months,
bi-weekly, content mix of comps, pre-listing prep checklists, staging ROI, market-timing
insights, and seller success stories. (realestatetoolkit.ai, same source)

## Campaign 7 — Just Sold / Post-Closing Follow-up (gap — no recipe shipped yet)

**Named source's exact cadence** (realestatetoolkit.ai, fetched 07/06/2026):

| Timing | Subject | Content | Button |
|---|---|---|---|
| Week 1 | Congratulations on your new home! | Thank you, ask for feedback | "Leave feedback" |
| Week 2 | New homeowner checklist | Utilities, address change, etc. | none (informational) |
| Week 4 | Settling in? | Check-in, local service recs | "See recommended vendors" |
| Month 2 | Vendor recommendations | Contractors, landscapers | none |
| Month 3 | Would you refer me? | Request review/referral | "Refer a friend" |
| Month 6 | Your home value update | Equity check | "See my updated value" |
| Month 12 | Happy house-aversary! | Annual check-in, year review | none (reuses year-in-review recipe) |

**Click "Refer a friend"** → tags the sender as a promoter and routes any NEW referred contact
into Campaign 1 (New Lead Welcome) from the top — the loop closes back to the start.

**Click "See my updated value"** → routes into Campaign 6's valuation-result email.

## Campaign 8 — MLS status-change triggers (the real upstream source for Campaigns 3 & 7)

RULE 0.5 first: we already ingest exactly this event data. `ingest/pipelines/listing_lifecycle/`
is a real, working state-machine diff engine (`transitions.py`) that compares each scan against
stored state and emits durable transition rows into a `listing_transitions` table
(`from_state`/`to_state`/`price_delta`/`at` — see `docs/sql/20260701_listing_transitions_recent_
zip_stats.sql`). Two brain packs (`active-listings-swfl.mts`, `listing-momentum-swfl.mts`) already
read it for market reporting. **What's missing: nothing in Campaigns 3 or 7 is actually wired to
fire FROM these rows** — they've been treated as self-starting all along. That's the real gap this
campaign closes.

**Our own event vocabulary, verbatim from the code:** a new listing appears (`from_state IS
NULL`), a price moves within active (`from_state = to_state` with `price_delta` negative or
positive — a cut OR a raise, both tracked), a listing leaves the active market to `holding`
("reason TBD... sold / pending / withdrawn — the source doesn't say, so we don't claim"), and a
holding listing later resolves to `sold` or `withdrawn` via a live probe, or reappears
(`back_on_market`, a relist).

**Industry vocabulary, to confirm we're not naming something idiosyncratic:** RESO (the Real
Estate Standards Organization — reso.org, confirmed live 07/06/2026) maintains the industry's
`StandardStatus` field, the standard names MLSs and IDX systems use: Active, Active Under
Contract, Pending, Closed, Withdrawn, Canceled, Expired. Our internal states map directly onto
these; nothing here is invented.

**The trigger table, real practitioner source, not guessed** — a status-change-comms recipe names
exactly which transitions should auto-send and which must stay manual:
Active→Pending fires an automatic email+SMS to the seller and co-listing agent; Under Contract
confirmed, inspection scheduled, appraisal ordered, contingency removed, and clear-to-close all
auto-send to the relevant subset (seller / buyer agent / lender / TC). But: **"any status that
means trouble (back on market, contingency failed) should route to you, not to an auto-send"** —
back-on-market and a failed contingency are explicitly held out as human-only, never automated,
because "a back-on-market status should never be the first thing a seller learns from an
automated text." (ustechautomations.com/resources/blog/automate-listing-pending-under-contract-
status-comms-2026, fetched 07/06/2026)

**New listing → new-listing-alert (Campaign 3):** `from_state IS NULL` is the real trigger — this
is also the true origin of Campaign 9's `content-repurposing-source` fan-out (the listing feeds
the email AND the social post at the same moment it's created, not on some separate schedule).

**Price cut → a new, currently-missing email:** `price-drop-alert`. Critically, this should NOT
blast the whole list — a real product (RealScout) gates this exactly: **"clients will only
receive additional email notifications for status or price changes if they have marked a home as
Interested."** Coming Soon → Active is the one status change that alerts broadly; price/status
changes beyond that are opt-in per listing. (support.realscout.com/en/articles/11954599-listing-
alert-emails-for-status-changes, fetched 07/06/2026)

**Departure to `holding` (unresolved) → do NOT auto-send anything client-facing.** Our own code's
comment is explicit: "we don't assert WHY it left — sold/pending/withdrawn is unknown." This
matches the practitioner rule above exactly — ambiguous/bad-news status changes are a human task,
never an automated send. Route to an agent task: "listing left the active market, reason
unresolved — check and follow up."

**Holding resolves to `sold` (via live probe) → Campaign 7 (just-sold/post-closing).** This is the
real trigger that should start that whole sequence — today it has no wiring to anything.

**Holding resolves to `withdrawn`, or reappears as `back_on_market`** → both stay human-only per
the practitioner rule above. Route to an agent task, never an automated client email.

## Campaign 9 — Cross-channel: email ↔ social

Researched live via crawl4ai 07/06/2026 (growth-realty.com, propphy.com, keetechnology.com,
aihomedesign.com — discovered through a crawl4ai-native DuckDuckGo fetch, not WebSearch). Our own
code was probed first: `lib/social/` is a real, working publish + schedule + engagement-tracking
engine (platforms: x, facebook, instagram, linkedin, google_business; metrics: like, comment,
share, impression, click) but it is a SEPARATE state machine from email's — "mirrored from
lib/email/outreach/lifecycle.ts" but deliberately drops the drip cursor ("social is one-shot per
cadence"). Per existing memory, it's also unwired from the lab's Generate-Week tool. Cross-channel
triggers are a real gap in code today, same as most of Campaigns 1–7.

### Social → Email (a social action starts or feeds an email flow)

**A Facebook/Instagram Lead Ad Instant Form submit is the highest-value trigger.** The lead is
"instantly synced" to the CRM and marketing stack, and "immediate SMS and email replies" fire the
moment the form lands. (propphy.com/blog/facebook-lead-ads-integration-real-estate-agents-2026-guide,
fetched 07/06/2026) The exact reason speed matters: "responding to an online inquiry within the
first five minutes increases conversion rates dramatically." (keetechnology.com, same fetch date)
Concretely, a social lead ad's Instant Form submit should fire Campaign 1's Day-0 welcome email
as the automated first reply — not a generic "we got your info" holding message.

**Organic social content that gates something (a valuation tool, a guide, a checklist) grows the
email list directly:** "Use social posts to promote gated content (like home valuation tools) and
grow your email list." Once someone submits, "they're added to your email list for future
nurturing campaigns." (growth-realty.com/social-media-and-email-integration-best-practices/,
fetched 07/06/2026) A "get your home's value" link in an Instagram bio or post caption routes into
Campaign 6 exactly like the in-email button does.

### Email → Social (an email signal feeds a social action)

**Email inactivity should feed BOTH the email re-engagement path AND a social retargeting
audience, not just one** — named source, verbatim: "a subscriber who clicks on multiple listing
emails in one week might benefit from a personal follow-up, while less active contacts might
respond better to a re-engagement campaign on social media." (growth-realty.com, fetched
07/06/2026) Mechanically, this runs through the Meta Pixel: "track which listings prospects view
on your website... upload your email list to create custom audiences for retargeting ads." (same
source) So Campaign 5's "long inactivity" branch should fan out to two parallel actions: the
existing email `re-engagement-variant`, AND uploading that contact into a social retargeting
audience — not an either/or choice.

**A website visitor who views a listing but never submits a form** is the other named entry point
into the same retargeting audience — this is the mid-funnel step of a three-stage funnel: "Top-of-
funnel ads earn attention... Mid-funnel ads re-engage people who showed interest... Bottom-funnel
ads convert with a clear offer and a friction-managed lead form." (aihomedesign.com/blog/real-
estate-marketing/real-estate-facebook-ads/, fetched 07/06/2026) Crucially, the bottom-funnel ad's
"clear offer" should land the click on the SAME email-capture surfaces already mapped in Campaigns
3 and 6 (new-listing showing-booking, or the valuation CTA) — a retargeting ad is a re-entry point
into the existing graph, not a new destination.

### One asset, both channels (not a trigger — a fan-out)

Not every connection is a trigger; some are just shared source content. "A single property
listing can be transformed into an Instagram carousel (5–7 images), a 15–30 second TikTok or Reel,
a 'Just Listed' email blast, and a detailed feature in your monthly newsletter." (growth-realty.com,
fetched 07/06/2026) So Campaign 3 (new-listing-alert) and the matching social post are siblings
fed by the same listing record, not sequential — same reasoning applies to a just-closed sale
becoming both the post-closing email (Campaign 7) and a testimonial/win post on social.

### Compliance flag, not a build item yet

Real estate ads run under Meta's Special Ad Category for housing, which strips normal demographic
targeting (age, gender, some location precision) to comply with fair-housing rules.
(aihomedesign.com, fetched 07/06/2026) Irrelevant to anything we build until paid social ads are
actually in scope — flagging so nobody re-discovers it the hard way later.

## What to build next (not done yet — flagging, not doing)

1. Fix the `showing-confirmation` recipe prose to explicitly forbid chart substitution and
   require a real maps-deep-link button — small, direct, no research needed.
2. Ship the Campaign 7 (just-sold/post-closing) recipe — same distiller-skill process used for
   showing-confirmation.
3. The actual click-tracking + calendar-OAuth + send-scheduler infrastructure that makes any of
   this fire automatically is a real feature, not a doc — needs `superpowers:brainstorming` and
   `scripts/new-build.mjs` registration before code starts, per this repo's standing rules.
4. Wiring `lib/social/` and the email drip system together (Campaign 9) is its own real feature —
   a Meta Lead Ads webhook receiver, a pixel/custom-audience upload job, and a shared "contact"
   record both systems read — same brainstorm-first rule applies before any code lands.
5. Wiring `ingest/pipelines/listing_lifecycle/` transitions into the email/social graph
   (Campaign 8) is its own real feature too — a listener on the `listing_transitions` table (or
   its distill step) that fans out to the right campaign per `to_state`, with the human-only
   exception lane (holding/withdrawn/back_on_market) enforced in code, not just in a doc. Same
   brainstorm-first rule applies.

See `2026-07-06-email-campaign-flow-graph.yaml` for the machine-readable node/edge version of all
8 campaigns, and the published visual map for the clickable version.
