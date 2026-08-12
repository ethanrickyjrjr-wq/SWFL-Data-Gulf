# Agent-site listing crawl — Real Geeks

**Date:** 08/12/2026 · **Method:** crawl4ai (pinned CLI), live, no Firecrawl · **Rule:** RULE 0.4
**Task:** Task 3 of `docs/handoff/2026-08-11-listing-grade-sonnet-work-queue.md` (TASK 1–4, platform =
Real Geeks) · **Template followed:**
`_RESEARCH/data-and-ingest/2026-08-11-agent-site-listing-crawl-feasibility.md`

**Verdict: PARSEABLE.** Server-rendered, robots-clean on the listing paths, full field census
recovered from a single detail-page fetch through crawl4ai.

## Site tested

`www.swflregroup.com` — Southwest Florida REGroup (Naples), a small SWFL brokerage/team site.
Pages fetched 08/12/2026: homepage (`https://www.swflregroup.com/`), `robots.txt`, the Naples
listings index (`https://www.swflregroup.com/naples-homes-for-sale/`), and one detail page
(`https://www.swflregroup.com/property/226028911/`).

**Site-search note:** three prior SWFL "team" domains found by web search
(`palmparadiserealty.com`, `goganteam.com`) fingerprinted as **Sierra Interactive**;
`rgswfloridahomes.com` fingerprinted as **BoomTown**; `swflsearch.com` as **CINC**;
`barclaysrealestategroup.net` as **kvCore/BoldTrail**; `achievefloridahomes.com` and
`floridarealtyassociates.com`/`kellerwilliamsnaplesflorida.com`/`cornerstonecoastal.com` showed no
platform fingerprint (custom/WordPress builds). Ruled out by grepping each fetched page's raw HTML
(`crawl4ai -o all`) for platform strings before landing on `swflregroup.com` as the confirmed Real
Geeks site. This is incidentally useful: it independently corroborates that Sierra Interactive,
BoomTown, and CINC are all live on real SWFL sites too, for whichever session draws those platforms.

## 1. Platform fingerprint

Confirmed by three independent signals in the raw page source (`crawl4ai -o all`, not just
markdown):
- Asset hosts: `cdn.realgeeks.com/static/...` (JS/CSS/icons), `property-images.realgeeks.com/flnaples/...`
  (MLS photo CDN, `flnaples` = the Florida/Naples MLS feed slug), `t2.realgeeks.media` (image
  thumbnailer), `u.realgeeks.media/swflregroup/...` (the account's own media bucket, `swflregroup` =
  their account slug).
