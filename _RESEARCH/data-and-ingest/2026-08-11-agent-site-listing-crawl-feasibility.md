# Agent-site listing crawl — feasibility + field census (Q1 of the listing-grade brief)

**Date:** 08/11/2026 · **Method:** crawl4ai (pinned CLI), live, no Firecrawl · **Rule:** RULE 0.4
**Brief this answers:** `docs/handoff/2026-08-11-listing-grade-crawl4ai-research-brief.md` Q1 —
*"What does an agent's own website actually expose, and can we parse it?"*
**Verdict: PARSEABLE. Server-rendered, robots-clean, and the field set is richer than the paid
per-house record we currently buy.**

## Site crawled

`www.johnrwood.com` — John R Wood Properties / Christie's International, the largest SWFL brokerage,
already used as the live fixture in the 07/10/2026 outreach brand-injection work. Pages fetched
08/11/2026: homepage, `/our-listings/`, and one detail page,
`/listing/226028911/425-wildwood-lane-naples-fl-34105/`.

## 1. Rendering — server-side, no JS needed

Plain crawl4ai markdown returned full listing content on every page. **No headless rendering, no
IDX iframe, no API hydration.** The index page yields listing cards with photo, price, city,
community, address, beds, baths, sqft in the markdown itself.

## 2. URL pattern — stable, and the MLS number is IN the URL

`https://www.johnrwood.com/listing/{mls_number}/{address-slug}/`

Example: `/listing/226028911/425-wildwood-lane-naples-fl-34105/`. The MLS number is the first path
segment — **a direct join key to our own listing spine's `mls_number` column**, no address-key
fuzzing required. The address slug is a second, redundant key.

## 3. robots.txt — the listing pages are ALLOWED

Fetched live. For `User-agent: *` the disallows are: `/complete/*`, all favorite/search-management
paths, `/realestate/browse/*`, `/realestate/regions/*`, `/realestate/searches/*`, `/listings/count/*`,
`/user/*`, `/wp-content/*`, `/properties/zillow/*`, `/mlsphotos/*`, `/retsphotos/*`,
`/article/archive/*`, `/WebHandlers/*`. **Neither `/listings/` nor `/our-listings/` nor `/listing/*`
is disallowed.** Named crawl-delay 10 for rogerbot/dotbot/Slurp/bingbot/meta agents; MJ12bot fully
blocked. Photos served from a CloudFront `/img/` path, not the disallowed `/mlsphotos/`.
**Per-site robots must still be re-checked for every new site — this result is site-specific.**

## 4. FIELD CENSUS — one free page, one call

Everything below came off the single detail page, verbatim:

**Identity / location:** MLS number (Gulf Coast 226028911) · full street address · city · state · ZIP
34145-class · **Subdivision: Bears Paw** · **Neighborhood: BEARS PAW** · county link.

**Structure:** Property SubType **Condominium** · Square Feet 2,230 · Building Area Total 2,310 ·
**Year Built 1981** · **Roof: Built-Up, Flat** · Building Construction: Block, Concrete, Stucco ·
Bedrooms 3 · Bathrooms 3 (Full 2, Half 1) · Flooring · Laundry · Cooling · Heating · Carport
Spaces · Sewer · full Appliances list.

**Lot / view:** Lot Description **On Golf Course, Cul-De-Sac, Dead End** · Property View **Golf
Course, Lake** · Patio/Porch (Balcony, Glass Enclosed, Porch).

**Community:** Community Features (Boat Facilities, Elevator, Golf, Gated, Tennis, Street Lights) ·
**Association Fee INCLUDES** — 14 named items (management, golf, insurance, internet, irrigation,
grounds, pest, recreation, reserve fund, sewer, street lights, security, trash, water) ·
Amenities — 17 named · Other Amenities (Pool, Golf, Tennis, Lakefront, Waterfront, Water View) ·
Parking Features incl. **Golf Cart Garage** · Pets policy.

**Money / market:** List Price $799,000 · **Taxes $5,040** · **"1 Day on Market"** rendered on page.

**Schools:** Elementary, Junior High, High School — all named.

**Attribution:** listing agent name + brokerage + direct phone · MLS attribution line with an
as-of date ("Based on information submitted to Gulf Coast as of August 11, 2026") · the standard
not-verified disclaimer.

**Remarks:** ~2,400 characters of full MLS description prose.

