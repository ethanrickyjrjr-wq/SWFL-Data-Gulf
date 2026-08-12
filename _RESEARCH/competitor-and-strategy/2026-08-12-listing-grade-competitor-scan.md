# Listing-grade competitor scan — does anyone score/grade/audit a LISTING? (08/12/2026)

**Task:** Task 5 of `docs/handoff/2026-08-11-listing-grade-sonnet-work-queue.md`. Question: does any
product score, grade, or audit a LISTING itself — as opposed to scoring a homeowner's propensity to
sell (that market is already mapped in `_RESEARCH/competitor-and-strategy/2026-07-17-buyer-seller-agent-augmentation-landscape.md`,
read first, not redone here).

**Method:** crawl4ai only (`crawl4ai <url>`), per RULE 0.4. Google blocked crawl4ai with a CAPTCHA
wall (`www.google.com/sorry/...`, fetched 08/12/2026) so Bing (`www.bing.com/search?q=...`) and
DuckDuckGo HTML (`html.duckduckgo.com/html/?q=...`) were used as the search surface instead, then
every candidate product's own site was crawled directly. `_RESEARCH/INDEX.md` was grepped first for
`Restb|Lundy|listing.grade|listing.quality|listing.health|ShowingTime|Lone Wolf|compliance.scor` —
no prior file on this exact question, only the unrelated `2026-08-11-agent-site-listing-crawl-feasibility.md`.

**Stop condition:** eight products examined (met below) — search did not go fully dry, it was
stopped at the count per the task spec.

---

## Products examined

### 1. Restb.ai (restb.ai) — REAL, scores a listing's photos

