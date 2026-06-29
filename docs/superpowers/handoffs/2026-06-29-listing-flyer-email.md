# Handoff — Listing → Flyer Email (scrape + layout transform + cross-vendor cascade)

**Date:** 2026-06-29
**Status:** Server lane SHIPPED on `origin/main` (2 commits). Cross-vendor extraction proven on 2 real vendors. Comps chart NOT built. Live-verify pending.
**Check:** `listing_flyer_email_live_verify` (open)
**Spec:** `docs/superpowers/specs/2026-06-29-listing-flyer-email-design.md`
**Commits (on `origin/main`):** `9009b0c5` (flyer core), `8b55c184` (cross-vendor cascade) — hashes were rebased by a concurrent session; identify by subject `feat(email-lab): listing -> flyer …` and `feat(email-lab): cross-vendor listing extraction cascade …`.

## Why this exists (the bug)

Pasting a listing URL into the Email Lab + "describe it" returned a generic SWFL market
newsletter: one hallucinated sentence about the property, then master-dossier blocks
(New Construction / Airport Traffic / Arts & Rec / TDT) and a macro ZHVI index line
mislabeled as "similar sale prices." Root cause (read in `lib/email/build-doc.ts` +
`lib/email/og-image.ts`): the only thing touching the URL was `fetchOgImage` (it pulls
the og:image thumbnail and nothing else), and the content-fill prompt forbade
restructuring blocks. So the listing's real facts never entered the build, and there was
no flyer structure to put them in. (The "Hickory Blvd" in the bad email came from the
model reading the address out of the URL slug — proof the page body was never fetched.)

## What shipped

A listing prompt now scrapes the page for REAL facts and rebuilds the canvas as a
property flyer, brand preserved. New modules (all TDD):

- `lib/email/listing-scrape.ts` — extraction. `ListingFacts` shape + a CASCADE:
  - **Tier 1** `parseListingFacts` — the `{"id","label","value"}` spec island that IDX
    sites (beach-homes.com) hydrate from. Deterministic regex; numbers from code.
  - **Tier 2** `parseJsonLdFacts` — standard schema.org JSON-LD (`Product` /
    `SingleFamilyResidence` / `Offer`). Field names verified in-session against
    schema.org. Handles real quirks (beds as `numberOfRooms`+unitText, bare-number price).
  - **Tier 3** `llmExtractFacts` — Haiku over `htmlToText(html)` with a strict
    no-invention prompt + the `parseLlmFacts` whitelist parser. Runs ONLY when a core
    spec (price/beds/baths/sqft) is still missing AND an API key is present.
  - `mergeFacts` merges tiers: deterministic wins on conflict, LLM only fills gaps,
    photos unioned. `fetchListingFacts` = fetch (browser UA, SSRF guard reused from
    og-image) → cascade → og:image fallback for photos. Best-effort, never throws; null
    when no real fact found (caller keeps the newsletter path).
- `lib/email/listing-intent.ts` — `isListingIntent`: a URL present AND single-listing
  wording. A market ask carrying a brand URL stays a newsletter.
- `lib/email/listing-flyer.ts` — `buildListingFlyer(facts, currentDoc)`: photo → price+
  address hero → beds/baths/sqft stats → the listing's REAL description → CTA → footer.
  PRESERVES the user's brand + header/footer/agent identity (sticky). Omits any spec it
  doesn't have — never a fabricated 0.
- `lib/email/build-doc.ts` — `buildContentDoc` branches to the flyer on listing intent
  (returns `replacedLayout: true`); scrape-miss falls through to the newsletter path.
- `components/email-lab/EmailLabShell.tsx` — the existing `commit()` already swaps the
  canvas to a returned full doc with undo; added an honest "built a flyer" message on
  `replacedLayout`.

## Proven

- 19 listing tests green (`bun test lib/email/listing-*.test.ts`).
- Two REAL vendor fixtures under `lib/email/__fixtures__/`:
  - `listing-hickory-blvd.html` (beach-homes.com, island → Tier 1) — 27804 Hickory Blvd,
    $20,895,000 · 5bd · 7ba · 7,453 sqft · real remarks · real photos.
  - `listing-johnrwood.html` (johnrwood.com, JSON-LD → Tier 2) — 3412 Atlantic Circle,
    $1,299,000 · 4bd · 3,359 sqft · real remarks · cloudfront photo.
- `bunx next build` green.
- Captured via plain Node fetch = the production scrape path (crawl4ai was research only,
  NOT in the runtime).

## Reality findings (important for product direction)

- **Big portals block automated reads.** Realtor.com → 429; Homes.com → 2.3KB bot-shell;
  Zillow blocks too. A plain server fetch (all production can do) cannot read them. The
  MLS feed (`lib/reso/`, which the operator is signing up) is the path for those.
- **Agent IDX / brokerage sites plain-fetch fine** (beach-homes, John R. Wood). That is
  the realistic main case: an agent pasting their own listing.

## NOT done

1. **Scraped-comps chart** — the explicit "chart of similar home sale prices" ask. Plan
   (spec §5): derive the area page from the listing URL, scrape comparable ACTIVE
   listings, chart them cited as a bar with the subject highlighted, labeled active-vs-
   sold; flips to true RESO sold comps when MLS is connected. NO comps are charted yet —
   a listing flyer currently has no chart block.
2. **Portal confirm-facts fallback** — when a page can't be read (blocked/empty), surface
   "paste your IDX listing link or the key facts" instead of silently falling to the
   newsletter. Spec'd as future; not built.
3. **John R. Wood baths via Tier 3** — its JSON-LD omits baths; with an API key the LLM
   tier fills it from the page text ("4 full-bath"), but that path isn't fixture-tested
   (LLM is network glue). Deterministic tiers give beds/sqft/price/remarks/photos.
4. **Live-verify** — paste a real listing URL on `/email-lab` and confirm the flyer
   builds for BOTH a beach-homes URL (island) and a John R. Wood URL (JSON-LD). This is
   what closes `listing_flyer_email_live_verify` — do NOT close it on "tests pass."

## How to live-verify

1. `bun dev` (or the project's dev command), open `/email-lab`.
2. Prompt: `Just got this listing, build me an email describing it` +
   `https://www.beach-homes.com/florida/bonita-springs/27804-hickory-blvd-bonita-springs-fl-34134-lhrmls-03646837`
   → expect: canvas rebuilt as a flyer (real photo, `$20,895,000`, `5 / 7 / 7,453`, the
   real description), brand preserved, undo restores the prior email.
3. Repeat with a live John R. Wood listing URL (`/listing/<id>/…`) → expect a flyer from
   the JSON-LD path. (Listings expire — grab a current one from johnrwood.com.)
4. Confirm: NO master-dossier market blocks, NO mislabeled macro chart.

## Next steps (in order)

1. Build the comps chart (spec §5) — area-page scrape → cited bar → `upsertChartBlock`.
2. Portal confirm-facts fallback message.
3. Live-verify both vendors → close the check.
4. When MLS connects: swap the comps chart to RESO sold comps (`lib/reso/`).
