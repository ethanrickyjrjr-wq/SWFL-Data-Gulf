# 20 PAYING USERS — MORNING LAUNCH KIT (07/19/2026, LOCAL ONLY — this folder never ships to GitHub)

> Every number in this file is sourced: pricing from `lib/billing/tiers.ts` (the one price root),
> pain numbers from `STEADY-PAINS.md` (each carries its research citation), incident numbers from
> `SESSION_LOG.md`. Nothing invented. Where a planning assumption appears it is labeled YOUR CALL.

---

## 0. THE BLUNT TRUTH FIRST

A paying user = someone who signs in, hits /billing, and subscribes. Starter $19/mo (500 sends),
Growth $79 (2,000), Pro $149 (10,000). Free tier = 50 sends/mo. Builds are free; SEND is the
paywall — that's the locked model and it's the right one for this play.

I cannot press send on the channels that produce 20 paid by morning: your phone, your Facebook
account, your sphere, a Loom recording of your voice, or the 21k DBPR list you parked. What I did
tonight: unbroke the funnel (§7), verified money can flow (§1), and wrote everything below so that
from wake-up to first ask is under 15 minutes. The 20 come from asks. 20 × $19 = $380/mo MRR.
If 1 in 4 warm asks converts — YOUR CALL whether that's realistic for your sphere — you need ~80
asks. That's a morning of texting people you actually know, not a marketing campaign.

---

## 1. PRE-FLIGHT (5 minutes, before any ask goes out)

1. STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET are set in Vercel Production (verified tonight,
   names only). Do ONE live click-through: /billing → Starter → confirm the Stripe hosted
   checkout page loads with $19. If it loads, price lookup keys + session creation work
   end-to-end. Don't pay — loading the page is the proof.
2. Deploy is on latest main — the funnel fixes (§7) are committed but NOT pushed. Say push and
   it goes (commit 4d27b1c9, one command).
3. Record the Loom (§3). One take is fine. Rough is fine. Rough is on-brand for the story.

---

## 2. THE OFFER (say it this way, everywhere)

Agent-facing (the one that pays):
"Client emails where every number is cited to its source — live Lee + Collier data, built in
about two minutes. Building is free. Sending is free up to 50 a month. $19 a month for 500."

Seller-facing (the free hook that feeds it):
"An entire industry scores how likely you are to sell — and shows the score to everyone except
you. I built the version that faces YOU. Free honest read for your ZIP."

Founding-20 sweetener — YOUR CALL, needs nothing built: "First 20 subscribers keep $19 forever
and I personally build your first three sends with you." Concierge onboarding costs you time,
not code, and converts warm asks harder than any feature.

---

## 3. LOOM SCRIPT (~90 seconds, shot-by-shot)

1. (0:00) /r/should-i-sell — type 33904. "This is what a Cape Coral seller sees. Free."
2. (0:15) The stress read. "Homebot scores 8 million homeowners on how likely they are to sell —
   the score shows on the agent's screen, never the homeowner's. CoreLogic sells one. Datazapp
   sells one for 4 cents a record to nine kinds of buyers — none of them the person it describes.
   This page faces it to the seller. Delistings, price cuts, cancellations, their ZIP."
3. (0:35) Highlight a number on the page → the ask-AI panel answers with the citation. "Every
   number traces to a source. Highlight it, ask it."
4. (0:50) Email lab. Build a market-update email, drop in a chart. "Two minutes. Your brand.
   Same cited numbers — nothing in this email is made up, and it can't be."
5. (1:15) /billing. "Build free. 50 sends a month free. $19 for 500. That's the whole pitch."
CTA: "Reply with your ZIP and I'll build yours first."

---

## 4. THE POSTS (copy-paste; links go to swfldatagulf.com)

### 4a. Agent-facing — FB realtor groups (Lee/Collier), LinkedIn
Subject line of the pitch is the whitespace itself:

"The seller-scoring industry has a rule: never show the seller. Homebot scores 8M+ homeowners
on likelihood-to-sell — displayed on the agent's clients tab. CoreLogic's Sell Score is a
searchable MLS field for farming. Datazapp sells a Home Seller Score to agents, lenders,
investors, even roofers — everyone except the homeowner it describes.

I built the opposite for Southwest Florida: a free, honest seller read per ZIP — delistings,
price cuts, cancellations, what waiting costs — every number cited to its source. And for
agents: client emails built from the same live Lee + Collier data, where every figure carries
its citation. Build free. $19/mo if you send more than 50.

[Loom link] — 90 seconds. First 20 get me personally building their first sends."

### 4b. Seller-facing — FB neighborhood groups, Nextdoor (Cape Coral / Fort Myers / Naples)
Lead with the insurance pain — it's the emotional center of every SWFL seller thread:

