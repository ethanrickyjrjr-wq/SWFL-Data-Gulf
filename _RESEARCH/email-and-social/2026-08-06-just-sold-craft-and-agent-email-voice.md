# Just Sold craft + how an agent email should SPEAK — crawl4ai pass, 08/06/2026

**Why this exists.** Operator, on the first rendered Just Sold: *"this is the worst just sold email
I have ever seen"* and *"make JUST SOLD stand out more somewhere on the photo or something!!!!!!"*
The build that preceded it proved the SOURCING was correct (8/8 assertions, the prefill never leaks
into a derived cell) and never once asked whether the artifact was any good. **An acceptance run
measures truth. Nothing in it measures worth.** This pass is the missing half.

**Method:** crawl4ai (RULE 0.4), five URLs fetched live this session; three were operator-handed,
two I picked. **4 of 5 returned usable content — reallygoodemails.com/categories/real-estate came
back 4KB of shell (JS-rendered gallery, no email bodies).** Recorded as fetched-and-empty, not as a
finding.

Companions, read them first, this file is the delta:
`2026-08-03-strongest-real-estate-email-concepts-structure.md` (5-part skeleton, subject taxonomy,
render constraints) · `2026-08-03-email-length-and-per-type-benchmarks.md` (50–125 words, per-type
rates) · `2026-08-05-under-contract-email-purpose-and-design.md` (the status-rider / Rule-of-7
argument, Coffee & Contracts' CTA formula — all of it applies to Just Sold too).

---

## 1. THE HEADLINE FINDING — we built the wrong email for the right data

Every source agrees on one thing, and our build got it backwards.

**A Just Sold email is not an announcement about a house. It is a message to the NEIGHBOURS about
THEIR house.** LeadSites' just-sold template subject is *"Sold on [Street Name] — and what it could
mean for your home"*; its separate "neighbor farming" template opens *"I wanted to personally reach
out because a home near you — [Address] — just sold, and the result may be relevant to your own
plans."* HousingWire's just-sold prospecting letter opens *"Great news – your neighborhood is hot!
Your neighbors at [address] just sold their property for [sale price]."* The Close's postcard
teardown names the single highest-performing line on the whole page as *"your equity has changed"* —
*"Any homeowner who sees the phrase … will likely pay more attention (hello, money!)."*

Ours renders: a photo, a price, beds/baths/sqft, and a paragraph about the house. **The reader is
never in it.** That is the defect the operator saw and it is a copy/structure defect, not a data one.

The Close states the rule directly, as a Use-This/Not-This table:

- "Profit from your home!" beats "We know how to sell your home!" — *"Always keep the focus on the
  homeowner. By inviting them to profit from their home, you make the seller the hero of the story."*
- "Call us today!" beats "Let us know if you're interested!" — *"Be direct, not vague. 'Let us know'
  is passive."*
- "Get your free home valuation today!" beats "We can tell you how much your home is worth!" —
  *"conveys what the homeowner will receive rather than what you can do."*

**HERO = THE READER, NEVER THE AGENT AND NEVER THE HOUSE.** That is the one sentence to carry.

---

## 2. WHAT A JUST SOLD EMAIL IS SUPPOSED TO CONTAIN

Merged from LeadSites (template 3 + template 5) and HousingWire (letter 1). Where they agree, it is
listed once; where we cannot source a field, that is called out.

1. **The address that sold** — every source leads with it. We have it. ✅
2. **The sold price.** ✅ (our prefill ladder — decree 08/06/2026)
3. **The LIST price alongside it.** HousingWire's letter states both: *"sold their property for
   [sale price]. It was listed at $[list price]."* We hold both and currently show the pair ONLY
   with a recorded close (the pairing rule). Correct as built.
4. **Days on market.** LeadSites prints `Sold price: $X | Days on market: X` as the data block.
   ⚠️ **We deliberately ban this on a sold email** — `days_in_state` is days-in-ACTIVE and a sold
   house's clock is not a completed interval. To ship it honestly we need list-date → sale-date,
   which we have only when we hold a RECORDED sale. Buildable, gated on the recorded rung.
5. **Number of offers.** HousingWire: *"If there were multiple offers, you may also want to include
   how many were received … we had [number] offers, which means there are still qualified buyers."*
   ❌ **We do not hold this and never will from a feed.** It is a lane-4 fact — the agent types it.
6. **What it means for the reader's own home** — the equity hook. ⚠️ Not built.
7. **ONE CTA: the free valuation.** ✅ Our button is already "What's My Home Worth?" — which every
   source names as the correct ask for this email.
8. **A photo of the property.** ✅ when we hold one.

**HousingWire's photo-rights caution, worth a guard:** if the agent did not list the property they
must not use the listing agent's photos — *"take your own photo of the property from the street …
you must get explicit permission to use their photos."* Our hero photo comes from the listing feed.
An agent sending a Just Sold for a house they did not represent is a real, common case (LeadSites
FAQ says yes, do send those). **That is a legal exposure we currently have no gate for.**

---

## 3. HOW IT SHOULD SPEAK — the voice card

Every rule here is from a crawled source, not taste.

- **Focus on the homeowner, not on us.** (The Close, above.) Say what THEY get.
- **Be direct, never vague.** "Call or text me" beats "let us know if you're interested."
- **Short.** LeadSites: *"Most agents over-write these emails … Aim for something a reader can
  absorb in under 30 seconds."* Consistent with our own 50–125-word band.
- **Clear, not clever.** Propphy: *"The subject line should promise a specific, real benefit that
  the body of the email actually delivers."*
- **Answer "why should I care?" above the fold.** Propphy: *"Here's what your home might be worth
  now," not "Hope you're well."*
- **Concrete value, not motivation.** Propphy: *"market updates, listing alerts, pricing insight,
  financing clarity — not fluffy motivation quotes."*
- **Sell the reply/click, not the house.** Propphy: *"Think 'sell the reply/click,' not 'sell the
  house' inside the email."*
- **One CTA. Always one.** Propphy: *"When we've tried to cram multiple CTAs into one message,
  performance drops across the board."* We already enforce this.
- **Plain beats branded.** LeadSites: *"Plain-text or minimally designed emails often outperform
  heavily branded templates in real estate. A short, personal-sounding message from a recognizable
  name tends to feel less like marketing and more like a note from a trusted advisor."*
  ⚠️ This CONFLICTS with our heavily-designed chrome. Unresolved — do not resolve it by assertion.
  The honest read: our differentiator is sourced local data, which needs structure to be legible;
  the counter-evidence says structure itself costs response. **A/B testable, not knowable from here.**
- **No pressure.** LeadSites closes its just-sold template with *"No pressure — just good
  information to have."* HousingWire: *"Provide real value without being pushy."*
- **Never a bracketed placeholder.** Propphy: *"Never send a bracketed placeholder as-is."* We are
  already strict here (open slots ship empty, never "TBD").

### Subject lines (this email specifically)
- LeadSites: *"Sold on [Street Name] — and what it could mean for your home"*, *"Sold in 6 days over
  asking — here's what that means for your street"*, *"Just sold on Maple Ave (and your home is
  next?)"*. All lead with the STREET and pivot to the reader.
