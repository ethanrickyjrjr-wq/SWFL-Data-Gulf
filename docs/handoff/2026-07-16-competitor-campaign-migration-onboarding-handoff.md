# "Bring your own list" — 1-click migration from a competitor's email/CRM setup

**Date:** 2026-07-16. **For:** next session (Fable 5) to design + build.
**Operator ask, verbatim:** *"research ways we can easily bring in users who already have
campaigns with other companies. how we can get their emails set up exactly and bring in their
contacts... we want basically 1 click switch, or add us to your emails and we will prepare.
bio, brand, personal info, everything as easy as possible."*

This is a research + evidence handoff (RULE 0.4/0.5), not a build. Everything below was either
verified against running code in this repo (RULE 0.5) or against live vendor docs via crawl4ai
(RULE 0.4) on 2026-07-16. No implementation happened this session — probe before building
anything, the vendor surfaces below still need a fresh crawl4ai pass at build time per RULE 0.4
(don't treat this doc as the verification — it's the map of what to verify).

---

## 1. What already exists — don't rebuild this (RULE 0.5 probe)

The platform already has real contact-import and brand/bio infrastructure. The gap is narrower
than "build contact import" — it's specifically **competitor ESP/CRM migration** and
**auto-detecting brand+bio from what an agent already sends**.

**Contacts — unified store, three working lanes today:**
- `public.contacts` is the ONE canonical store (`docs/superpowers/specs/2026-07-05-unify-contact-stores-design.md`) — uuid PK, `phone`, `unsubscribed`, tags. All writers funnel through `upsertContacts` (`lib/email/upsert-contacts.ts`).
- CSV/vCard upload: `POST /api/contacts/import` (`app/api/contacts/import/route.ts`), `app/contacts/upload/UploadForm.tsx`.
- Google OAuth (**already 1-click**): `lib/email/google-oauth.ts` + `app/api/email/contacts/google/start/route.ts`. Scope `contacts.readonly` (Google *sensitive*, not *restricted* — no CASA assessment needed, but unverified apps cap at ~100 users until Google verifies the consent screen).

**Already-settled contact-sourcing roadmap (07/05/2026, crawl4ai-verified, in the same spec file, §"Phase 2"):**
- Google contact groups → auto-tags (zero new scopes — `contactGroups.list` is covered by the scope we already request).
- Google "Other contacts" (`otherContacts`, scope `contacts.other.readonly`) — the "people you've actually emailed" signal, sensitive-tier not restricted.
- **Gmail API itself is a trap** — `gmail.readonly`/`gmail.metadata` are *restricted* scopes requiring an annual paid CASA security assessment. Do not request any `gmail.*` scope.
- Follow Up Boss (dominant real-estate CRM): plain REST, HTTP Basic auth via a **per-user API key the agent pastes in** (no OAuth registration needed to start) — `docs.followupboss.com`.
- Outlook/Microsoft Graph `GET /me/contacts`, delegated `Contacts.Read` — lighter verification than Google restricted scopes.
- HubSpot: **unresolved** — `developers.hubspot.com` was bot-walled on the 07/05 crawl attempt. Still open; don't re-guess its shape.

**Brand — fixture-first resolver already built for OUTREACH, same vendor lanes apply to self-serve:**
- `docs/superpowers/specs/2026-07-10-outreach-brand-injection-design.md` + its research doc: Brandfetch Brand API (`GET api.brandfetch.io/v2/brands/domain/{domain}` → logos/colors/fonts, verified live 07/10, 100 free dev requests) and logo.dev as a cheaper fallback. Built to resolve a *recipient's* brand for our cold outreach — but the same domain→brand-kit lookup is exactly what a self-serve "type your website, we'll pull your colors/logo" onboarding step needs.
- DBPR licensee CSV (`RE_rgn7.csv`, Lee/Collier/Hendry + neighbors, updated **weekly, free**) — name, license #, rank, **Employer's Name = brokerage affiliation**. **No email column.** This is the only free, automatic source of a real estate agent's *personal/license info* found to date.

