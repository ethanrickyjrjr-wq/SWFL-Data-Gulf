# B2B contact-enrichment vendor scan — the 9 named in Clay's waterfall (08/02/2026)

Operator asked to crawl4ai each vendor individually: Prospeo, DropContact, Datagma, Hunter,
PeopleDataLabs, Nimbler, Apollo, Lusha, Snov. These are the exact 9 work-email waterfall
vendors [[claydotcom-scan]] named (without individually researching them) when scanning
Clay.com — that file only name-dropped them; this is the follow-up deep-dive per vendor.
Swept live via crawl4ai (homepage + `/pricing`, raw markdown, `wait_for=body` +
`delay_before_return_html=2.5s` — the default crawl produced 1-char output on these JS-heavy
Next.js/WP marketing sites without the wait, worth remembering for future crawls of this
class of site). **8 of 9 fetched live; Nimbler blocked** (see below) — 8/9, not "all 9."

## Prospeo (prospeo.io)

Y Combinator-style GTM data platform. Self-reported: 280M "truly verified" leads/companies,
143M verified email addresses, 98% claimed data accuracy, 15,000+ companies / 40,000 users,
4.8 rating. Products: People & Company Search (45+ filters), AI Search & Lookalikes, Chrome
extension, CRM enrichment, email finder, mobile finder, domain search, intent signals, public
API, **MCP server** (`prospeo.io/mcp`). Positions directly against ZoomInfo/Apollo/Cognism/
Lusha on dedicated comparison pages.

Pricing (credits, roll over, unused credits carry to next cycle): Free $0/mo (100
credits/mo, 28 filters); Starter $37/mo billed yearly (24,000 credits/yr); Growth $74/mo
billed yearly (60,000 credits/yr, HubSpot/Salesforce sync, job-change tracking); Pro $187/mo
billed yearly (180,000 credits/yr, all 41 filters, highest API rate limits). 1 credit = 1
verified business email; 10 credits = 1 direct mobile number.

## DropContact (dropcontact.com)

French company, GDPR-first positioning ("100% GDPR-compliant, nominative, and verified email
address" from just a website + first/last name). Explicitly brands itself **"The Email
Finder that Outperforms Waterfalls"** — i.e. markets against the exact waterfall pattern Clay
built around it, claiming single-source accuracy beats fan-out. Pay-on-success billing model
(no charge if no email found). Native CRM integrations: Pipedrive, HubSpot (Salesforce/Zoho
"soon"). Also ships a **MCP server** (`dropcontact.com/mcp-dropcontact`).

Pricing (EUR, credits): Starter €59/mo (500 credits/mo, API & MCP access, file-based
enrichment); Growth €89/mo (adds LinkedIn enrichment without login, job-title AI
classification, company-change alerts, credits carry over). Tiers scale up to 150,000
credits/mo shown on the slider (higher tiers require the pricing-page slider, not fully
captured in this crawl — see raw dump if exact numbers matter later).

## Datagma (datagma.com — note: `www.datagma.com` 403s via Cloudflare DNS misconfig on their
end; bare `datagma.com` works)

Positions as **real-time web-retrieval, not a static database** — "all the data you get from
Datagma is retrieved in real-time from the public web." 75+ data points (personal + company).
Pay-only-for-hits (no charge if nothing found). Emails verified via NeverBounce/UseBouncer
(pricing page footer says "verified by ZeroBounce" — inconsistent claim across the page,
worth noting not resolving). Requires a **business email domain to sign up** (blocks Gmail/
Yahoo/generic `admin@`/`sales@` addresses) — relevant if we ever evaluate signing up
ourselves. Clay.com's own Head of Ops is quoted as a customer testimonial on their homepage,
confirming the waterfall relationship directly from Datagma's side.

Pricing (credit system: 1 credit = 1 email, 30 credits = 1 mobile number, roll over up to 12
months): Free $0 (90 verified emails/yr, 3 mobiles/yr); Regular $39/mo billed yearly (36,000
emails/yr); Popular $79/mo billed yearly (90,000 emails/yr); Expert $209/mo billed yearly
(270,000 emails/yr); Enterprise custom/pay-as-you-go.

## Hunter (hunter.io)