- Explicit brand text on the homepage: `real-geeks-logo.svg`, and the visible string "Real Geeks."
- Footer attribution line on every page: **"IDX Real Estate Websites by
  [realgeeks.com/ContentCodes/](https://www.realgeeks.com/ContentCodes/)"** — an explicit,
  unambiguous platform credit, plus "Data Widgets by [Content Codes](https://contentcodes.com/)"
  (Real Geeks' data-widget product).

## 2. robots.txt — listing paths ARE allowed

Fetched live 08/12/2026 via crawl4ai (`https://www.swflregroup.com/robots.txt`, HTTP 200). For
`User-agent: *` the disallows are: `/admin/`, `/member/`, `/tinymce/`, `/map_search/`,
`/template_manager/`, `/slideshow/`, `/search/details/`, `/search/refine/`, `/search/ajax/`,
`/search/popups/`, `/__noindex__/`, `/api/`. A second block fully disallows `oodlebot`.

**Neither the listing detail path (`/property/*`) nor the listing index paths (`/naples-homes-for-sale/`,
`/search/results/*`, other city-landing pages) is disallowed.** Note `/search/details/` IS disallowed —
that looks like a legacy/alternate detail-page route on this platform that this site does not
actually link to; the live detail URLs on this site all resolve under `/property/{mls}/`, which is
clear. Per-site robots must still be re-checked for every new Real Geeks install — this result is
site-specific, same caveat as the johnrwood.com and royalshellrealestate.com findings.

Unlike johnrwood.com (crawl-delay + selective bot blocks) and royalshellrealestate.com (WAF-fronted,
robots unreadable by curl), this site's robots.txt was readable by both crawl4ai and a plain `curl`
(HTTP 200 on both, confirmed informationally — not used to conclude anything, per the hard rule against
using curl to call a site blocked. It just happens this site is not WAF-fronted the way
royalshellrealestate.com is.)

## 3. Listing detail URL pattern — MLS number IS in the URL

`https://www.swflregroup.com/property/{mls_number}/`

Example: `https://www.swflregroup.com/property/226028911/`. **The MLS number is the entire path
segment** — same direct join key to our listing spine's `mls_number` column as both prior platforms
tested (johnrwood.com and royalshellrealestate.com). No address slug is present in the URL on this
platform (unlike the other two), so the MLS number is the ONLY key available from the URL itself —
makes this platform's URLs even more directly joinable, with no fuzzing needed at all.

The listings index (`/naples-homes-for-sale/`) renders listing cards in the plain markdown with
photo, price, beds/baths, MLS number, and a remarks snippet — e.g. one card read verbatim:
`$659,000 3 Beds ⋅ 2 Baths ⋅ 226020396 MLS`. The index→detail crawl walk works the same way as both
prior platforms.

## 4. FIELD CENSUS — one detail page, one crawl4ai fetch

Everything below came off `https://www.swflregroup.com/property/226028911/`, verbatim, fetched
08/12/2026. (This happens to be the SAME MLS number — 226028911, 425 Wildwood LN, Bears Paw,
Naples — as the johnrwood.com detail page in the reference file, giving a direct side-by-side.)

**Identity/location:** MLS# 226028911 · full street address (425 Wildwood LN, Naples, FL 34105) ·
**Subdivision: Bears Paw** · **Neighborhood: Bears Paw** · **Building Name: Bears Paw** · **MLS Area
Major: NA16 - Goodlette W/O 75** (a granular geo code not present on johnrwood.com's page).

**Structure:** Subtype **Residential** · Style Contemporary, Low Rise (1-3) · **Year Built 1981** ·
Bedrooms 3 · Bathrooms 2.5 · Full Baths 2 · Half Baths 1 · Living Area 1 · Square Feet 2,230 ·
Flooring (Tile, Vinyl) · Appliances (Dishwasher, Disposal, Dryer, Microwave, Range,
Refrigerator/Icemaker, Washer) · Heating (Central Electric) · Air Conditioning (Ceiling Fan(s),
Central Electric) · Stories 1 · Levels 1 · **Roof: Built-Up** · Foundation Concrete Block · Parking
Features (1 Assigned, Covered, Golf Cart, Detached Carport).

**Lot / view / exterior:** Exterior Features (Boat Ramp, Dock Lease, Balcony, Glass Porch) · View
(Golf Course, Lake) · Property Description (repeats Style) Contemporary, Low Rise (1-3).

**Community:** Amenities — 15 named (Bocce Court, Clubhouse, Community Boat Dock, Community Boat
Ramp, Community Boat Slip, Pool, Dog Park, Fitness Center, Fishing Pier, Golf Course, Internet
Access, Pickleball, Private Membership, Putting Green, Restaurant, Streetlight, Tennis Court(s),
Underground Utility) · Interior Features (Foyer, Pantry, Walk-In Closet(s), Window Coverings) ·
Pets: Limits.

**Money/market:** List Price $799,000 · Status ACTIVE · Days on Market 1 · **Taxes $5,040**.

**Schools:** Elementary (Poinciana Elementary) · Middle (Gulfview Middle) · High (Naples High) — all
named.

**Attribution:** "Courtesy of John R Wood Properties. 239-293-7441" — the actual MLS listing broker,
displayed via broker reciprocity even though this is a competing team's site · MLS Broker
Reciprocity Program disclaimer citing "M.L.S. of Naples, Inc." · a second data-source line: **"Data
has been provided by census.gov and realtor.com"** for the Walk Score / neighborhood-context widgets.

**Remarks:** full MLS description prose, ~1,850 characters, present in a labeled "Property
Description" section.

**Media:** hero + gallery photo URLs (Real Geeks' own CDN, `property-images.realgeeks.com`) · photo
count shown as "1 of 36" but gated — **"Show Photos — Verify your account to unlock exclusive
photos, mortgage tools, and more. Verify Now."** The markdown fetch still returned photo URLs and the
full data table; the gate visibly blocks additional gallery images/tools behind a login prompt, not
the core facts.

**Interactive widgets (not data fields, but present):** a mortgage calculator (loan amount/term/rate
sliders, computed "$4,920" est. monthly payment) · a Walk Score section (link out to walkscore.com,
no score number rendered in the plain-markdown fetch) · a "Schools Nearby" map section.

## 5. The five flagged fields

- **Subdivision/community name:** PRESENT. "Bears Paw" appears three times (Subdivision,
  Neighborhood, Building Name).
- **Full remarks prose:** PRESENT. Full "Property Description" paragraph, ~1,850 characters.
- **Year built:** PRESENT. 1981.
- **Roof:** PRESENT but **type only, not age** — "Built-Up." Same caveat as johnrwood.com: roof AGE
  still needs the permit lane, not this page.
- **HOA fee amount:** **ABSENT.** No HOA/Association field of any kind on this page — no dollar
  figure and, unlike johnrwood.com, not even an inclusions list. Grepped the full fetched page for
  "hoa" and "association" (case-insensitive) and got zero matches.

## 6. What this page carries that johnrwood.com did not

- **MLS Area Major code** (`NA16 - Goodlette W/O 75`) — a granular sub-market geocode johnrwood.com's
  page did not expose as a labeled field.
- **Building Name as its own labeled field**, distinct from Subdivision/Neighborhood (all three read
  "Bears Paw" here; johnrwood.com only had Subdivision + Neighborhood).
- **A second, explicit non-MLS data-source citation** — "Data has been provided by census.gov and
  realtor.com" — for the walk-score/neighborhood widgets. johnrwood.com's page carried only the MLS
  attribution line, no third-party citation.
- **A login/verify gate on the photo gallery** ("Verify your account to unlock exclusive photos,
  mortgage tools, and more") — johnrwood.com's page had no such gate; all 1 of 36+ photos were
  reachable without an account prompt.
- **A live mortgage calculator widget** with a computed payment figure.
- **Explicit "IDX Real Estate Websites by realgeeks.com" platform credit** in the footer — direct,
  unambiguous self-identification of the platform, which neither prior site carried.

## 7. A genuine cross-platform data discrepancy worth flagging

Both sites are displaying the **same MLS listing** (226028911). johnrwood.com's page (fetched
08/11/2026, per the reference file) reads **Property SubType: Condominium**. This site's page
(fetched 08/12/2026) reads **Subtype: Residential** for the identical MLS number. One of the two IDX
feeds is normalizing/mislabeling the MLS's own subtype field — this is not something this task
resolves, just something to flag per the discrepancy-reporting standard: **johnrwood.com says
Condominium, swflregroup.com says Residential, for MLS# 226028911 — both need review** before either
is trusted as the subtype source of record.

## 8. What this does NOT establish

- One site, one platform install. This says nothing about how Real Geeks renders on a different
  account's template — Real Geeks supports multiple front-end "designs" (this site loads assets
  under `.../static/designs/img/anna/...`, i.e. the "anna" template); a different Real Geeks client
  could look and field-census differently.
- Terms of service were not read — only robots.txt, matching the other platform write-ups so far.
- No claim about sold listings — only one active listing was fetched.
- Redistribution is a separate question from retrieval — the MLS Broker Reciprocity disclaimer and
  the "Courtesy of John R Wood Properties" attribution travel with the data; any surface built from
  this must carry the same attribution.