**Bio — shipped 07/13, corrected 07/16 (today):**
- `docs/superpowers/specs/2026-07-13-agent-profile-design.md` + `migrations/20260713_agent_profile.sql`: `user_brand_profiles.agent_bio` (a template with live `{{farm.*}}` tokens, resolved at build time) + `agent_profile_facts` (one fact/row, `source ∈ {agent_stated, agent_upload, web_cited}` — a fact with no source literally cannot be written, DB-enforced). An AI "your story" interview drafts the bio and the profile **grows** as later deliverables discover gaps.
- This is the landing zone for whatever a migration flow captures — any auto-extracted bio-like text should write into `agent_profile_facts` with `source: agent_upload`, never be forced straight into the rendered bio.

**Confirmed dead end — SteadyAPI has none of this.** The operator's ask named SteadyAPI as a
tool to use for this research. Checked `docs/steadyapi-capability-census.md:109` (grepped
across all 18 endpoints, 07/08 audit): **"Agent/brokerage/office fields — zero across all 18
endpoints."** SteadyAPI is real-estate *listing/market* data (comps, price history, rentals) —
it carries no agent bio, brokerage, license, or contact data at any endpoint. It is not a lane
for this problem; don't route agent-profile work through it. (Its own house rule stands
unrelated to this: never surface the SteadyAPI name to users.)

---

## 2. The actual gap

No connector exists for a general-purpose ESP (Mailchimp / Constant Contact / ActiveCampaign)
or the real-estate-specific tools beyond Follow Up Boss. No "forward us something you already
send and we'll extract your brand + bio + contacts" path exists — this would be new. Below is
what a fresh crawl4ai pass (07/16/2026) found for each, so Fable 5 can pick lanes without
re-researching from zero.

### 2a. Contact/campaign migration — ranked by how close to "1 click" each really is

