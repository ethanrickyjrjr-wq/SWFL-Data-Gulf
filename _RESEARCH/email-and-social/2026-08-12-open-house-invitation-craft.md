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

**ADDENDUM, same date, second crawl4ai pass — §7 added, filling the map/add-to-phone/QR-in-email gap
§4 left open. See §7's own count line for that pass's sourcing.**

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

## 7. THE RSVP CTA'S DESTINATION — map, add-to-phone, and QR-in-email, crawled per operator's three
   named hypotheses ("I think it's probably a map and way to add address to phone. Maybe a QR code
   appears?")

Second crawl4ai pass, same date, filling the specific gap §4 left open: not which SHAPE (reply/
form/.ics) but what the button, once tapped, actually SHOWS or DOES for the recipient. crawl4ai
only; no search-engine API exists for the tool, so DuckDuckGo's server-rendered HTML result page
(`html.duckduckgo.com/html/?q=...`) was crawled as a discovery step, then the real articles it
surfaced were crawled directly — same tool, same evidence rules, just used as its own index.

**COUNT LINE: 3 of 3 hypotheses addressed below (map, add-to-phone, QR-in-email). 8 URLs crawled
this pass: 1 authoritative reference site, 2 vendor blogs (deliverability, link-shortener/calendar),
2 AI-content-farm pages identified and excluded from evidence, 1 QR-vendor page, 2 DuckDuckGo result
pages used for discovery only (not cited as sources).**

### 7a. Hypothesis 1 — "a map"

**What's technically possible, from an authoritative non-vendor source:** [caniemail.com](https://www.caniemail.com/)
is the HTML-email compatibility reference — community-maintained, cited industry-wide the way
caniuse.com is cited for browsers, no product to sell either direction. Searching it for `iframe`
returns **"No results found"** — iframe isn't even tracked as a feature there, because it isn't
supported anywhere email renders. [caniemail.com/search/?s=iframe] **That settles the technical
ceiling: a live, interactive, pannable map embedded in the email itself is not possible in any
mail client.** The only two things that can appear where a "map" is wanted are (a) a static image
(a screenshot or a Static-Maps-API-generated PNG) or (b) a plain `<a href>` link that leaves the
email and opens a maps app or site. Both are ordinary, zero-risk HTML-email primitives — an image
and a link — neither is a novel build.

**Two AI-content-farm pages surfaced by the DDG search and explicitly EXCLUDED as evidence, flagged
the way the calling file already flags low-credibility Reddit posts:**
- `office.alibaba.com/officesoftware/how-to-embed-a-map-in-outlook-email` — invents a "Microsoft
  surveys show 68%... 17%" statistic with no citation, a fabricated five-star reliability table, and
  a fake author bio, on a domain (Alibaba's "office productivity" content vertical) with no actual
  authority over Outlook. Templated title pattern ("What Most People Miss About X") repeated across
  dozens of unrelated Office topics on the same site — a content-mill signature. **Do not treat the
  68%/17% figures as real.**
- `events-places.com/en/how-to-include-an-access-map-in-an-invitation/` — a French event-venue
  directory's English blog, keyword-stuffs "access map in an invitation" dozens of times, and its
  own "related posts" are about relationship advice, unrelated to events. Same AI-content-farm
  signature as the calling file's flagged Reddit post, just as a full article instead of a low-score
  comment.
- **The one transferable idea from the excluded events-places page, held to opinion status because
  the source itself is not credible:** it repeatedly pairs "a simple map image" with "a QR code or
  clickable link for live navigation" as complementary, not competing — consistent with what usebouncer
  (§7c, a genuinely credible source) says independently about QR needing a fallback, for what that
  convergence is worth from a non-credible source.

**Real, if generic, real-estate-adjacent evidence for the "map" idea being just a directions link:**
QR-vendor page `qrwink.com/qr-code-for-google-maps` states real estate agents already put Google Maps
QR codes on **yard signs and flyers** — physical, on-site collateral — so a buyer "driving through a
neighborhood... can scan it to save the location, get directions for a return visit, or navigate to
a nearby open house." Vendor-published (QRWink sells QR generation), and about **physical signage,
not email** — directly consistent with the calling file's existing r/realtors finding (§2c: the Google
Form + QR pattern is also for on-site, not for the pre-event email) and with usebouncer's independent
finding in §7c below. **No source in either research pass found a real-estate open-house EMAIL using
a map image or a maps deep-link.** That is a real gap, not a resolved answer.

### 7b. Hypothesis 2 — "a way to add address to phone"

**What was searched and found NOT to be the real-world pattern:** vCard (`.vcf`) is a real, working
mechanism — Microsoft's own support docs confirm Outlook can attach a contact as a `.vcf` file that
imports into Gmail, Apple Mail, and "many other mail programs"
[support.microsoft.com/en-us/outlook/send-and-save-contacts-as-vcards-vcf-files]. But every source
found for it describes **sharing a PERSON'S contact card** (a business card exchange between two
people composing email manually) — none describe a marketing/event use case of a vCard carrying a
VENUE's address as a call-to-action inside a bulk-sent invitation. That absence is real: it was
searched for directly and not found, so it is reported as a gap, not assumed away.