**Media:** hero + gallery photo URLs (CloudFront webp) · a Zillow-hosted 3D tour link.

## 5. Why this matters more than it looks

- **It closes the subdivision/community gap.** Our listing spine carries subdivision on 298 of
  36,137 rows (0.8%, measured live 08/11/2026) and 0 in 33909. This page names both Subdivision and
  Neighborhood, plus "On Golf Course" as a lot description and a full amenity list. **Golf-community-
  to-golf-community comp matching is answerable from the agent's own page, free, no vendor call.**
  This is a cheaper path than the `/neighborhood-amenities` polygon lane for the specific case of a
  listing an agent hands us — the polygon lane still wins for arbitrary addresses we weren't given.
- **It closes the remarks gap for crawled listings.** Our spine has no description column and the
  paid record covers ~26 rows. Free, full prose here.
- **Roof: TYPE, not age** — but "Built-Up, Flat" on a 1981 building is itself a Florida insurability
  signal. Roof AGE still needs the permit lane (check our own Lee/Collier permit data first).
- **HOA: inclusions yes, FEE AMOUNT no.** Consistent with the 08/03/2026 finding that HOA fees are
  absent vendor-wide; the paid per-house record does carry `hoa_fee`, so that stays the fill lane.
- **Renovation recency lives in the prose, not a field.** This listing's remarks say "The air
  conditioner, compressor, and air handler were replaced in 2026" — exactly the variable class the
  operator named (new kitchen / roof / systems). It is extractable from text, and must be labeled
  **agent-stated**, never county-verified.
- **Property SubType is real here (Condominium)** — our spine's type field collapses condos into
  single-family region-wide (known open gap). The agent page carries the honest subtype.

## 5b. SITE 2 — royalshellrealestate.com (different stack) — PARSEABLE, but only with a real browser

**Stack:** ASP.NET (`/dashboard/Access.aspx`), assets on `cdn-cws.datafloat.com` — a different
platform from site 1.

**THE FINDING THAT MATTERS: plain HTTP clients are WAF-blocked; crawl4ai's real browser is not.**
`curl` against the homepage and against `/robots.txt` returned **HTTP 403 with an F5/Imperva-style
"Request Rejected … support ID" body**. The identical URL through crawl4ai (Playwright chromium)
returned full page content. **Operational rule: use crawl4ai for every fetch on agent sites; a raw
`curl` 403 is NOT evidence a site is blocked, and treating it as such would have wrongly written
this brokerage off.** Corollary: robots.txt could not be read by curl here — read it through the
browser path before crawling any new site, and do not assume absence of a robots file.

**URL pattern:** `/{property-type}/swl/{mls_number}/{address-slug}` — e.g.
`/single-family/swl/226003650/1975-galleon-drive-naples-fl-34102`. **MLS number is again a path
segment** (same join key as site 1), and this platform additionally puts the **property type in the
path** (`single-family` vs `condo-townhouse`), which is a free, honest subtype signal — the field our
own spine collapses.

**Community pages render listing cards** (price/bed/bath/sqft markers present in the markdown), so
the index → detail crawl walk works the same as site 1.

**Not yet done on site 2:** a detail-page field census. Site 1's census (§4) must NOT be assumed to
transfer — different platform, different field template.

## 6. What this does NOT establish

- **One site, one platform.** This is a large brokerage on a custom/vendor stack rendering
  server-side. It says nothing about kvCore/BoldTrail, Sierra Interactive, BoomTown, Real Geeks,
  Luxury Presence, or WordPress + IDX Broker. **Those still need the same three-page test each, with
  a parseable / needs-rendering / blocked verdict.**
- **Terms of service were not read** — only robots.txt. The ToS question stays open per the brief.
- **No claim about sold listings.** Only active pages were fetched.
- **Redistribution is a separate question from retrieval.** The MLS attribution line and the
  not-verified disclaimer travel with the data; any surface we build has to carry the same
  attribution and must not restate the brokerage's data as our own verified fact. Reading it to
  reason about price is not the same as republishing the listing.

## 7. Recommended next crawls (same question, other platforms)

Three pages each — homepage, listing index, one detail page — plus robots.txt, for: kvCore/BoldTrail,
Sierra Interactive, Real Geeks, Luxury Presence, and one WordPress + IDX Broker SWFL agent site.
Deliverable per site: rendering verdict, URL pattern, robots verdict, and which of the fields in §4
survive. That is the full answer to Q1; this file is one of six.