- Length: LeadSites says **under 50 characters**; Luxury Presence says **40 or fewer**; our existing
  research says **30–40 for an open, 3–4 words for a reply**. Three sources, one band — use 30–40.
- LeadSites: use the neighbourhood name; avoid spam triggers; test two angles (urgency vs curiosity).

---

## 4. THE VISUAL ARGUMENT — why the ribbon had to get louder

The Close's teardown of 13 real just-sold postcards, which is the printed version of this exact
piece:

- *"Use dramatic colors like red, yellow, and orange to draw the reader's eye."*
- Design #5, "Bold & Bright": *"uses bright brand colors and large, bold text to grab readers'
  attention … the format makes it easy to see the property, the list price, and contact information."*
- Design #6, "Short & Huge Texts": *"does not include any property photographs; instead, it draws
  attention with a short sentence in huge print. It works effectively as a real estate farming
  postcard since homeowners are typically intrigued by their neighbors' homes."* The card reads
  *"I came, I saw, I sold your neighbor's house."*
- Counterweight, same page: *"The most compelling designs are simple … less is often more."* Big
  type and few elements are the same finding, not opposing ones.
- Design #4 highlights a client win in a bright panel — *"Sold Seller Saved $14,000"* — plus a
  client testimonial. Social proof is a design element, not just copy.

**What shipped from this — CORRECTED THE SAME DAY, hours after this file was first written. The
original text is struck below because a stale record is worse than no record.**

**❌ FIRST ANSWER, REVERTED: `HeroProps.ribbonLoud`** — the campaign ribbon walked one step up the
type ladder (caption 14 → h2 28, display weight, deeper band). Operator killed it on sight:
*"don't change the just sold bar so it's different from every other email."* He is right and the
error is a category error, not a taste one — **the ribbon is the one element whose entire job is
being IDENTICAL across all seven lifecycle emails** (`lib/email/lifecycle-chrome.ts`: seven emails
that looked like seven different companies). Making one louder solves a per-email problem by
breaking a campaign-level guarantee. The mechanism was removed from all four files it touched.
**Standing rule: the variation goes in the email's OWN elements, never in the shared chrome.**

**❌ NEVER TRIED, AND STILL THE RIGHT CALL TO SKIP: `ImageProps.overlayTitle`.** It exists and would
put the word literally on the picture, but it renders the photo as a CSS `background-image` and
**Outlook desktop drops background images entirely** — those recipients would get a coloured panel
where the house should be. Absolute positioning is not available in email either. Losing the photo
to gain a word is a bad trade on the one email whose photo is the win.