**The mechanism that actually IS documented for this, and that connects directly back to §4's Shape
3 (the .ics / add-to-calendar candidate already in this file):** Flyn's guide to add-to-calendar
links [flyn.to/blog/add-to-calendar-links-for-events] — a link-shortener/analytics vendor, flag the
bias — states the calendar event's **location field** is what should carry the address, and that
"calendar apps make the location tappable, so attendees can jump straight from the calendar reminder"
to it. Their example is a Zoom join URL for virtual events, but the mechanism is address-agnostic:
whatever string sits in an .ics `LOCATION` field or a Google/Outlook calendar-link's `location`
parameter becomes a tap-target inside the recipient's native calendar app once saved, and on both
iOS and Android that tap opens the device's default maps app with the address already loaded — this
is standard OS-level calendar behavior, not something the email itself has to build.

**What this means for the operator's two hypotheses together:** "a map" and "a way to add address to
phone" are not two separate features to build. **They converge on the SAME mechanism already
identified in §4 as Shape 3** — an add-to-calendar link (or its .ics fallback) with the property
address in the `LOCATION` field. One tap saves the event; a second tap on the saved calendar entry's
location field is what hands the address to the phone's maps app, on the OS's own rails. A dedicated
vCard, a separate "add to contacts" button, or a standalone static map image would each be a second,
redundant mechanism for a job the calendar link's location field is already positioned to do — a
build-cost argument, not a rendering one, since §4 already flagged the .ics rendering risk (Gmail
blank boxes, "four to seven steps" on some clients) as real and unresolved.

### 7c. Hypothesis 3 — "maybe a QR code appears"

**Direct answer to the operator's own stated objection** ("most opens are ON the phone that would
scan it"): usebouncer.com's `QR Codes in Email Marketing: Best Practices, Use Cases, and Mistakes to
Avoid` [usebouncer.com/qr-codes-in-email-marketing-best-practices-use-cases-and-mistakes-to-avoid/]
— an email-deliverability vendor, not a QR vendor, so less motivated to oversell QR specifically —
names that exact objection as the **#1 documented mistake**, verbatim: **"The most common mistake is
using a QR code when a button would work better. If the subscriber is already on mobile, asking them
to scan a QR code from the same device creates friction. Always include a clickable link or
button."** And separately, as one of ten numbered best practices: **"Some subscribers may open the
email on the same phone they would need to scan with... In email marketing, a QR code should support
the CTA, not replace it."** Every QR-code email, per the same source, should ALSO include: a
clickable button, a short URL or visible destination, alt text, and a plain-text fallback — QR is
additive, never the sole mechanism.

**Where the source says QR in email DOES work:** desktop-to-mobile handoffs (someone reads on a
laptop, scans to continue on their phone), in-store/offline redemptions, event check-in at a
different device than the one used to read the email, and app-download flows — i.e., exactly the
cases where the scanning device is NOT the reading device. An open-house invite read primarily on a
phone (the operator's own framing, and consistent with real-estate email being disproportionately
mobile-opened per general email-open-rate data already in this research area) is close to the worst
case for QR-in-email, not a good one.

**Corroboration from the real-estate side, both already-documented and freshly found this pass:** the
calling file's own §2c (Google Form + QR) and this section's §7a (qrwink.com's yard-sign QR) both
place real-estate QR use ON PHYSICAL, ON-SITE collateral — never inside the pre-event email itself.
**No source in either crawl4ai pass found a currently-published real-estate open-house EMAIL that
contains a QR code.** Two independent lines of evidence (a deliverability vendor's named mistake, and
the total absence of any real-estate email example using one) point the same direction without
either one being a controlled study.

### WHAT THIS MEANS FOR OUR BUTTON

**Build:** the RSVP CTA should be a single add-to-calendar link (or, per §4, a plain reply as the
even-lower-risk fallback) with the real property address filled into the event's location field. That
one button does the calendar save AND is the honest answer to "a map / a way to add address to
phone" — the address becomes tappable inside the recipient's own calendar app once saved, using the
phone's native maps integration, not a second widget this build has to construct. Whichever of Shape
1 (reply) vs Shape 3 (calendar link) the operator picks per §4's unresolved question, the location
field is what carries the address either way — it is not an alternative to §4's decision, it is one
more argument for making that field real regardless of which shape wins.

**Do NOT build:** a standalone static map image (technically possible — no email client renders live
maps, so it would have to be a screenshot or Static Maps API PNG — but no currently-published
real-estate open-house email was found using one, so it would be a novel element with no precedent
in this research); a dedicated vCard/add-to-contacts button (real mechanism, but every source found
for it is personal contact-sharing between two people, not an event-invite pattern — building it
would be inventing a use case, not following one); or a QR code inside the email (a named,
documented mistake for exactly the same-device reason the operator raised, corroborated by the total
absence of any real-estate email precedent using one — QR's real home in this domain is the yard
sign and the on-site sign-in sheet, both already covered in §2c and §7a).

**The trade-off, stated plainly and not resolved past what the evidence supports:** an add-to-
calendar link is more capable (it's the one candidate that can honestly satisfy "map" AND "add to
phone" at once) but it is also the shape §4 already flagged as carrying the most real rendering risk
across clients (Gmail blank boxes, Outlook hijacking, four-to-seven mobile steps for a raw .ics). A
bare reply link (Shape 1) is the lowest-risk, most-precedented option but does neither of the
operator's two asks — it hands the recipient nothing to save or navigate by, only a promise that a
human will follow up. Nothing crawled in either pass resolves that trade-off with a measured number;
it is the same unresolved shape-decision §4 already named, now with the added fact that picking
Shape 3 is also implicitly picking to build the map/address answer, and picking Shape 1 is implicitly
deferring it to the human reply.

---

## 8. OPERATOR DECIDED: CALENDAR. The verbatim link formats, crawled 08/12/2026.

Operator ruling this session: *"Calendar."* Plus: QR appears AFTER the click (on the landing page,
never in the email — consistent with §7c), the CLICK is the tracked event, and the landing page may
offer everything else. His question: *"how does it hook up with users calendar? Only if their email
is linked to calendar?"*

**Answer: there is no hook-up. No OAuth, no integration, no account link to us.** Two mechanisms,
both plain URLs or a file:

- **Web deep link** — opens the recipient's calendar provider in a browser with the event
  pre-filled; they are already signed in there; they press save. Nothing touches us.
- **`.ics` download** — the OS hands the file to whatever calendar app is default (Apple Calendar,
  desktop Outlook). No account involved at all.

So *"most people probably have all this hooked up, I just don't"* has no prerequisite to satisfy —
being signed into the provider in that browser, or owning any calendar app, is the whole requirement.

**Verbatim formats, crawled from `add-event-to-calendar-docs`
(github.com/InteractionDesignFoundation/add-event-to-calendar-docs, 459 stars, the de-facto
reference — Google's own docs cover only the v3 API, not the template URL):**

- **Google** — `https://calendar.google.com/calendar/render?action=TEMPLATE&text=<title>&dates=<YYYYMMDDTHHmmSSZ>/<YYYYMMDDTHHmmSSZ>&details=<desc>&location=<address>`
  (`action=TEMPLATE` required; alternate base `https://calendar.google.com/calendar/r/eventedit`
  does not need it). [services/google.md]