The best-known standalone email finder; has expanded into a full **"all-in-one email
outreach platform"** — Domain Search, Email Finder, Email Verifier, Discover (B2B lead
database), Signals (intent data), TechLookup, plus **Sequences + AI Writing Assistant**
(cold-email sending, not just finding) and a **Data Platform** for bulk/API-scale access.
Logos: Canva, Semrush, Cursor, Customer.io, Gartner, Vimeo. No credit card required for the
free tier.

Pricing (annual-discounted monthly shown): Free $0; then $34/mo (from $49), $104/mo (from
$149), $209/mo (from $299) — tier names not fully captured in this crawl pass, but scaling is
roughly 3x steps. Also sells add-on mailboxes/domains for cold outreach starting at $10/mo
per account, $6/mo custom domains — i.e. Hunter is quietly also a cold-email
infrastructure vendor now, not purely a finder.

## People Data Labs / PDL (peopledatalabs.com)

Different category from the others — **raw data infrastructure provider**, not a
GTM/sales-workflow tool. Self-description: "we build workforce data, so you don't have to" /
"talent sourcing platform." Datasets: Person Data, Company Data, Job Posting Data (beta).
Delivery: REST APIs, or full data-license feeds via Snowflake/Databricks/AWS/GCP — i.e. buy
the whole dataset, not just query-time lookups. ISO 27001 + SOC 2 Type 2 compliant. **Clay
itself is listed as a PDL customer logo** on PDL's own homepage (alongside S&P Global,
HireEZ, Anaconda) — PDL is infrastructure other enrichment tools (including Clay) build on
top of, one layer further upstream than the other 8 vendors here.

Pricing: Free $0/mo (up to 100 records/mo); Pro $98/mo (starting at 350 records/mo);
Enterprise custom. Notably the most expensive per-record of the set at entry tier — consistent
with being a raw-data/infra product rather than a workflow tool.

## Nimbler — **BLOCKED, could not retrieve live**

Tried `nimbler.com` (crawl4ai got a non-committal connection failure, all 4 anti-bot tiers —
plain/stealth/undetected/undetected+stealth — via `crawl4ai --probe`), `www.nimbler.com`
(same), `nimbler.io` (resolves to a parked GoDaddy domain-for-sale page, not the company),
and `get.nimbler.com` (real page, but hard HTTP 403 anti-bot block at all 4 tiers, "Try
--headed" was the tool's own next suggestion — not attempted, out of proportion for one
vendor in a 9-vendor sweep). **No live-fetched data for Nimbler.** What we know is
second-hand only, from Clay's own site (already captured in [[claydotcom-scan]]): Clay lists
Nimbler in both the work-email waterfall AND the personal-email waterfall (alongside
Retention.com and Mixrank) — the only one of the 9 vendors Clay uses for personal, not just
work, emails. Do not treat this as vendor-verified; it is Clay's characterization of Nimbler,
not Nimbler's own claim.

## Apollo (apollo.io)

The largest / most recognizable name in the set — full outbound sales platform, not just
enrichment. 240M+ contacts, 30M+ companies, 600,000+ companies using it. Product surface:
Apollo Data, AI Assistant, **Apollo MCP**, Integrations, Chrome extension, Workflow
Automation, plus full sequencing/dialer/deal-execution suite (Outbound, Inbound, Data
Enrichment, Deal Execution as the four named "solutions"). Own marketing line: "What used to
cost millions, now costs $30."

