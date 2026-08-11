# Research — Real-estate listing marketing lifecycle (for the "New Listing" project feature)

Date: 07/01/2026. Method: source discovery via web search, then verbatim fetch via **crawl4ai** (RULE 0.4 —
no Firecrawl). Raw captures kept in the session scratchpad (`life_*.md`); this file is the synthesis.
Fetched live: theclose.com (79KB), evocalize.com coming-soon (42KB), placester.com drip guide (46KB); two
Luxury Presence pages returned an empty JS shell even with a networkidle wait (noted, not relied on).

## The point (why the operator's instinct is right)

The listing marketing lifecycle is a **known, standardized stage sequence**, and the winning pattern is
**trigger-based, not one-big-push** — exactly the operator's "we don't make them all at once because a house
could sell in a day, but the gameplan is set up." Verbatim: *"agents who win aren't doing one big push —
they're showing up every week with social media posts at every stage including Just Listed, Week 2 Promotion,
Open House, Price Update, Under Contract, and Sold"* (search synthesis of the seller-side listing-marketing
sources below). So a "New Listing" project should pre-lay the stage gameplan and generate each stage's
deliverable on demand when the real event happens — not batch-produce them up front.

## The stage sequence (the lifecycle to model)

1. **Coming Soon** — pre-MLS window (typically 1–3 weeks): tease the property, capture early buyer leads.
   *"the strategic use of the pre-MLS window … to generate buyer interest and capture leads before a property
   goes active"* (evocalize). Optional first stage (some listings skip it).
2. **Just Listed** — maximum-visibility push across all channels the day it goes active: just-listed email
   blast to the database + past clients (key details, photo slideshow, link to the listing), plus social
   carousel posts.
3. **Open House** — drive foot traffic + urgency; then *"follow up with open house attendees soon after …
   thank them, solicit feedback, and address questions"* (theclose).
4. **Week-2 / Still-Available promotion** — a re-touch keeping the listing in front of the market.
5. **Price Improvement / Reduction** — *"re-engage buyers who previously passed"* — triggered by a real price
   change.
6. **Under Contract / Pending** — status update; the tone shifts from marketing to transaction/social-proof.
7. **Just Sold** — *"social proof for the next listing conversation"*; a just-sold email + social post, and a
   comps/market angle for the seller's sphere.

Cross-cutting: a **Comps / market-update** deliverable can attach at several stages (pricing strategy at
list, re-justification at a price change, and the sold recap). **Social rides every stage** (Instagram /
Facebook / TikTok cross-post per the sources).

## Cadence / drip mechanics (how stages fire)

- **Trigger, then space.** A common cadence: *"Email 1 immediately after the trigger, Email 2 three days
  later … Email 3 three days after that"* (placester/Luxury-Presence synthesis). Stages are event-triggered
  (goes active, price cut, pending, sold), not calendar-locked.
- **Message goal per stage is distinct** — *"a three-to-five email sequence with a distinct goal for each"*
  (intro/value → deeper market insight → urgency + CTA). Maps onto our per-stage deliverable idea.
- **Deal-in-motion emails become transactional** — once under contract, content shifts to timeline/updates,
  not marketing.
- Reported lift (one Luxury Presence case, 2025): Email 1 31% open, the **listing-comparison** Email 2 43%
  click-through, 0 unsubscribes, +43% buyer engagement — i.e. the comps/compare email is the high-engagement
  one, which supports making a first-class "comps email" stage.

## What this means for our build (ties to the code map)

- Model a **listing project** with a saved **subject address** + a **stage cursor**; pre-lay the stage
  gameplan (Coming Soon? · Just Listed · Comps · Open House · Price Update · Pending · Just Sold) but
  **generate each stage's email/PDF on demand** ("build comps email" / "build sold email" buttons), grounded
  in real data — never batch-generate.
- The **just-sold email** and the **comps email** are first-class grounded deliverables (the sold builder is
  the current gap; comps + listing flyer already exist).
- **Social per stage** attaches to the same trigger.
- Everything stays four-lane / no-invention: every number in every stage email is real (our lake / the
  listing page / a figure the user gives), cited "SWFL Data Gulf" per the 07/01 naming decree.

## Sources (discovery via web search, content fetched via crawl4ai)

- https://theclose.com/real-estate-listing-marketing-plan/ — the seller-side listing marketing plan
  (understand property → data-driven pricing → prep → visual assets → list & post everywhere → open houses →
  digital → neighborhood → sphere). Fetched via crawl4ai (79KB).
- https://evocalize.com/blog/coming-soon-listing-marketing/ — the Coming-Soon pre-MLS stage. crawl4ai (42KB).
- https://placester.com/real-estate-marketing-academy/perfect-drip-real-estate-email-marketing — drip
  mechanics + campaign types (intro / nurture / promotional / referral). crawl4ai (46KB).
- Web-search syntheses (discovery): luxurypresence.com real-estate-email-marketing + email-templates,
  constantcontact.com, dmrmedia.org listing-marketing-plan, launchlisting.com — for the stage list + cadence
  + the Luxury Presence case-study numbers. (Luxury Presence pages did not yield to crawl4ai; treated as
  secondary.)