- **Outlook Live** — `https://outlook.live.com/calendar/deeplink/compose` ·
  **Office 365** — `https://outlook.office.com/calendar/deeplink/compose`. No official vendor
  documentation exists. [services/outlook-web.md]
- **Yahoo** — `https://calendar.yahoo.com/?v=60&TITLE=<title>&ST=<start>&ET=<end>&DESC=<desc>&in_loc=<address>`
  (`v=60` required). No official documentation. [services/yahoo.md]

**THE ADDRESS-IN-PHONE ANSWER IS THE LOCATION PARAMETER** — Google `location=`, Yahoo `in_loc=`,
`.ics` `LOCATION`. §7b already established that once the event is saved, calendar apps render that
field tappable straight into the phone's maps app. **That one field is the entire answer to both
"map" and "add address to phone" — no vCard, no static map image, no separate directions build.**

**NOT VERIFIED THIS SESSION — do not code from memory (RULE 0.4):**
1. The `.ics` / RFC 5545 `VEVENT` field spec was NOT crawled. Apple Calendar and desktop Outlook
   depend on it, and it is the one variant that is a FILE rather than a URL.
2. Only the Outlook deeplink BASE URL was read — its parameter names (subject/body/startdt/enddt/
   location) were not confirmed. Crawl `services/outlook-web.md` in full before writing them.

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

**crawl4ai, second pass (§7 — map / add-to-phone / QR-in-email), same date, 08/12/2026 (6 of 8 usable,
2 identified as AI-content-farm and excluded from evidence, cited in §7 as such rather than dropped
silently):**
11. caniemail.com/search/?s=iframe — authoritative, non-vendor, cited in §7a
12. usebouncer.com/qr-codes-in-email-marketing-best-practices-use-cases-and-mistakes-to-avoid/ —
    email-deliverability vendor (not a QR vendor), cited in §7c
13. flyn.to/blog/add-to-calendar-links-for-events — link-shortener/analytics vendor, cited in §7b
14. qrwink.com/qr-code-for-google-maps — QR vendor, cited in §7a and §7c
15. office.alibaba.com/officesoftware/how-to-embed-a-map-in-outlook-email — EXCLUDED, AI-content-farm
    (fabricated statistics, no real authority), see §7a
16. events-places.com/en/how-to-include-an-access-map-in-an-invitation/ — EXCLUDED, AI-content-farm
    (keyword-stuffed, unrelated related-posts), see §7a
- 2 DuckDuckGo HTML result pages (html.duckduckgo.com/html/?q=...) used for URL discovery only, not
  cited as evidence sources themselves — crawl4ai has no native search subcommand, so DDG's
  server-rendered results page was crawled the same as any other URL to find real articles to crawl.