| Vendor | Auth model | Verified 07/16/2026 | 1-click-ness |
|---|---|---|---|
| **Wise Agent** (real-estate CRM) | OAuth 2.0, authorization-code flow, **granular scopes**: `profile`, `team`, `marketing`, `contacts`, `properties`, `calendar` | `wiseagent.com/docs/api.asp` — real consent screen, agent picks scopes, `getContacts`/`addContact` endpoints exist. Requires us to request a Client ID/Secret from Wise Agent first (their manual step, not the agent's). | **Best fit of anything found.** Real OAuth consent UX, contacts-scoped (agent never grants more than needed). |
| **Mailchimp** | OAuth 2.0, Authorization Code flow | `mailchimp.com/developer/marketing/guides/access-user-data-oauth-2/` — **no granular scopes**: an authorized app gets the whole account's Marketing API surface. Access token **never expires** (no refresh token needed) unless the user revokes it. | Genuinely 1-click for the agent, but the all-or-nothing grant + non-expiring token is worth surfacing honestly in the consent copy, and the token needs secure storage since it's a permanent credential. |
| **Constant Contact** | OAuth 2.0 (Authorization Code preferred; PKCE, Device, and a deprecated Implicit flow also exist) | `developer.constantcontact.com/api_guide/auth_overview.html` + `.../scopes.html` — **has a real scopes model** (unlike Mailchimp) plus a dedicated **Bulk Activity "Export Contacts to a CSV File"** endpoint (`export_contacts.html`) as an alternative to paging the Contacts collection. `offline_access` scope needed for a refresh token. | 1-click, and the granular scopes make the consent screen honest about what's requested. |
| **kvCORE** (BoomTown/Inside Real Estate) | Token-based REST, **but gated** | `apidocs.kvcore.com` — API docs are **not publicly available**; access must be requested through Inside Real Estate support per-account. Max **3 active API tokens** per account. **No endpoints for marketing campaigns** — contacts CRUD only. Conservative rate limits. | NOT self-serve — every kvCORE-using agent would need us (or them) to manually request API access from Inside Real Estate first. Kills the "1 click" framing for this vendor specifically. |
| **BombBomb** | API key, manually generated | `developer.bombbomb.com/api` — agent must have Admin/Application-Admin access to generate a key themselves, then paste it in (same UX pattern as the already-built Follow Up Boss lane). | Same "one paste, not one click" tier as Follow Up Boss — fine as a fallback tier, not the flagship button. |
| Follow Up Boss / Google / Outlook / HubSpot | — | Already covered by the 07/05 research (§1 above) — don't re-research. | — |

**Not researched — flag, don't guess:** Lofty/CINC, Chime, Real Geeks, LionDesk. Real
estate-specific CRM landscape is fragmented; the four above (Wise Agent, kvCORE, BombBomb, FUB)
were the ones with concrete public developer docs found. If the operator names a specific
platform their target agents actually use, run a dedicated crawl4ai pass on it before assuming
it has (or lacks) an API.

### 2b. "Add us to your email, we'll prepare everything" — the forwarding pattern

The operator's phrasing ("add us to your emails") suggests something lower-friction than OAuth
app-registration for platforms with no public API: forward one existing newsletter/campaign
email to a dedicated inbound address, and auto-extract brand + bio + (any embedded/CC'd)
contacts from it.

- **This is a real, productized pattern — not a novel idea, but not free to build either.**
  SigParser (`sigparser.com/developers/extract-reply-chains-from-emails`) is a company built
  specifically around parsing forwarded emails and reply chains to extract contacts and
  signatures at scale. Confirms the concept is technically sound; it's B2B/enterprise-tier
  contact-intelligence tooling, not a component to casually vendor in — a build-vs-buy call is
  needed before committing to it as a dependency (pricing wasn't crawled this session).
- **We already have the one piece of infra this needs**: Resend Inbound webhook parsing
  (`app/api/webhooks/resend/route.ts`) is already wired for the reply-to-ask feedback loop
  (`docs/email-marketing/README.md` Phase 3). The same inbound-parse mechanism is the natural
  home for a new "forward your newsletter here" address — this is a routing decision, not a new
  subsystem.
- **What such a parse would feed, concretely:** logo image → Brandfetch/logo.dev domain lookup
  off the sender's own domain (same lanes as §1's outreach brand-resolver) for colors/fonts;
  any "About [Name]" paragraph in the footer → one `agent_profile_facts` row,
  `source: agent_upload`, `source_detail` = the forwarded message id; the sending domain itself
  seeds `user_brand_profiles.business_email`/socials if present in the signature.
- **Not yet designed:** the actual parser (regex/heuristic vs an LLM pass over the forwarded
  HTML — Talon, Mailgun's open-sourced signature-parsing library, is a free alternative to
  SigParser worth a look: `mailgun.com/blog/product/open-sourcing-our-email-signature-parsing-library`,
  not yet crawled for its current API shape).

### 2c. Personal info / bio auto-fill

- **DBPR licensee CSV** (§1, already known) is the only free, automatic, at-scale source of
  license #, rank, and brokerage — but it's name-matched, weekly-refreshed, and has **no
  email**, so it's a *prefill-and-confirm* step during signup (agent types their name → we
  show the matched license/brokerage → they confirm), not a silent auto-fill.
- **realtor.com / Zillow public agent-profile pages** (photo, "About me" bio, years active,
  specialties) were considered but **NOT researched this session** — ToS terms for
  scraping/crawling those specific agent-profile pages are unverified. Do not build this
  without a dedicated crawl4ai pass confirming what's actually permitted; treat as an open
  question, not a lane.
- Whatever is captured (DBPR confirm, forwarded-email extraction, or a plain manual answer)
  lands in `agent_profile_facts` with the correct `source` tag and flows into the existing
  07/13 AI bio-interview as the seed material — it should never bypass that gate and write
  straight into the rendered bio (see the "never default an instruction into a brand block"
  landmine in that spec).

---

## 3. Compliance — importing a competitor's existing list

Verified against the FTC's own CAN-SPAM Act Compliance Guide for Business
(`ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business`) and its
"Candid Answers to CAN-SPAM Questions" post: **CAN-SPAM does not require opt-in consent** to
send commercial email — the four real requirements are truthful "From"/routing headers, a
non-deceptive subject line, a valid physical postal address, and a working opt-out honored
promptly. This matches the CAN-SPAM handling already built and pinned in
`lib/email/CLAUDE.md`. **The practical read for this feature:** an agent moving their OWN
existing list from one platform to another isn't "buying a list" (the FTC's actual risk
scenario — addresses that opted out elsewhere, or list-broker harvesting) — it's the same
relationship, same list, different storage. No new consent-collection step is legally required
by the migration itself. The compliance surface that matters is unchanged: the send-side
footer/address/unsubscribe machinery this repo already enforces. Liability for list quality
still sits with whoever sends to it (the FTC is explicit that responsibility can't be
contracted away to a platform) — worth one line of onboarding copy, not a blocker.

