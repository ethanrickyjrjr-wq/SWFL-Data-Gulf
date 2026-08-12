# Open house / invitation email craft — what makes it actually work

Date: 08/12/2026. Lane: copy, length, the ask, the CTA, and what agents/recipients actually say
about open-house invitation emails. One of three parallel research agents (this lane = the
Reddit-heavy, practitioner-opinion lane). Feeds `docs/standards/email-build-playbook.md` §2.6
(Open House — "BUILT IN CODE, SECTION OWED") and the guard the operator is about to build for the
`open-house` narrator (currently: "warm greeting, AT MOST ONE feature 15–35 words, then the ask" —
unchecked, and has shipped with NO ask at all at least once).

**COUNT LINE: 10 of 10 crawl4ai sites fetched (9 yielded usable body content, 1 failed — see §Honest
gap). 80 Reddit queries issued across 9 Apify actor calls (40 general-search queries in 4 batches,
40 subreddit-scoped queries attempted in 5 batches) — only 8 of the 40 subreddit-scoped queries
(r/realtors) actually ran before Apify's account hit a hard MONTHLY usage cap mid-session
("Monthly usage hard limit exceeded... contact support@apify.com"); the other 32 (r/RealEstate,
r/realtorsuccess, r/Emailmarketing, r/copywriting) never executed at all. That cap is account-level,
not query-level, and did not clear during this session — it is a new DO NOT TRY entry for future
sessions this month, on top of the four already logged in the calling prompt.**

**What failed and why:** the first 40 general-search queries (no `subredditName`) defaulted to
`sort: "top", timeframe: "year"` per my own mistake overriding the actor's true default
(`sort: "relevance"`). That combination ranks by GLOBAL Reddit score, so a query like "open house
invite RSVP realtor" returned the highest-scored posts on all of Reddit that happen to contain any
of those words — e.g. a 117k-score r/mildlyinfuriating post about a betta-fish wedding centerpiece,
because it used the word "invite." Those 40 general queries are NOT usable evidence and are excluded
below except where noted. The pivot to `subredditName` + `subredditKeywords` (topic-scoped to
r/realtors) is what produced everything real-estate-specific in this file. That pivot is the
reusable lesson: **scope Reddit search to the subreddit, don't trust `sort: top` on an open query.**

---

## 1. What the 08/03 length research already settled — read first, cited not re-derived

`_RESEARCH/email-and-social/2026-08-03-email-length-and-per-type-benchmarks.md` established, from
Boomerang's own response-rate corpus (crawl4ai, primary source, immune to Apple MPP inflation):
**the 50–125 word sweet spot for response rate**, with under-writing (a 25-word email) performing
about as badly as a 2000-word one, and a body-less email getting only 11% response. It also
established GetResponse's per-TYPE table (triggered beats newsletter) and the Real Estate industry
row (42.71% open · 3.51% CTR · 8.23% CTOR · **4.86% bounce**, among the highest of any industry).

**This file ADDS:** a real-estate-specific, currently-published (2025–2026) open house template
that violates the 50–125 word band on the low end but is presented by an industry authority as
best practice; direct measured-vs-opinion evidence on whether the ask matters; and evidence on all
three RSVP-button candidate shapes. **This file does NOT resolve the 15–35 vs 50–125 word collision**
— that is explicitly left to the operator per the calling instructions; see §5.

---

## 2. Findings — measured data vs. practitioner opinion, kept separate

### 2a. MEASURED — CTA and click mechanics (marketing-industry aggregators, cite their primary sources)

- **A single, focused CTA outperforms multiple CTAs: emails with ONE CTA saw 371% more clicks and
  1617% more sales than multi-CTA emails, in documented case tests.** — shno.co/marketing-statistics
  (2026 aggregation), attributing to a documented case-test synthesis. [shno.co/marketing-statistics/email-click-through-rate-statistics]
- **Reducing to one CTA per page can boost conversions by 266%; inline CTAs get 121% higher CTR than
  sidebar CTAs; personalized CTAs convert 202% better than generic ones.** — sender.net, "50+ Call to
  Action Statistics" (2026), aggregating multiple named studies (HubSpot, Unbounce-style A/B tests).
  [sender.net/blog/call-to-action-statistics/]
