# Invention-surface guards: sold-price chain, fake-link tripwire, sole-spine rewire

> **Recommended model:** ⚡ Sonnet — 7 files

**Date:** 2026-07-02 · **Slug:** `invention-surface-guards` · **Check:** `invention_surface_guards_live_verify`
**Wave 1 of** `docs/superpowers/plans/2026-07-02-deliverable-factory-waves.md`. Evidence base:
`_AUDIT_AND_ROADMAP/# Deliverable-factory readiness — the ha.md` §2, §5.3–5.5, §4.6.

## Problem

The Latitude 26 live test proved four ways a model-built artifact can ship an invented fact even
with the number gate green:

1. **Mislabeled sold price.** `listing_transitions.sold_price` was 0 (recording lag); a model can
   print the list price as the sale price. The digits anchor (list price IS in the payload), so
   today's `gateNarrative` number gate passes it — the number is real, the label is a lie.
2. **Minted URLs.** Property ids are realtor-shaped; a URL constructed from one ("improved" CDN
   size params included) looks real and 404s. No existing lint reads hrefs.
3. **Mixed listing tables.** The email data feed (`lib/email/market-context.ts:116`) still reads
   the dead June scrape view `active_listings_residential_zip_stats` (92 listings in 34108,
   frozen) while every other surface reads the SteadyAPI sole spine (495 in 34108 live, verified
   07/02/2026). One artifact can carry both numbers. This is a stale WIRE, not a two-source
   condition — the platform has ONE listings source (`listing_state`, `source_name='api_feed'`,
   28,396 active rows live 07/02/2026); the replacement view `listing_active_stats` was built
   06/27 column-compatible for exactly this swap. 298 seed rows are still parked under
   `lifecycle_seed` — the catch-up's unresolved address-key collision cases (duplicates of spine
   rows by design).
4. **$0 binding.** The figure emitters treat 0 as a real value (`num(0)` is finite, passes
   `!= null`), so a sold/close price slot can render "$0".

Operator decisions folded in (07/02/2026): SteadyAPI is the sole listings source — never design
for two; sold price resolves by a numbered chain with a live fallback, never refused and never 0;
a user-replaceable property/website URL is that user's link authority (the resolver itself is
wave 1.5); constructed URLs are banned outright because a URL one character off 404s and nothing
can prove it live at build time.

## Goal

Close all four surfaces structurally — in code, at existing seams (RULE C2: extend `gateNarrative`
/ the compile step / the one-root pattern; no new mandatory pre-materialization gate). After this
wave a fabricated sale price, a minted link, a mixed-table figure, or a $0 price physically cannot
ship, regardless of model tier. This is the precondition for the Sonnet default flip (wave 7).

## What we're building

### A. Sold-price resolution chain (one root)

New `lib/listings/sold-price.ts`, the ONE place a sold/close price becomes display copy:

1. **Lake:** `listing_transitions.sold_price` / spine row, only when nonzero.
2. **Live recorded event:** existing `fetchSoldEvent` (`lib/listings/steadyapi.ts`) — recorded
   Sold price + date from tax history. Paid call: fires only inside a real build for the specific
   listing, never speculatively.
3. **Last list price, disclosed:** "listed at $X; closing price not yet recorded" — code-owned
   wording, price labeled as LIST, never as sale.

A 0/null price never binds a price slot at any step (0 = missing, by definition, for prices —
counts are unaffected). Result carries `{ value, kind: "sold" | "last_list", as_of, source }` so
templates and captions render the disclosure without model involvement. When wave 5 lands
recorder-side Collier sales, lane 1 improves; the chain does not change.

### B. Recorded-claim gate (extends `gateNarrative`)

In `lib/deliverable/narrative-lint.ts`, alongside the number gate: a sentence asserting a
recorded-sale figure (patterns like "sold for / closed at / sale price of / fetched $X") must
anchor its number to a **recorded-sale item** — a snapshot item whose label marks it sold/closed/
recorded — not merely to any payload number. Violation flows the existing loop: named on the one
regeneration, then hard-stripped. Same gate applied to the email author's prose lint
(`lib/email/author-doc.ts` `lintAuthoredProse`), reusing the one tokenizer — never a fork.
Sold-count phrasing ("127 homes sold") is not a price claim and is exempt.

### C. URL tripwire (post-compile lint)

Pure `lintCompiledUrls(html | caption, allowed)` in `lib/deliverable/url-lint.ts`. Every `href`/
`src` in compiled output must appear **verbatim** in the allowed set:

- payload-carried URLs (feed `listing_url`, `photo_url`, chart/hosted-image URLs minted by OUR
  code, filed source URLs),
- the brand record (logo, site, social links),
- user input (the user's own typed/saved URLs — including wave 1.5's `property_url`; the user's
  URL is that user's authority by definition),
- platform-owned hosts (swfldatagulf.com incl. unsubscribe tokens).

Enforcement is mode-split: **interactive** render (lab preview) strips the link, keeps the text,
returns a warning; **unattended** path (scheduled send, blast) fails the build loudly. Nothing
minted ever ships; nobody's mid-edit draft explodes. Wired at: grid compile output
(`lib/email/compile-grid.ts` callers), the free-tier doc render path, social caption/variants
build, deliverable narrative persist. Our renderer emits quoted attributes, so extraction is an
attribute regex — no new HTML-parser dependency (checked: none exists in package.json).

Outside anchor (crawl4ai, 07/02/2026): OWASP LLM05:2025 "Improper Output Handling"
(https://genai.owasp.org/llmrisk/llm052025-improper-output-handling/) — validate LLM output
against allowlists before it passes downstream; LLM content in email templates is a named
example. This lint is that control applied to href/src.

### D. Sole-spine rewire + mixed-table tripwire

- `lib/email/market-context.ts` swaps `active_listings_residential_zip_stats` →
  `listing_active_stats` (the column-compatible spine view). Citation label fixed in the same
  edit: "MLS active-listings" → "SWFL Data Gulf" (locked rule: listing citations never name
  vendor/MLS). Known visible effect: the spine view intentionally carries no DOM yet (06/27
  decree — no fake DOM), so the emails' "Average days on market" figure disappears until real
  DOM accumulates from SteadyAPI list dates. Correct per no-invention.
- Regression tripwire so mixing can never recur: a build-time check that all listing-inventory
  figures in one artifact carry one source tag, plus a test asserting no artifact surface
  references the dead view. Discrepancy records (if the tripwire ever fires) persist with the
  build result and log — no new UI this wave.

### E. Resolve the 298 parked duplicates

The `lifecycle_seed` stragglers are the catch-up's flagged collisions — by construction they have
an `api_feed` twin on `(address_key, sale_or_rent)`. Resolution pass via the existing catchup
collision machinery: merge anything the spine row lacks (photo, first_seen), then retire the seed
row. Idempotent SQL, row-count verified before/after. Zero SteadyAPI calls.

## Testing + verification

- Pure lints (B, C, D-tripwire) and the chain's lane logic (A) get `bun:test` coverage including
  the live-test failure cases as fixtures ($14.8M list-as-sold, constructed realtor URL, 92-vs-495
  mix, $0 sold).
- Verify with `bunx next build` (never bare tsc). Live checks (`invention_surface_guards_live_verify`)
  are operator-run; no paid calls in tests — `fetchSoldEvent` is mocked.

## Out of scope

Link resolver + photo derivative (wave 1.5, registered), brand tokens (wave 2), block vocabulary /
chart-PNG (wave 3), photo templates + shared chart specs (wave 4), Collier recorded sales + photo
arrays (wave 5), campaign object + scheduler (wave 6), golden evals + tier flip (wave 7).