---

## 4. Recommended shape for Fable 5 to spec (not built — a starting sketch)

1. Onboarding surface offers connect options, roughly in this priority order: **Google**
   (built) → **Wise Agent** (new, cleanest OAuth + real scopes) → **Mailchimp** (new, 1-click
   but all-or-nothing grant) → **Constant Contact** (new, scoped) → **CSV/vCard** (built,
   universal fallback) → **"forward one of your emails"** (new, for anyone whose platform has
   no API — BombBomb/kvCORE/everyone else land here too since their APIs aren't self-serve).
2. Every OAuth connector writes into the SAME `public.contacts` store via the existing
   `upsertContacts` core — no new contact table, no parallel store (the 07/05 unification is
   exactly what makes this cheap to add).
3. The forwarding path reuses the existing Resend Inbound plumbing; its extraction output
   (logo/colors/bio-text/domain) writes into `user_brand_profiles` and `agent_profile_facts`
   through the same fields the Brand panel already reads — no new brand storage shape.
4. DBPR name-match is a signup-time **suggest-and-confirm** UI, not a silent write (no email
   key to match against; false-positive risk on common names).
5. Whatever isn't captured automatically falls through to the existing AI bio interview
   (07/13 spec) — the system should never present a dead end, only "here's what we found,
   here's what's still open."

## 5. Before building anything — RULE 0.4 gate for Fable 5

Every vendor fact above is dated 07/16/2026 and cited, but "verified two weeks ago" is not
"verified now" once actual client registration starts — Mailchimp/Constant Contact/Wise Agent
credential requests, exact scope strings, and rate limits should get one fresh crawl4ai pass
each at the moment a connector is actually built, per the standing CLAUDE.md rule. Treat every
row in the table above as a **hypothesis with a source**, not a locked contract.

## Sources (crawled/searched live, 07/16/2026)

- Mailchimp OAuth 2: https://mailchimp.com/developer/marketing/guides/access-user-data-oauth-2/
- Constant Contact OAuth overview: https://developer.constantcontact.com/api_guide/auth_overview.html
- Constant Contact scopes: https://developer.constantcontact.com/api_guide/scopes.html
- Constant Contact export contacts (bulk): https://developer.constantcontact.com/api_guide/export_contacts.html
- Wise Agent API: https://wiseagent.com/docs/api.asp
- kvCORE Public API V2: https://apidocs.kvcore.com/ (+ search-summarized access-gating/limits)
- BombBomb API: https://developer.bombbomb.com/api
- ActiveCampaign auth: https://developers.activecampaign.com/reference/authentication
- FTC CAN-SPAM compliance guide: https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business
- FTC candid CAN-SPAM answers: https://www.ftc.gov/business-guidance/blog/2015/08/candid-answers-can-spam-questions
- SigParser (forwarded-email/reply-chain contact extraction): https://www.sigparser.com/developers/extract-reply-chains-from-emails
- Mailgun open-source signature parser (Talon), noted not re-crawled: https://www.mailgun.com/blog/product/open-sourcing-our-email-signature-parsing-library/
