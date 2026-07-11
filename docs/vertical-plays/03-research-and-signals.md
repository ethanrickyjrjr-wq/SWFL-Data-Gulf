# Research & signals — weighted by closeness to cash

**07/10/2026.** Live research behind the vertical board. Method: ~55 live SteadyAPI Reddit calls this
round (agent-side subs: r/InsuranceAgent, r/loanoriginators, r/HVAC, r/Roofing, r/Contractor,
r/Plumbing, r/homeowners) + three bounded crawl4ai streams (FTSA/TCPA law, FL DFS insurance list, NMLS
mortgage registry). New ground only — the closed rounds 1–4 (RE-agent pricing, CRE pain,
comp-adjustment, cadence, Gmail-tab, showing-prep, pre-send QA) are NOT re-mined; see
`docs/steadyapi-research/README.md`.

**How to read this file:** the ranking in Section 6 is the point. Everything above it is evidence.

---

## 1. Reachability — the discriminator (verified this session)

Whether we can even contact a vertical, and on what channel, decides everything. Findings:

- **Insurance agents — fully reachable, free, native.** FL DFS bulk CSV
  (`licenseesearch.fldfs.com/BulkDownload` → `AllValidLicensesIndividual.csv`, ~320MB) carries
  **Email + Business Phone + address + Business County + license class** for every valid FL licensee.
  Filter County ∈ {Lee, Collier}, class `0220` (2-20 property & casualty). No login, no records request.
  **This is the single best contact list available to us — better than RE.**
- **Real-estate agents — email in progress.** DBPR `RE_rgn7.csv` = names + brokerage + address, no
  email. Emails are public record; operator is actively pursuing the Chapter 119 request + directory
  crawls. Treat RE email as solved-in-progress, not a blocker.
- **Contractors — phone + mail only.** DBPR license file = name/county/license; applicant file adds
  address + phone; no email anywhere. Fine, because the motion is lead-gen (sell them jobs by phone),
  not an email subscription.
- **Mortgage MLOs — weakest.** NMLS Consumer Access is per-record lookup only (no bulk, no email/phone;
  name + employer + company address). List = scrape-by-ZIP or buy, then enrich contact off name+company.

## 2. Channel legality — cold call / cold text (FTSA + TCPA + A2P 10DLC)

Verified against CURRENT law (crawl4ai on Fla. Stat. §501.059, §§501.601–626, FCC, Twilio A2P,
07/10/2026). **This reshapes the phone play — read it before betting on phone.** Not legal advice;
confirm the FDACS-licensing posture with FL counsel before any calling program.

**The one honest sentence:** run cold outreach on **email and direct mail** (no per-contact consent;
email obeys CAN-SPAM opt-out + honest headers); treat **SMS and phone calls as consent-gated warm
channels, never cold.**

- **Cold SMS — DEAD, both audiences.** Consumer: barred without prior express written consent
  (FTSA + TCPA). B2B: TCPA's wireless-marketing-consent rule doesn't care that it's B2B (a cell is a
  cell), AND **A2P 10DLC carrier registration blocks cold marketing SMS at the carrier layer regardless**
  — a cold campaign (no opt-in to describe) fails brand/campaign vetting and gets filtered. So having a
  phone number does NOT mean we can text it. This directly answers the operator's "phone availability"
  question: phone availability is worth far less than it looks.
- **Cold CALL — gated.** Manual live human dialing is the only clean lane (autodialer/prerecorded to a
  cell = consent-gated). B2B business lines are generally DNC-exempt; consumer calls need DNC scrub +
  8am–9pm + ID. BUT a marketing business cold-calling FL prospects likely needs a **Florida FDACS
  telemarketer license** (§§501.601–626) — the professional-license and 3-yr-B2B exemptions mostly don't
  fit a young firm. Real gate, not a footnote.
- **FCC "one-to-one consent" rule is DEAD** (vacated Jan 2025, eliminated Sept 2025). Don't build around
  it; it does not loosen cold texting.
- **Exposure:** FTSA private right of action = $500/violation, up to $1,500 willful, + attorney fees —
  the "per violation" on a texting program is what drives class actions.

**Consequences for the plays:** (a) insurance's free native EMAIL is now the crown jewel — email is the
only clean cold channel and insurance is the one vertical where we already have it; (b) the contractor
lead-gen motion cannot be "cold text/call the contractor" — it must be **direct mail, opt-in/inbound, or
a licensed calling program**; (c) direct mail is a clean cold channel everywhere, and we hold mailing
addresses for RE, insurance, and contractor-applicants.

## 3. Pain points by vertical (agent-side Reddit, this round)

