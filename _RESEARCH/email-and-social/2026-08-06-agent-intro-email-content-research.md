# Agent introduction email — what it should contain (crawl4ai, 08/06/2026)

RULE 0.4 pass for the §2.8 `agent-brand-intro` walk. Not in `_RESEARCH/` already (checked
INDEX.md first) — crawled live. Google blocked the crawler (bot check); DuckDuckGo HTML search
worked.

## Source 1 — agentadvice.com, "How to Draft the Best Real Estate Introduction Emails"
https://www.agentadvice.com/blog/real-estate-introduction-emails/ (Chris Heller, Agent Advice
Editorial Board; updated 08/21/2024)

**Two distinct use cases, explicitly named** — this is the load-bearing finding:
1. Cold 1:1 outreach to a specific referred/known lead.
2. *"A great way to find new listings, but keeping them more general just to establish
   yourself as a 'go to' realtor for their particular neighborhood."*

Our recipe set already splits on exactly this line: `agent-launch` ("the letter; ONE hard
number, no chart") is (1); `agent-brand-intro` (farm area + newest listing, ZIP chart) is (2).
No redesign implied — the split matches an independently-sourced best practice.

**The anatomy of a good intro email (their 9-part outline, for case 1):**
personalized subject → greeting by name → how-I-got-your-info line → brief self-intro with a
concrete credibility result → market stats/data ("careful not to overwhelm") → urgency → one
CTA → a thank-you line → simple closing.

**Why it matters:** 78% of consumers say a company's first email influences whether they
engage (cites HubSpot); 72% trust a business more after reading positive signals (cites
Trustpilot); personalized content gets 72% more engagement (cites Mailmodo/SmarterHQ) — all
stats attributed to third parties by the source, not verified primary here.

## Applied to `agent-brand-intro.ts` (lib/deliverable/recipes/) — walked 08/06/2026

| Anatomy element | Recipe's answer |
|---|---|
| Credibility intro | Agent card `bio` — real, from the account's `agent_bio` |
| Market stats/data | ZIP-by-ZIP asking-price chart (live `listing_active_stats`) + one claim-gated paragraph |
| One CTA | Single button, "See what's for sale in `<area>`" |
| Urgency | **Deliberately absent.** The house no-invention/no-hype rule (`lib/deliverable/CLAUDE.md`
  favorable-framing policy) forbids manufacturing urgency not backed by a cited figure — a
  documented, intentional departure from the generic template, not a gap. |
| Thank-you / closing | Not present as its own line; the footer (CAN-SPAM address, socials,
  unsubscribe) is the sign-off. Minor, non-blocking — could add one sentence to the authored
  paragraph's closing slot in a future pass. |
| Personalized subject / greeting by name | N/A — this is a farm-area broadcast to a list, not a
  1:1 referred-lead email (case 2 above), so per-recipient personalization is out of scope by
  design, matching the source's own case-2 framing. |

**Conclusion:** the built recipe already matches the sourced anatomy for its own use case (case
2, area-authority intro); the one open gap (no explicit thank-you line) is cosmetic, not
structural, and is not a blocker for the §2.8 walk.

Second source (omnisend.com, "24 Essential Real Estate Email Templates for Agents (2026)")
returned nav-only content on this crawl (nothing past the header before the fetch limit) — not
used as evidence here.