Pricing (credits/yr): Free $0 (900 credits); Basic $49/mo (30,000 credits/yr, basic filters);
Professional $79/mo (48,000 credits/yr, adds US dialer); Organization $119/mo (72,000
credits/yr). Separate contact-identify limits layered on top (e.g. "identify up to 50,000
companies/mo" mentioned as a distinct cap from credits).

## Lusha (lusha.com)

280,000+ GTM teams claimed (pricing page separately claims "300,000 leading GTM teams" —
inconsistent number between homepage and pricing page, worth flagging same as Datagma's
verifier-name inconsistency; treat both as marketing copy, not audited). Positions as
"B2B data and intelligence layer for GTM teams **and AI agents**" — two-layer architecture
("Search layer" + "Intelligence layer" that "learns your context"). Ships both a **Lusha API**
and **Lusha MCP** ("Connect Claude, ChatGPT, or any MCP-compatible AI assistant"). AI-native
list-building UI on the homepage itself (natural-language prompt box: "Series B fintech
companies in the US that hired a new VP of Sales in the last 90 days" with Claude/ChatGPT
branding chips shown next to their own).

Pricing (granular credit costs: 1 credit = 1 verified email, 5 credits = 1 phone number, 8
credits = 1 recorded call w/ conversation-intelligence insights): Free $0/mo (40 credits/mo);
Starter $37.45/mo billed yearly (4,800 credits/yr); Pro $45.45/mo billed yearly (7,200
credits/yr, adds API, CSV enrichment, signals, webhooks); Premium $259.95/mo billed yearly
(40,800 credits/yr, adds advanced API, team mgmt, 5 seats); Scale custom (SSO, 50%+ off
per-credit, dedicated success team). 4.3/5 rating claimed.

## Snov.io (snov.io)

Ukrainian-founded (Snovio), full outreach suite: Email Finder API, Email Verifier API, plus
**LinkedIn automation** as a paid add-on ($69/mo per account slot, separate from the base
plan). Credits distributable freely between finding and verifying.

Pricing (credits, annual pricing shown, unused credits roll over): Starter $39/mo (1,000
credits/mo, ~$117/yr savings vs monthly); Pro S $99/mo (5,000 credits/mo); scaling to Pro M
$189/mo, Pro L $369/mo, and a top tier at $738/mo (200,000+ credits). Cheapest per-credit
entry point of the set at the Starter tier, but LinkedIn automation is unbundled/extra unlike
Datagma's "no extra add-ons" pitch.

## Cross-vendor pattern notes

- **MCP is now table stakes, not a differentiator** — Prospeo, DropContact, Apollo, and Lusha
  all separately ship their own MCP servers so AI agents (Claude/ChatGPT explicitly named by
  Lusha) can query them directly, independent of Clay's own MCP layer noted in
  [[claydotcom-scan]]. Five vendors in this list expose themselves as MCP-queryable data
  sources on their own, which is the same shape as our `/api/mcp` — this pattern is now
  common across the whole B2B-data-vendor category, not a Clay-specific idea.
- **"Pay only if found" is a recurring pricing hook** — DropContact and Datagma both lead
  with it explicitly (no credit charged on a miss); Prospeo's FAQ says the same for its
  people-export credits ("0 if no email is found"). This is the vendor-level mechanism that
  makes Clay's waterfall economical: chaining 9 pay-on-miss vendors doesn't multiply cost the
  way a per-query flat fee would.
- **Category is bifurcated**: workflow/outreach platforms (Hunter, Apollo, Snov, Lusha — all
  now sell sequencing/dialer/LinkedIn-automation on top of enrichment) vs. pure data/API
  layers (PDL, Datagma, DropContact, Prospeo lean this way, though Prospeo also has a search
  UI). PDL sits one layer further upstream than the rest — it's infrastructure other
  enrichment tools (Clay included) buy from, not a GTM end-user product.
- **Self-reported numbers don't reconcile and shouldn't be treated as audited** — Lusha's own
  homepage (280,000+ teams) and pricing page (300,000+ teams) disagree with each other within
  the same site; Datagma's verification-partner name differs between its homepage prose
  (NeverBounce/UseBouncer) and pricing-page footer (ZeroBounce). Marketing-site self-reported
  stats generally, not just these two.

## Relevance to brain-platform — none identified, consistent with the Clay conclusion

Per [[claydotcom-scan]]'s existing bottom line: these are pure B2B sales-contact-enrichment
vendors (work/personal emails, mobiles, firmographics for a sales rep's outbound motion).
None overlap our SWFL public-record real-estate/economic data-roots catalog
(`docs/standards/data-roots.md`) — we don't sell or need bought B2B contact data, and per
Rule 11 (not Google/Amazon, a rounding error of their data/volume) adopting a 9-vendor
waterfall for contact-finding would need to justify itself against a real use case first, not
against "Clay does it." No action item surfaced by this research on its own; logging it
because the operator asked for the individual vendor detail, not because a gap was found.