### Insurance agents (r/InsuranceAgent)
- **The sub bans solicitation outright** (rule 1: "not a place to sell your services or generate
  leads"). Cold pitching insurance agents in their own spaces backfires — outreach must be value-first.
- **Cold-calling is hated even by the agents doing it**: "cold calling 100+ people a day to harass them
  … isn't a good fit." An inbound/warm alternative is wanted.
- **Captive → independent migration is a live wave**: "Captives who went independent, what caught you
  off guard?" Newly-independent agents need brand + marketing from scratch — the exact customer our
  brand-injection engine serves best.
- **Actively asking for marketing that works**: "what marketing strategies … worked?" But for many
  captive/CSR agents marketing is *secondary* to a management system + rater; the buyer who cares is the
  independent building a book.
- **Deep E&O / AI fear**: "I try to avoid AI where possible out of fear of causing an E&O claim." Any
  pitch must lead with *cited, non-hallucinated, compliance-safe* — our lint/voice-guard is the wedge.
- **Undifferentiated data fatigue**: "data vendors like Apollo, Clay … same set of signals everyone else
  is." Local SWFL data is the differentiator they don't already have.

### Mortgage loan originators (r/loanoriginators)
- **Their real client is the referral AGENT, not the consumer**: "my primary client is the real estate
  agent since they're the ones referring business." Content that helps an LO stay in front of *agents*
  may convert better than consumer-facing content.
- **They want a tangible per-property sheet for open houses**: top-voted advice is to bring a
  house-specific quote (credit score, price, FHA vs conventional side-by-side) — "something tangible."
  A co-branded local-market + rate one-pager per address is a direct fit for our deliverable engine.
- **They actively BUY leads and distrust quality**: "about to spend significant money on online lead
  generation … being sold the dream"; brokerages buy purchase-client leads and disburse to the team
  (VisionXLab). Lead-gen has a live budget here.
- **Data-ownership anxiety**: "when I leave I lost all of my referrals" → building a personal CRM. Same
  "your data stays yours" lever seen in RE (Zillow/Follow Up Boss distrust).
- **Referrals are the whole engine**: "asking everyone for referrals on almost every phone call."

### Home-services contractors (r/Contractor, r/HVAC, r/Roofing, r/Plumbing)
- **Loud anti-SaaS / anti-AI culture** — pinned rule: "No SAAS bros, no market research, no asking about
  'pain points' … especially the fucking AI that shit is trash." Do NOT sell contractors software.
- **Email-averse**: "Lol email? I can't even get them to call on the phone or sign a w9 properly." Phone
  is the channel; even that is hard.
- **But they actively resell leads**: "generating leads through my own website for waterproofing and
  passing to contractor — how much % should I charge?" Lead-gen is a native, accepted motion.
- Operational pain (change orders, scope-vs-budget, finding labor) dominates — not marketing/content.
- **Takeaway**: sell contractors *jobs* (intent leads by phone), never a content subscription.

## 4. Complementary feature ideas (strengthen what we already have)

1. **Per-property "instant local sheet"** — a one-pager for a specific address/ZIP (values, market heat,
   flood/storm risk) that an LO or agent hands out at an open house, co-branded. LOs explicitly asked for
   the tangible version. Reuses the deliverable + brand engine; near-zero new data.
2. **"Your data stays yours" positioning + a light contact vault** — answers the recurring
   lost-referrals / Zillow-distrust fear across RE + mortgage. We are NOT a CRM; position as ownership.
3. **Independent-launch kit** — captive→independent (insurance) and retail→broker (mortgage) migrants
   need brand + content from day one. Package the brand-injection engine as a "go independent" starter.
4. **Compliance-safe framing as a feature** — the E&O/Fair-Housing fear is real in insurance + RE; "every
   piece passes a compliance lint" is a differentiator worth one line (reconfirms round-4 F9).

## 5. Net-new ideas that monetize FASTER

1. **Sell the list itself (fastest cash, near-zero build).** The DFS insurance CSV is a clean, legal,
   public email+phone list. Curated Lee/Collier insurance-agent (or contractor, via phone) contact lists
   are a one-off-cash product independent of any content engine. CAN-SPAM/DNC caveats apply.
2. **Contractor intent-lead feed (lead-gen).** Permit-heating ZIPs + post-storm clusters (already in the
   lake) packaged as a weekly "hottest renovation ZIPs + the permits behind them," sold to roofers/
   restoration by phone. Validated by the lead-resale culture above. Own domain, its own paywall.
3. **LO↔agent co-marketing product (B2B2B).** Because the LO's client is the agent, sell LOs a
   co-branded local-market piece they send to their referral agents — monetizes a relationship that
   already exists, no consumer-list problem.
4. **Sponsored homeowner digest.** A neighborhood value/risk digest to a homeowner audience
   (parcel-sourced), sponsored by one roofer/insurer/agent per ZIP — flips the payer to the pro while
   the content serves the consumer. Higher build (needs the homeowner audience), park behind #1–3.

## 6. THE WEIGHTED RANKING — closest to cash first

Each play tagged with the board readiness it implies. This re-scores the board's Tier-A column.

1. **Insurance-agent outreach (subscription + list-sale).** 🟢 Closest. Reason: the ONLY vertical with a
   free native email+phone+county+class list, today. Two paths off one asset: sell the curated list
   (cash now) and/or run the content engine (local flood/storm/reserve risk = content their clients
   open). Blocked only by: channel-legality finalize (§2) + a content pack. **Do this adapter first.**
2. **Contractor intent-lead feed (lead-gen).** 🟡 Strong moat, live budget, accepted motion — but the
   channel just got harder: cold text is dead and cold calling needs an FDACS license, so delivery must
   be **direct mail, opt-in/inbound, or a licensed calling program**, not cold phone. Also blocked by a
   lead product + a backtest that the permit/storm signal precedes real jobs. Own site.
3. **RE per-seat / per-brokerage flip + horizontal proof.** 🟢 Engine is live; change the meter, and use
   it to prove the horizontal swap. Email is solved-in-progress (operator's Ch.119).
4. **Mortgage LO co-marketing (B2B2B) / open-house sheet.** 🟡 Great pain-fit, but worst reachability —
   list needs scrape+enrich. Lead with the per-property sheet feature (low build) while list-sourcing
   catches up.
5. **Sponsored homeowner digest.** 🔴 Highest build (needs homeowner audience); park.

**One-line answer to "what do we do":** build the **insurance adapter** first — it's the only vertical
we can contact for free today on every channel, and one download funds both a list-sale cash lane and a
subscription content lane. Finalize the phone/SMS legal call before touching any texting path.