"Florida homeowners insurance is up 102% in three years (Insurance Information Institute) —
about triple the national average. SWFL median premium is up 72% since 2020. If you're sitting
on a house wondering whether to sell now or wait 12 months, the data that answers that question
exists — it's just normally sold to agents and investors, not shown to you.

I built a free read for any Lee or Collier ZIP: how many listings near you are cutting price,
getting delisted, falling out of contract — and what waiting could cost or gain. No signup to
look. swfldatagulf.com/r/should-i-sell"

(Redfin's own data for ammo in comments: a record 112,788 U.S. delistings in one December,
~45,000 relisted the next month. Nobody tracks what happened to them. We do, for SWFL.)

### 4c. The receipts post — X / LinkedIn (the "AI screwed me" build-in-public angle)
This is your true story from last night and it will outperform any product post. Facts only,
all from the incident log:

"At 4:23 AM a nightly AI-driven job wiped 17,127 records of vendor data out of my database —
listing dates I'd spent 15 hours backfilling the day before. The run fired from a workflow that
was supposedly DISABLED.

I spent the day doing a point-in-time restore instead of building. This is what nobody tells
you about building with AI agents: the demo is magic, the 4 AM cron is a loaded gun.

Here's the thing though — the product survived because of the one rule I never let the AI break:
every number a user sees must trace to a real source. When your data layer is built paranoid,
even a wipe is recoverable. The tool: swfldatagulf.com — cited-data market reads for SWFL.
[screenshot of the incident log entry]"

Thread continuation if it moves: what the guard was, what the restore looked like, what shipped
anyway. Rage sells; receipts convert. You have both, and every word is documented.

### 4d. Reddit (r/RealEstate / r/SWFL-adjacent) — DO NOT post a link cold.
Comment value first (the hand-typed-dashboard thread proved sellers beg for exactly our output:
months of inventory, DOM, sale-to-list, share taking cuts — "Dude. Thank you." is a real quote).
Answer with the numbers, offer "DM me and I'll pull your ZIP" — link only when asked.

---

## 5. THE DM / TEXT (the channel that actually gets 20 by tonight)

To an agent you know (text, not email):
"Morning [name] — I built something and you're one of 20 people I'm asking. Client emails from
live Lee+Collier data, every number cited, your brand, ~2 min to build. Free to try, $19/mo if
you send real volume. 90-sec video: [Loom]. If you're in this week I'll build your first three
sends with you. In?"

Follow-up (same day, non-converters): "No pressure — send me a ZIP you farm and I'll text you
back the seller-stress read for it. Takes me 30 seconds." (The product demo IS the follow-up.)

Who's on the list: every agent/broker/lender/title/insurance contact in your phone in Lee +
Collier. The pitch to lenders is identical — they send client emails too, and Homebot's whole
8M-homeowner business is built on loan officers, which means loan officers already PAY for this
category.

---

## 6. THE LEVER I CAN'T PULL (say the word)

The 21k DBPR licensee list is parked — your park, your lift. Cold outreach is settled policy
(separate non-Resend provider, separate domain, opt-out already built) but the provider account
and domain aren't wired, and that's account-creation + DNS I can't do without you. If the warm
sphere gets you 8 instead of 20, this list is the only channel with the volume to close the gap
— lift it and next session wires the provider end-to-end.

---

## 7. WHAT GOT FIXED TONIGHT (so the asks don't land on a broken funnel)

- Seller Tools no longer wedged between Insiders and Desk — marquee run restored, Seller Tools
  rides after Alerts (nav order guard updated, 31/31 tests pass).
- /r pages are now reachable: footer links (Should I Sell? / Back on Market / Housing Report),
  /r hub has a 3-card report directory next to the search box, and the sitemap finally lists
  /r, /r/should-i-sell, /r/back-on-market — until tonight they had ZERO crawler path.
- Full production build green. Back on Market's flush-left rendering was already fixed 07/18 —
  safe to send traffic.
- Committed (4d27b1c9), NOT pushed — push on your word.
- Still open (check filed): per-ZIP permalinks (/r/should-i-sell/[zip]) into the sitemap — the
  long-tail SEO play, next session's build.

---

## 8. THE MORNING RUN-SHEET

07:00 — pre-flight (§1): checkout click-through, say "push", record Loom.
07:20 — 20 texts out (§5). Personal, one at a time, name first.
08:00 — 4a into 2–3 Lee/Collier realtor FB groups. 4b into 2–3 neighborhood groups + Nextdoor.
08:30 — 4c receipts post on X + LinkedIn with the incident screenshot.
Through the day — every reply gets the ZIP read built FOR them within the hour (the concierge
close). Track paid count in the Stripe dashboard, live.
Evening — count. Short of 20 → §6 is the conversation.