- **Cross-industry average email CTR sits around 1.29%–3.96% depending on provider** (Klaviyo 2025:
  1.29% campaigns / 4.67% automated flows; Brevo 2025, 44B+ emails: 3.96% / 21% CTOR; Growth-onomics
  2026 synthesis: 2.09% cross-industry). **These three primary sources disagree by 3x on the same
  metric** — same discipline as the 08/03 file's GetResponse-vs-Campaign-Monitor conflict: use for
  RELATIVE comparison only (single-CTA beats multi-CTA, automated beats broadcast), never as an
  absolute promise. [shno.co/marketing-statistics/email-click-through-rate-statistics]
- **"A single, focused CTA... because clarity of purpose removes decision paralysis that multiple
  competing links create."** Verbatim mechanism claim, not just a number — directly bears on our
  narrator's "AT MOST ONE feature" instruction, which is really an anti-decision-paralysis rule
  already, just untested against the CTA itself (the feature line and the ask are two different
  things; the ask still needs to be singular even if the feature line is dropped to zero).

### 2b. MEASURED — real estate template craft, currently published (2025–2026)

HousingWire's "11 proven real estate email templates (with sky-high open rates)" [housingwire.com/articles/real-estate-email-templates/]
is the most load-bearing find in this pass: a currently-live, industry-authority-published open
house invitation template, quoted here in full because the exact structure is the evidence:

> **Subject line: 👀 Open house this [day and date] from [time]**
> Hey [First name / there,]
> Swinging by with a great property coming to market:
> - 3 BR/ 3 BA
> - 4 minutes to Publix
> - 11 minutes to downtown
> - Zoned for Grady, Coleman, Plant (rated 8+ per greatschools.org)
> - Under $660,000
>
> **👀 Open house this Saturday 6/14 from 1p-3p.**
> Reply to this email with questions or to schedule a private showing.
> [image]
> Hope to see you there!
> [Your Name] [phone] [Calendly link]
> P.S. Can I ask you a favor… Would you forward this to a friend who might be interested?

Count the body: roughly **60–70 words**, well under the 08/03 file's 50–125 band floor-adjacent but
inside it, and the "feature" content is a 4–5-item bullet list, not one 15–35-word sentence — this
is real-world evidence the "at most one feature" instruction is tighter than what a currently-shipping
industry template uses. **The ask is a REPLY, not a form, not an .ics, not a button** — see §4.

Housingwire's own house style rules (their "7 tips," same page): **sentences ≤9–12 words, mobile
paragraphs under 3–6 lines, subject lines under 40 characters, plain-text-style over "fancy HTML"**
except for image-heavy listing/open-house emails specifically (an explicit carve-out for this exact
email type). Also: **"Get to the point — quickly... if the answer to 'what's in it for me' isn't
immediately obvious, rework the email until it is."**

### 2c. PRACTITIONER OPINION — r/realtors (subreddit-scoped, real signal, score-ranked)

The single highest-signal find: **"By Popular Demand, Open House Lead Gen Guide"**
[reddit.com/r/realtors/comments/acex8d] (score 76, one of the highest-scored open-house posts in
r/realtors history), a detailed first-person account from an agent whose 2-person team closed
$53M/year, ~50% of it from open houses. Full promotion-to-follow-up stack, quoted:

- **Promotion channel: door-knocking (50–100 doors), cold-calling the neighborhood (Mojo dialer),
  yard signs, flyers. NOT an email invite.** Email is not mentioned anywhere in the promotion phase
  of this post.
- **Follow-up channel: a handwritten thank-you POSTCARD, mailed, plus a same-day TEXT.** Quoted
  postcard copy: *"Hi ____, Thanks for stopping by the open house at 123 Main St. It was great
  talking to/meeting/chatting with you!! If you have any questions or if you would like to see any
  other houses, please don't hesitate to call me."* — **"I got 4 deals last year where the clients
  specifically told me they met with me because I sent the post card. I am the only one who cared
  enough to take the time."** Email is again absent from this agent's stated highest-performing
  channel.