**What it scores:** Property condition and quality from listing photos, via three named models —
**R1–R6** (proprietary condition/quality/potential blend), **C1–C6** (follows Fannie Mae's appraisal
condition-scoring methodology), **Q1–Q6** (follows Fannie Mae's quality methodology). Each returns an
overall score plus sub-scores for kitchen, bathrooms, interior, exterior, and a confidence score tied
to photo count/quality. Separately, its **Photo Compliance** product flags MLS-rule violations in
uploaded images/video — people/faces, contact info, "for sale" signposts, religious/political
objects, virtual staging, watermarks, duplicates — and a newer **Document Compliance** model scans
submitted PDFs for commission/compensation language.
**On what inputs:** listing photos (and PDFs for the document-compliance line) — no county records, no
market data, no listing copy analysis.
**Publishes a scale:** yes for condition/quality (C1–C6 / Q1–Q6 / R1–R6, an open published scale); the
photo-compliance product returns a pass/flag list, not a numeric grade.
**Price:** not public — gated behind "contact us" / a HubSpot demo-request form
(`restb.ai/company/pricing-2/`, fetched 08/12/2026).
**Who buys it:** MLSs, AVM/iBuyer/investor platforms, appraisal and inspection companies, property-search
portals, insurers — sold B2B/B2B2C, never directly to the listing agent or seller as a standalone
product. **Confirmed customer relevant to SWFL: Stellar MLS** (Lee + Collier's MLS) is quoted directly
on Restb.ai's site — Eben Moran, VP of MLS Services, Stellar MLS: *"Leveraging A.I. to automatically
review every image for photo violations is a natural step in our quest for perfect data."* Also a
case study: "SWMLS reduces violations by 49% with Computer Vision powered compliance solutions."
**Source:** `restb.ai`, `restb.ai/solutions/property-condition/`, `restb.ai/solutions/photo-compliance/`,
`restb.ai/customers/mls/`, `restb.ai/company/pricing-2/` — all fetched 08/12/2026.

### 2. Lundy, Inc. (getlundy.io) — NOT a listing-grader (negative finding)

The brief named "Lundy / Lundy Listing Score" as a thing to check. Searching `"Lundy Listing Score"`
on both Bing and DuckDuckGo returns nothing real-estate-related at all (only an unrelated child-rights
"Lundy Model" and an ENT sinusitis scoring system) — **no product by that name exists.** The actual
company, Lundy, Inc., builds **voice AI tools for MLSs and agents**: `nora` (an AI assistant launched
with MetroList, Northern California's largest MLS, 06/09/2026), **Navigator** (voice Q&A over an
MLS's own documents/vendor agreements), **Add/Edit** (voice-driven listing input/editing), **Site Mic**
(voice search embedded in a consumer portal), and **Finding Homes** (accessible, scenario-based voice
search for visually impaired buyers, co-built with Restb.ai per an October 2024 PR Newswire release).
None of these score, grade, or audit an individual listing — they create/search/answer-questions-about
listings. **Stellar MLS is also a Lundy partner** (its logo appears on the Lundy partners page), so
SWFL's MLS runs both Restb.ai (compliance/condition scoring) and Lundy (voice tools) side by side, but
neither product is a listing grade.
**Source:** `www.getlundy.io` and `www.getlundy.io` products page, fetched 08/12/2026; PR Newswire
"Top Real Estate AI Firms Restb.ai and Lundy Team Up..." (10/16/2024), title only, via Bing search
result 08/12/2026.

### 3. AuditListing.com — REAL, closest single-artifact match to buyer-facing county-vs-listing audit

Florida-only, pre-launch beta ("Florida Beta — Coming Soon," Palm Beach County shown in the demo). A
browser extension that **audits a live portal listing against county records** and surfaces the
mismatch as red flags: living-area square footage as listed vs. the county tax record (its demo shows
"Listing 2,400 vs Record 1,800 sq ft" flagged as a possible unpermitted addition), flood-zone risk with
an estimated insurance monthly cost, and ownership tenure (flagging a sub-12-month hold as possible
flip risk). It also **generates a buyer script** quoting the specific discrepancy to ask the seller
about before touring.
**On what inputs:** the live listing page + county tax/assessor records + flood-zone data + deed/tenure
history. No live market-behavior signal (DOM, price-cut cadence, comps) and no copy/description
critique.
**Publishes a scale:** no numeric grade — a red-flag count ("3 Red Flags") per property, not a score.
**Price:** $49 for "10 Core Audits" over 90 days (flood/permits/assessments included); the site says
"deep-dive" municipal data (permits/liens) is marked up 40% over cost when the user opts to go
deeper.
**Who buys it:** framed at signup as either "Homebuyer" or "Loan Officer" — buyer-side, not agent- or
seller-side, and explicitly NOT a listing-quality tool for the listing agent.
**Source:** `www.auditlisting.com`, fetched 08/12/2026. Tagline: "AuditListing — The Carfax for
Property Listings."

### 4. Inoveo3D Listing Analyzer (inoveo3d.com/en/tools/listing-analyzer) — REAL, publishes a scale, but a different market

**What it scores:** an "LQS/AQS" (Listing Quality Score / Ad Quality Score) on six axes — title
quality, writing quality (structure/spelling/persuasion), information completeness (price, area,
energy rating, etc.), legal compliance (mandatory disclosures: energy ratings, natural-risk notices,
fees), photo quality (an HDR technical pass on resolution/brightness/framing/sharpness/clutter per
photo), plus prioritized recommendations.
**On what inputs:** a pasted listing URL — text + photos from the listing page itself. No county
records, no market-behavior data.
**Publishes a scale:** yes, explicitly — **letter grades E (critical) through A (excellent)**, per its
own FAQ: "A score of B or higher indicates a well-optimized listing."
**Price:** free, no signup, no credit card, results in 2–10 minutes ("+1,000 listings audited").
**Who buys it:** listing agents (pre-mandate-meeting pitch tool, "present the report to demonstrate
your expertise"), agency directors (team QC), independent agents (pre-publish self-check). **Not a
U.S. product** — its supported platforms are Leboncoin and SeLoger, French portals; it explicitly
compares itself to "Zillow" only as a category reference in its marketing copy, not as a supported
source.
**Source:** `www.inoveo3d.com/en/tools/listing-analyzer`, fetched 08/12/2026.

### 5. Listing Oracle (listingoracle.com) — REAL, closest combination of county records + comps in one branded report

By-invitation pilot, white-labeled property-research generator for agents. Of its seven report types,
the **Pre-Listing Audit** is the direct match: "Clean up record, permit, flood & title risks before
you list," covering open/unpermitted-work review, deed-chain/title-flag scan, flood-zone
determination, and an assessor-record discrepancy check. Its **Renovation ROI Analyzer** and
**Fixer-Comp Analyst** report types add comparable-sale-based market data (room-by-room ROI priced
against nearby sales; comp pulls with fixer-vs-updated flags) — so across its report *suite*, Listing
Oracle is the only product found here that pairs public-record facts with live comp/market data in
one branded deliverable. Its **Buyer Research Report** does the same combination from the buyer side
(deed/permit/flood history plus a green/yellow/red risk read).
**On what inputs:** assessor data, registry of deeds, permit history, FEMA flood maps, and comparable
sales — sourced from "primary public records," per its own claim, with "every claim... cited to its
public-record source." No listing-copy/description critique in any of the seven report types.
**Publishes a scale:** no numeric score — narrative, source-cited plain-English reports, not a grade.
**Price:** not public — "By invitation during our pilot," demo-request gated.
**Who buys it:** real-estate agents/brokers, white-labeled under the agent's own name/brand — explicitly
"No Listing Oracle branding visible to your clients."
**Source:** `listingoracle.com`, fetched 08/12/2026.

### 6. Zillow — two adjacent things, neither is a listing grade

**Listings Quality Policy** (`zillow.com/corporate/quality/`, "Updated September 2024," fetched
08/12/2026) is a **compliance rulebook**, not a scoring product — it governs who may advertise a
listing, prohibits self-promotion in photos/descriptions, bans buyer-agent-compensation display,
requires complete addresses and daily-updated feeds, and reserves Zillow's right to remove
non-compliant listings. It grades nothing; it is pass/fail enforcement against terms of use.
**Listing Performance Insights** (Showcase-exclusive feature, launched via press release
04/15/2025, `zillow.mediaroom.com`) is an **engagement-analytics dashboard** for agents/sellers —
views, saves, and how a listing compares to similar nearby listings — sold as part of the paid
Showcase product. It tracks live market *attention* on the listing, not the listing's own quality,
and carries no county-record or copy-critique layer.
**Source:** `www.zillow.com/corporate/quality/` and `zillow.mediaroom.com/2025-04-15-...`, both
fetched 08/12/2026.

### 7. Stellar MLS (our own MLS, covering Lee + Collier) — rules-based compliance, no public numeric score

A Bing AI-summarized search directly on `"Stellar MLS" listing quality compliance scoring` (sourced
from `stellarmls.com`, `rules.stellarmls.com`, and `docs.stellarmls.com/Compliance101_Handout.pdf`,
fetched 08/12/2026) states plainly: **"Stellar MLS does not publicly disclose a numeric 'listing
quality compliance score'"** — compliance is enforced through mandatory forms (Data Entry form,
Housing for Older Persons Affidavit, seller-indemnification statements), required biennial compliance
training, correct-property-type rules (e.g., multi-family income properties must be entered under
"Income Property," not "Residential"), and broker-level monitoring with fines/corrective action for
violations — not a per-listing grade. This directly answers the "MLS listing-quality score" arm of
the task for the one MLS that actually covers our market: **no such score exists here.** (Restb.ai's
photo-compliance product, item 1 above, is layered on top of Stellar MLS separately and is the closest
thing to automated per-listing scoring Stellar runs.)

### 8. ShowingTime (showingtime.com) and Lone Wolf — activity tracking, not quality scoring; no listing-grade product found for either

ShowingTime's **Listing Activity Report** (`showingtimemls.uservoice.com`, `zillow.help` — ShowingTime
was acquired into Zillow Group) is a **showing/feedback/appointment log per listing** — number of
showings, buyer-agent feedback text, appointment history — not a quality audit or grade; it measures
what happened around the listing, not what's wrong with it. A combined Bing search for ShowingTime OR
Lone Wolf plus "listing audit"/"listing score"/"listing grade" returned only ShowingTime's own
activity-report documentation and nothing at all under Lone Wolf's name — **no listing-grade or
listing-audit product was found under either brand.** Lone Wolf's own product surface (transaction
management, back-office, CRM) was not further crawled once the search returned nothing to chase; this
is a search-went-dry result for that one name, not a confirmed absence claim about their full product
line.
**Source:** Bing search results for ShowingTime/Lone Wolf, fetched 08/12/2026; `showingtimemls.uservoice.com`
listing-activity-report article title, fetched via the same search pass.

---

## Does anyone combine county-record facts + live market behavior + copy critique in a single artifact?

**No single product found does all three at once.** The eight products split cleanly into two facts
+ zero-copy or copy + zero-facts, never all three: **AuditListing.com** combines county-record facts
(assessor square footage, flood zone, deed/tenure) with a buyer-facing red-flag read, but has no live
market-behavior layer (no DOM, no price-cut cadence, no comps) and no listing-copy critique — it never
reads the description at all. **Listing Oracle** comes closest to two of the three, pairing
public-record facts (deed, permits, flood, assessor) with live comparable-sale/market data across its
report suite (the Pre-Listing Audit plus Renovation ROI Analyzer/Fixer-Comp Analyst), but it too skips
copy critique entirely — its reports are records-and-comps, not remarks-quality feedback. On the other
side, **Inoveo3D** and **Restb.ai** do the copy/photo-quality half — writing quality, title, legal
disclosures, photo technical scoring — with zero county-record or market-behavior input; they never
touch the assessor roll or a comp set. **Zillow's** two relevant surfaces split the same way: its
Quality Policy is compliance-only and its Listing Performance dashboard is market-attention-only, with
no records and no copy read in either. Restb.ai's condition/quality scores and Stellar MLS's
rules-based compliance (items 1 and 7) both stay inside the photo/rules lane and never touch county
records, live comps, or copy. The specific combination — pull the county record, read what the market
is actually doing right now, and critique what the listing itself says — was not found assembled in
one artifact anywhere in this pass.
