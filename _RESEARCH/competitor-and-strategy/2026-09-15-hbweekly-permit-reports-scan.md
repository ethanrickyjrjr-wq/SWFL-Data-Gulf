# HBW Inc (Home Builders Weekly / hbweekly.com) — permit report vendor scan

Date: 09/15/2026. Live-crawled via crawl4ai (pinned venv) per RULE 0.4 — no memory, no guessing.
Pages: https://hbweekly.com/permit-reports, /about-us, /coverage-areas, /contact-us,
/cloud-search, / (home). /pricing and /about both 404 (guessed slugs, not real routes).

## What it is

HBW Inc, founded 1992 as "Home Builders Weekly" by Dave and Ann Taylor in Orlando, incorporated
2000, HQ DeBary FL. A B2B construction-lead data broker, not a public data site. Sells weekly
building-permit reports (new construction, additions/alterations $25k+, swimming pool permits) to
builders/suppliers/sales teams, plus a "Cloud Search" web portal, mailing labels, and builder
summary reports. Coverage: most of FL (49 counties, including **Lee + Collier — our SWFL core**),
plus Atlanta metro, and Dallas/Houston/Austin/San Antonio metros in TX.

## How they source it (the operator's question)

No API, no scrape, no public dataset. Per /about-us: "a full time editorial-office staff of 10 and
over 40 reporters spread throughout the territories" gather permit data by working the actual
permit-issuing offices (city/county building departments) every week; an editorial team edits and
publishes it. This is a human-labor courthouse-runner model, the same shape as our own
`lee_deed_official_records` lane — people physically or procedurally pull records from the issuing
office, not a bulk feed. 34 years of accumulated historical archive is pitched as a moat ("having
been in business for over 20 years, we have an enormous amount of archived permit data").

## Pricing (the operator's other question)

None published anywhere on the site — no /pricing page (404), no price list on coverage-areas or
permit-reports. Coverage-areas says counties "may be purchased individually or packaged together
for discounted rates" but names no number. The entire funnel is a lead-gen contact form
("REQUEST A Complimentary Custom Report") routed to named account managers (Jim Votino, Marcia
Crispell) who sell FL/GA/AL by hand. Classic B2B enterprise quote model: no self-serve checkout,
price varies by county count, report type (weekly permit / pool / builder summary / historical),
and delivery format (mail, email, hosted download, or Cloud Search seat).

## Verdict

DO NOT ADOPT — not a tool for our stack, HBW is a competitor/adjacent vendor in the same permit-
data space, not something we'd integrate. STEAL THE SHAPE: nothing new to steal mechanically (we
already do source-verified county-office data, RULE 1 lane pattern), but worth noting for
positioning — HBW's moat is labor + 34-year archive depth, sold at opaque enterprise pricing with
no self-serve. If we ever surface permit data publicly, a visible price beats their all-contact-form
funnel as a wedge (see [[project_market-positioning-bottom-up]]-style bottom-up positioning).