**This is a genuine tension worth surfacing, not resolving:** the top-scored tactical post in
r/realtors — real dollar figures, real specificity — routes the OPEN HOUSE INVITE and FOLLOW-UP
through door-knocking, calls, and physical mail, not email, while our build is specifically an
email. It does not mean email doesn't work; it means the highest-visibility practitioner opinion in
the community we searched treats email as one channel among several, not the default. Other threads
in the same subreddit DO use email for follow-up (a comment on a different post: *"Email them with a
list of other homes for sale that are similar and ask if you can help with any of their needs"*;
another: *"Use your CRM and plug the contacts into an 8-12 touch over the next 5-8 weeks. Mix up
calls, texts, emails"*) — so email is present, just usually as one leg of a multi-channel sequence,
not a standalone invite.

**Digital sign-in / lead capture, r/realtors** [reddit.com/r/realtors/comments/13ed9cs]: a top
comment answer to "does anyone have a way for clients to sign in digitally" — *"Use a Google form
with a QR code on display. Easy to set up and it ends up as a spreadsheet."* Low-effort, low-cost,
practitioner-validated shape for on-site capture (adjacent to but distinct from a pre-event RSVP).

**"Why do i feel ingenuine"** [reddit.com/r/realtors/comments/1ki2278] — a newer agent describing
discomfort at being pressured by a team lead to harvest friends'/family's "addresses, birthday and
emails" specifically to **RSVP them to a company event**. Relevant color for "invite past clients":
there is real practitioner discomfort with treating a personal network as an RSVP list, which is a
soft data point against over-mining sphere-of-influence contacts for invite sends, even though the
tactic is common (the lead-gen guide above explicitly says "I call sphere or past clients while I
wait" during the open house itself).

**"Email Marketing Trick"** [reddit.com/r/realtors/comments/1djneh1] — LOW-CREDIBILITY, flagged
explicitly: a self-reported, unverified anecdote (score 2, no external corroboration, and the data
sourcing method described — scraping Facebook profile pictures/names into an email list — is
ethically and likely ToS-questionable) claiming 69% open / 6.43% reply from personalizing subject +
header with the recipient's own photo and a curiosity headline: *"{{name}} looking for a 3 BHK home
in {{location}}? Here are some from {{min price}} to {{max price}}"*. **Do not treat the 69%/6.43%
figures as real** — they are an unverifiable claim on a 2-upvote post. The only transferable idea,
held to opinion status: keep the body SHORT and lead with a specific, personalized curiosity hook
rather than generic sales copy — which converges with the measured HousingWire template's brevity,
for what that convergence is worth.

### 2d. MEASURED — event/calendar mechanics (vendor-published, flag the vendor bias)

Two `add-to-calendar-pro.com` articles and one `addevent.com` article are vendor blogs selling
calendar-integration SaaS — their numbers should be read as **vendor-published, not independently
audited**, same caveat class as a benchmark from an ESP selling the thing it's benchmarking. That
said, the mechanism claims are consistent across both vendors and worth recording:

- **"Only 57% of webinar registrations convert to actual attendees"** (attributed to ON24's 2025
  Webinar Benchmarks Report) — a 43-point click-to-attendance gap. [add-to-calendar-pro.com/articles/email-click-never-becomes-calendar-event-costing-you-453d9d05]
- **"Free in-person events typically see 40–60% no-shows... webinars sit at 35–50%"** (attributed to
  eventtia.com research). [add-to-calendar-pro.com/articles/subject-line-promised-event-never-made-calendar-453e1141]
- **Open rates roughly doubled post-Apple MPP (15.2% → 29.0%)** — same caveat the 08/03 file already
  carries about open-rate inflation, now with a specific before/after number (attributed to Omeda
  analysis).
- **"When people actually save events to their calendar, attendance jumps 30–40%."** / AddEvent's
  own customer claim: **"an average of 30% increase in attendance rates when using Add to Calendar
  links."**

---

## 3. THE ASK — does an explicit ask measurably matter, and what does a good one look like

**Measured, general email (not real-estate-specific, carried from 08/03 but restated because it is
the strongest direct evidence on this question):** Boomerang found emails asking 1–3 questions are
**50% more likely to get a response** than emails asking none, and a body-less (askless) email
converts at only 11%. That is the strongest primary-source evidence available that AN ASK IS NOT
OPTIONAL — a body without a clear next step is close to the worst-performing shape measured.

**Measured, CTA mechanics (general, not real-estate-specific):** single, focused CTA outperforms
multiple/competing CTAs by a wide margin (371% more clicks / 1617% more sales, shno.co synthesis;
266% conversion lift from reducing to one CTA per page, sender.net). This is consistent with — and
gives a mechanism for — the operator's existing "AT MOST ONE feature" instinct: it's not just the
feature copy that needs to stay singular, the ASK itself needs to stay singular. A guard that checks
for "exactly one call-to-action verb phrase present" would be directly supported by this evidence;
a guard that allows the ask to silently disappear (which is the actual bug reported) is directly
contradicted by the 11%-response body-less-email data point.

**Practitioner opinion, real-estate-specific:** the HousingWire template's ask is a bare **"Reply to
this email with questions or to schedule a private showing"** — one sentence, one verb ("reply"),
no button, no form, no calendar link. The r/realtors lead-gen guide's ask is entirely off-channel
(door-knock, call, mail a postcard) — it doesn't ask anything IN an email because the invite isn't
sent by email in that agent's stack at all.

**What a good ask looks like, synthesized from what's actually evidenced (not invented):** one
sentence, one verb, placed where it can't be missed if the reader stops reading early. Placester
[placester.com/real-estate-marketing-academy/real-estate-email-marketing-listings-open-houses]
makes an explicit placement claim worth carrying: *"it's crucial to put your CTA at the end of your
introductory copy, but before your listings"* — because readers may click before reaching the
bottom of a longer email. For a short open-house invite this matters less (there isn't room for the
reader to bail before the ask), but it's a real placement mechanism, not folklore.

---

## 4. RSVP BUTTON — evidence on the three candidate shapes, none resolved

**Shape 1 — prefilled mailto / reply.** This is what the one currently-published, real-estate-
authority template in this pass actually uses ("Reply to this email with questions or to schedule a
private showing" — HousingWire/Coffee & Contracts). Zero build cost, zero broken-render risk (a
`mailto:` link doesn't get mangled by Gmail/Outlook/Apple Mail the way calendar buttons do — see
Shape 3 below), but produces no structured lead record and no attendee count.

**Shape 2 — hosted lead-capture form writing a lead row.** Not directly evidenced for the PRE-event
invite in this pass, but the adjacent ON-SITE sign-in use case is: a top r/realtors comment
recommends a **Google Form + QR code, "easy to set up and it ends up as a spreadsheet"** — cheap,
practitioner-validated, but for AT the open house, not for the invite email that gets someone there.
Greenvelope and theclose.com both describe "online invitations" with built-in RSVP tracking as the
generic-events industry norm (Greenvelope explicitly sells this), but see the direct conflict below.

**Shape 3 — .ics calendar invite.** The most heavily documented shape in this pass, but ALL of that
documentation is vendor-published (add-to-calendar-pro.com, addevent.com — both sell calendar-link
SaaS, so treat every number here as vendor-interested) and about GENERIC events (webinars,
conferences), never real-estate open houses specifically. Their consistent, cross-vendor technical
claim: **raw .ics files render badly and inconsistently — "Gmail strips certain dynamic content and
renders some calendar buttons as blank boxes," "Outlook has its own calendar system and often
hijacks links," "Corporate email filters flag ICS files as suspicious attachments and quarantine
them," and importing a raw .ics on mobile can take "four to seven steps" versus one click for a
hosted add-to-calendar link.** [addevent.com/blog/stop-using-confusing-ics-files-heres-how-to-improve-attendance-rates-with-add-to-calendar-links]
Their alternative — a hosted "Add to Calendar" LINK (not an embedded raw .ics attachment) that
redirects to the right calendar app — claims **~30% attendance lift**, and a stated psychological
mechanism (*"a calendar entry is a promise to your future self... a micro-commitment"*) that reads
as plausible but is not independently measured in what was crawled.

**Direct conflict found, surfaced per house rule (X verified, Y needs review):**
Greenvelope, a paid digital-invitation platform, states outright: **"Events like a real estate open
house to promote a listing should not request RSVPs"** [greenvelope.com/blog/open-house-invitation/],
while theclose.com — a real-estate-specific authority, not a generic invitation vendor — says
**"RSVPs can be handy but are only sometimes necessary for an open house event. However, if you're
marketing a luxury property and want to get a headcount or add a touch of exclusivity, go ahead and
ask for RSVPs."** [theclose.com/open-house-invitation-templates/] These do not agree on whether an
RSVP mechanism belongs on a standard (non-luxury) open house invite at all — Greenvelope says no,
theclose.com says situational-yes. Neither is a measured study; both are practitioner/vendor opinion
pieces. **This bears directly on the operator's open question and is not resolved here on purpose.**

**Net for the operator's three candidates:** no source in this pass measured all three shapes
head-to-head for a real-estate open house specifically. Shape 1 (reply) has the best real-estate-
specific, currently-published precedent and the lowest technical failure surface. Shape 3 (.ics) has
the most documentation but it's all vendor-sourced, all about non-real-estate events, and the
vendors themselves document that raw .ics (as opposed to their own hosted-link product) frequently
breaks across Gmail/Outlook/Apple Mail — a real risk if built naively. Shape 2 (hosted form) is
validated only for on-site sign-in, not pre-event invite, in what was found.

---

## 5. LENGTH — evidence bearing on the 15–35 word feature line vs. the 50–125 word email band

Presented, not resolved, per the calling instructions.

- The 08/03 file's Boomerang-measured 50–125 word band is about GENERAL email response rate, not
  real-estate-specific, and not open-house-specific.
- The one currently-published, real-estate-authority OPEN HOUSE template found this session
  (HousingWire/Coffee & Contracts, §2b) runs roughly 60–70 words INCLUDING a 5-line feature bullet
  list, a greeting, a sign-off, a P.S., and an ask — i.e., the FEATURE content alone in that template
  is well under 35 words per bullet, but the bullets are plural (5 short facts), not the narrator's
  current "at most one feature, 15–35 words" as a single prose sentence.
- HousingWire's own stated rule for this email type: sentences ≤9–12 words, subject line <40
  characters, and an explicit carve-out that image-heavy open-house emails are ALLOWED to break from
  their general "skip fancy HTML" rule.
- No source in this pass measured word count specifically for open-house-invite response rate the
  way Boomerang measured it for general email — that measurement gap is real and unfilled.
- The r/realtors practitioner opinion (§2c) doesn't bear on word count at all, since its highest-
  regarded post doesn't use an email invite in the first place.

**What this does NOT resolve, stated explicitly so it isn't silently averaged:** whether the
narrator's "15–35 words, at most one feature" ceiling should widen toward Boomerang's 50–125 general
floor, stay tight because that's what the one real precedent template does (bullets, not prose, and
still short), or something else. That is the operator's call per the calling brief.

---

## 6. HONEST GAP — what was searched for and not found

1. **No head-to-head measured comparison of the three RSVP-button shapes for a real-estate open
   house specifically.** Everything in §4 is either vendor-sourced (calendar links) or single-
   practitioner opinion (reply, form). Not found despite searching (WebSearch pass explicitly for
   "add to calendar ICS button click rate benchmark" and "open house RSVP CTA best practices").
2. **32 of the 40 subreddit-scoped Reddit queries never ran** (r/RealEstate, r/realtorsuccess,
   r/Emailmarketing, r/copywriting) — Apify's account hit a hard MONTHLY usage cap mid-session, not
   a per-query cap, and it did not reset before this file was written. r/copywriting and
   r/Emailmarketing in particular might have carried the general (non-real-estate) CTA/length
   practitioner opinion this file leans on secondary sources for instead.
3. **No word-count-specific measured study for open-house invitations**, as distinct from general
   email (Boomerang) or real-estate email broadly (GetResponse/Campaign Monitor, both already in the
   08/03 file). This is the single biggest gap against the operator's actual open question.
4. **digitalrsvps.com/blog/17-open-house-invitation-wording-examples-that-get-rsvps crawled but
   returned no article body** — crawl4ai pulled only the site's footer/nav (client-rendered content
   the crawler didn't wait for or execute). Not re-attempted this session; a retry with a different
   crawl4ai flag (e.g. explicit JS wait) might recover it, but wasn't tried given the other 9 sites
   already covered the ground it likely would have.
5. **No source measured whether an RSVP requirement REDUCES turnout** (friction cost) versus the
   headcount/exclusivity benefit theclose.com claims — only opinion on each side, no A/B data either
   direction.

---

## Sources

**crawl4ai, this session, 08/12/2026 (9 of 10 yielded content):**
1. theclose.com/open-house-invitation-templates/
2. digitalrsvps.com/blog/17-open-house-invitation-wording-examples-that-get-rsvps — FAILED, no body content
3. sender.net/blog/call-to-action-statistics/
4. add-to-calendar-pro.com/articles/email-click-never-becomes-calendar-event-costing-you-453d9d05
5. addevent.com/blog/stop-using-confusing-ics-files-heres-how-to-improve-attendance-rates-with-add-to-calendar-links
6. placester.com/real-estate-marketing-academy/real-estate-email-marketing-listings-open-houses
7. housingwire.com/articles/real-estate-email-templates/
8. shno.co/marketing-statistics/email-click-through-rate-statistics
9. add-to-calendar-pro.com/articles/subject-line-promised-event-never-made-calendar-453e1141
10. greenvelope.com/blog/open-house-invitation/

**Apify `fatihtahta/reddit-scraper-search-fast`, this session, 08/12/2026:**
- 40 general-search queries (4 batches) — largely unusable, `sort:top` mistake (see header)
- 8 of 40 planned subreddit-scoped queries against r/realtors — usable, cited throughout §2c
- 32 of 40 subreddit-scoped queries (r/RealEstate, r/realtorsuccess, r/Emailmarketing,
  r/copywriting) never ran — Apify account hard monthly-usage cap hit mid-session