**✅ WHAT ACTUALLY SHIPPED: the badge is composited INTO the JPEG** — `lib/media/photo-badge.ts`, a
diagonal corner ribbon in the agent's accent colour. sharp cover-crops the vendor photo 3:2, resvg
composites the badge, sharp re-encodes, `hostEmailMedia` uploads. **Every client renders it because
it IS the image.** It invented no machinery: `lib/social/listing-card-render.ts` already ran this
exact pipeline for social cards, and both libraries were already production dependencies. Any
failure ships the ORIGINAL photo — a badge is never worth a missing house. Verified live: the URL
the email points at returns HTTP 200, `image/jpeg`, 144,856 bytes.

---

## 5. NUMBERS WORTH KEEPING (and one that is not)

- Luxury Presence: **open rate is no longer a reliable metric** — Apple MPP pre-loads tracking
  pixels. *"Prioritize click-through rate and conversion tracking instead."* Targets they give:
  **CTR 2–5% is strong**, unsubscribe **over 0.5% on a single send** means it's wrong, bounce
  **under 2%**. This is the third independent source telling us not to promise an open rate.
- Luxury Presence case study (their own, so weight it accordingly): a 3-email buyer sequence —
  31% open on #1, 43% CTR on #2, *"43% boost in buyer engagement with zero unsubscribes."*
- Propphy: *"aim for 30–50% open for SOI and past clients"* — a SPHERE list, not a cold one, which
  is exactly the Just Sold audience.
- LeadSites send timing: **mid-morning Tue–Thu**; avoid Monday morning and Friday afternoon; send a
  just-listed within **24 hours**; more than 2–3 emails/week to the same contact raises unsubs.
  (Our own benchmarks file already found send-day is a weak lever — treat as directional.)
- ❌ **Do not repeat LeadSites' "65% increase in lead volume" or "$450/month saved."** Those are
  their own marketing claims for their own product, with no methodology.

---

## 6. NEW EMAIL IDEAS THIS PASS SURFACED

Filed into the playbook's backlog. Each names the lane its data comes from.

1. **The neighbour-farming variant of Just Sold** — same event, different recipient list, reader-first
   copy. Both LeadSites and HousingWire ship it as a SEPARATE template from the sphere version.
2. **"Your future competition just went live"** (Propphy #10) — a NEW LISTING near a known future
   seller, framed as competitive intel for them. *"Buyers will compare your home directly to this
   one."* We hold new listings and can define "near". Strongest new idea on the page.
3. **Neighbourhood listing alerts / "before Zillow"** (Propphy #9) — the standing subscription
   framing, and it is close to what our lake already is.
4. **Deal of the Week** (Propphy #8) — *"[CITY] Deal of the Week – Best value under [PRICE]"* with a
   "why it's a deal" line. ⚠️ Needs a real comparative claim, which is exactly the class our claim
   gate blocks unless code computes it. Buildable only off a computed comp set.
5. **Home-iversary / closing anniversary** (Propphy #7) — past-client nurture, purely a date trigger.
6. **Review/testimonial request** (Propphy #6, LeadSites post-closing) — 7–14 days after closing.
7. **Renter conversion, expired listing, FSBO, off-market "golden letter", investor solicitation,
   neighbourhood-agent introduction, open-house preview** (HousingWire 3–10) — seven prospecting
   letter types we have no email for at all.
8. **SMS as a paired channel.** LeadSites pairs every email with a text 30–60 minutes later and
   gives templates for both. ❌ **Not a build — a compliance wall.** TCPA needs explicit WRITTEN
   consent, 10DLC registration, quiet hours, STOP handling. Recorded so nobody proposes it casually.

---

## Sources (all crawl4ai, live, 08/06/2026)

1. `leadsites.com/just-listed-just-sold-emails/` — operator-handed. 5 templates (just-listed email,
   just-listed SMS, just-sold email, just-sold SMS, neighbour-farming email), drip tables, segments.
2. `propphy.com/blog/high-converting-real-estate-email-templates-2026` — operator-handed. 12
   templates with full copy, plus the best-practice section quoted in §3.
3. `housingwire.com/articles/real-estate-prospecting-letter-templates/` — operator-handed. 10
   prospecting letter templates incl. just-sold and just-listed, plus the photo-rights caution.
4. `theclose.com/just-sold-postcards/` — mine. 13 postcard teardowns; the visual argument in §4 and
   the Use-This/Not-This voice table in §1.
5. `luxurypresence.com/blogs/real-estate-email-marketing/` — mine. MPP/open-rate reliability, the
   CTR/unsub/bounce targets, segmentation.
6. `reallygoodemails.com/categories/real-estate` — mine. **Fetched, returned 4KB of shell, no
   content.** JS-rendered gallery. Not a finding either way.
