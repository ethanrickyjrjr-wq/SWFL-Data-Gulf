# Permit-data / construction-lead market landscape — who sells what, at what price

Date: 09/15/2026. Live-crawled via crawl4ai (pinned venv) + WebSearch for discovery, per RULE 0.4
— no memory. Follow-up to [[2026-09-15-hbweekly-permit-reports-scan]] after the operator asked
"what do most people order" and "not sure on the competition out there." Sources:
permitmap.org, permitgrab.com (+ /permits/florida/tampa-fl), shovels.ai (+ /pricing),
constructionmonitor.com/permittools/statistics, permitdata.net.

## The five real competitors found (plus HBW from the prior scan)

**PermitMap** (permitmap.org) — 22 Florida counties (Lee + Collier both in their county picker),
Texas expanding. Weekly live dashboard + weekly email digest, filtered by trade + county.
**$79/month, flat per county, 14-day free trial, card required.** Free lead magnet: enter trade +
county, get a real permit sample emailed "every Monday by 8am." Positions directly against
Angi/HomeAdvisor: "a permit is public record — only the contractors watching for it work the job,"
one flat price vs. per-lead cost on a shared list.

**PermitGrab** (permitgrab.com) — 448 cities across 41 states, city-level landing pages (great
SEO shape — e.g. permitgrab.com/permits/florida/tampa-fl showed live stats: 4,563 indexed
permits, 25 contractor names, 7,559 code violations, newest record dated same-day 09/15/2026).
**$149/month Pro subscription**, 14-day trial, card at checkout. Free tier: one weekly email
summary per city, no card. 4.6M+ permits tracked, 166,000+ contractors on file nationally. Sells
by workflow vertical, not just trade: suppliers/distributors, fire & life safety,
facilities/portfolios, insurance/property research — not just "contractor leads."

**Shovels.ai** — the enterprise-grade player. "Permits + parcels + contractors + land-use
decisions, then we draw it forward" (predictive angle). Logos: AWS, Google, Oracle, Redfin, Owens
Corning, Houzz. Tiered: **Free ($0/mo, 500 credits, 1yr history) → Basic $599/mo (25,000
credits/mo, full history, marked "Most popular") → Pro $999/mo → Enterprise Data License
(contact sales)**. Also sells an API, a CLI, GIS layers, and an AI assistant ("Charlie"). This is
the only one selling to real-estate/insurance/telecom verticals as much as contractors.

**Construction Monitor** (constructionmonitor.com) — oldest-school shape, 800-number on every
page. No self-serve price shown — same opaque-quote pattern as HBW. Full suite: Weekly Editions,
Powersearch, Real-time Leads, Top/New Company Reports, Mapping, Basic/Detailed Statistics, plus
an API & FTP product and a **separate shop selling single-purpose datasets: Single-Family Permit
Data, Solar Permit Data, Pool Permit Data** — i.e. pool and solar are broken out as their own
standalone SKUs, not just trade filters.

**PermitData.net** — the one that matches "wait for an order and get it" exactly. **No
subscription at all.** Flow: pick a scope (states/counties/date range/trades) → get a
transparent per-record quote → pay once via Stripe → receive one normalized CSV/Parquet file,
deduped, geocoded, traceable to source. Free interactive demo (Florida) and free per-county/
per-trade coverage pages so you can judge data quality before buying — explicitly contrasted
against "most permit-data providers are built for enterprise buyers — annual contracts, sales
calls, an API you integrate. We're the fast, no-friction way to just get the data."

## Answering "what do most people order"

No vendor publishes unit sales, so this is inference from what every one of the six companies
leads with, not a measured share — flagged as such. Two shapes repeat everywhere:

1. **Weekly, trade-filtered new-permit feed is the default product across the entire market.**
   HBW's top-listed report is the Weekly Construction Permit Report; PermitMap's whole pitch is a
   weekly digest; Construction Monitor's top nav item is "Weekly Editions"; PermitGrab's own free
   lead magnet is a weekly summary. Every vendor also filters by trade (roofing, HVAC, solar,
   electrical, pool) as a first-class control, not an add-on.
2. **Pool and solar permits are the two trades that repeatedly get broken out as their own
   standalone product**, not just a filter — HBW has a dedicated Weekly Swimming Pool Permit
   Report; Construction Monitor sells Solar Permit Data and Pool Permit Data as separate SKUs.
   Read as: those two trades have buyers willing to pay for a narrower, cheaper feed because the
   lead quality/close-rate is high (a pulled pool permit is a near-certain qualified buyer for
   decking/screen-enclosure/cleaning upsells).

## Answering "not sure on the competition" — the pricing spectrum, real numbers only

$79/mo (PermitMap, entry, self-serve) → $149/mo (PermitGrab Pro, self-serve) → $599–$999/mo
(Shovels Basic/Pro, self-serve) → per-record one-time quote via Stripe, no subscription
(PermitData.net, self-serve) → fully opaque sales-quote, no public price at all (HBW,
Construction Monitor — both call-first, account-manager-priced).

## Answering the operator's model question — "wait for an order and get it"

That is a real, working, live business today: **PermitData.net is exactly that model** — scope,
quote, one Stripe payment, one delivered file, no maintained subscription infrastructure on the
buyer's side. It is the ONLY one of the six with fully transparent self-serve pricing and no
recurring commitment. Everyone else (PermitMap/PermitGrab/Shovels) instead sells a recurring
subscription to an always-fresh feed — the value there is the ongoing weekly cadence, not a
one-time archive dump, so their buyers are optimizing for not missing this week's permits, not
historical completeness.

## Verdict

DO NOT ADOPT any of these as vendors — this is competitive/market landscape research, not a tool
evaluation. STEAL THE SHAPE, three things worth it: (1) PermitMap's free-sample-by-email capture
(trade + county → one real sample) is a low-cost lead magnet we already have the data to run for
Lee + Collier, since `permits-swfl` already exists ([[2026-09-15-hbweekly-permit-reports-scan]]);
(2) PermitData.net's quote-then-Stripe-checkout, no-subscription flow is the cleanest match for
"wait for an order" and is buildable on the same existing pipeline without maintaining a public
dashboard; (3) every vendor's per-city SEO landing pages (PermitGrab's model) are a real
discoverability tactic worth naming if SWFL Data Gulf ever surfaces permits publicly.
