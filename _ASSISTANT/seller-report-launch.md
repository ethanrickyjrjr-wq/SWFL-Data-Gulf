# Seller Spread launch kit — 07/19/2026

The product: `/r/should-i-sell` — free honest seller read for any Lee/Collier ZIP; the
address-level spread (value estimate from recorded sales, 6/12-month hold math, Save Our
Homes portability) unlocks for $19 one-time. Live Stripe price exists
(`swfl_seller_report_once`). No account needed; buyer lands straight back on their report.

## 60-second Loom script (record on /r/should-i-sell/33904)

1. (0:00) "If you own a home in Southwest Florida, everyone's got an opinion on whether you
   should sell. Nobody shows you the numbers. This does."
2. (0:10) Scroll the free read: "This is free — your area's real stress level, the market
   snapshot, days on market, every number names its source."
3. (0:25) Type an address, hit Run my spread → lock panel: "For nineteen bucks, one time,
   no account — it values your home off actual recorded sales nearby, then lays out line by
   line what holding 6 or 12 more months costs or gains you on YOUR area's own trend."
4. (0:45) "The part most sellers miss — your Save Our Homes tax cap and what portability
   actually does to your next tax bill. It's in there."
5. (0:55) "swfldatagulf.com/r/should-i-sell. Type your ZIP. The honest read is free."

## Socials (post as-is or trim)

**Facebook (Cape Coral / Fort Myers / Naples groups — post the ZIP link, not the homepage):**
Thinking about selling your house in [Cape Coral]? I built a thing that gives you the honest
read for your ZIP — how stressed sellers around you actually are, real days-on-market, and
what waiting 6–12 months could cost or gain you. The area read is free, no signup:
swfldatagulf.com/r/should-i-sell/[33904] — would love to know if it matches what you're seeing.

**X/Twitter:**
The scoring industry grades SWFL sellers and never shows them the score. So we did.
Free honest seller read for any Lee/Collier ZIP — stress level, market snapshot, cited
sources. Your address-level sell-now-vs-wait spread: $19, no account.
swfldatagulf.com/r/should-i-sell

**Nextdoor (highest-intent audience for this):**
For the neighbors wondering about the market: I made a free page that shows our ZIP's real
seller picture — days on market, price trend, how many listings are cutting. No realtor
pitch, every number cites its source. swfldatagulf.com/r/should-i-sell/[ZIP]

**LinkedIn:**
Sellers get scored by the industry and never see the score. We flipped it: a seller-facing
read built on recorded sales, county parcel data, and published market feeds — free at the
ZIP level, $19 for the address-level spread (value estimate off real comps + the
sell-now-vs-wait math + Save Our Homes portability). swfldatagulf.com/r/should-i-sell

## The 10-buyers play (tonight → morning)

1. Deploy (push main → Vercel).
2. One real Loom on a real ZIP; pin it everywhere.
3. Post the Facebook version in 3–5 local groups + Nextdoor (owner-occupant heavy).
4. Reply to every comment with the person's OWN ZIP link — the free read converts.
5. Morning: check Stripe dashboard → payments; every buyer email gets a personal thank-you
   + "what was missing?" (their answers are the roadmap).

## Levers (one file each)

- Price: `lib/billing/tiers.ts` `SELLER_REPORT.priceUsd` (Stripe price must be re-created on
  change — `scripts/stripe/setup-report-product.mts` pattern, lookup key transfers).
- Copy on the lock panel: `components/should-i-sell/UnlockSpread.tsx`.
- Unlock window (30 days/device): `lib/billing/report-unlock.ts`.
