# Handoff — COMING SOON (§2.2), next in the playbook walk

**For whoever picks this up next (Opus or otherwise). Written 08/05/2026, same session that
built and walked New Listing (§2.1).** Read `docs/standards/email-build-playbook.md` §2.1 first —
this recipe reuses its infrastructure almost entirely. Do not re-derive anything §2.1 already
proved; extend it.

---

## 0. THE EXACT RECIPE — where this goes, no ambiguity

- **Code:** `lib/deliverable/recipes/coming-soon.ts` (651 lines — this is NOT a blank-slate
  build, it is ALREADY WRITTEN and fairly mature). Registry key: `"coming-soon"`
  (`lib/deliverable/recipes.ts:191`).
- **Playbook target:** `docs/standards/email-build-playbook.md`, replace the `## 2.2 – 2.17 —
  TO BE WALKED` line with a real `## 2.2 COMING SOON — tag \`coming-soon\`` section, same
  six-subsection shape as §2.1 (2.2.0 reproduce-it, 2.2.1 suppliers, 2.2.2 ingredient ladder,
  2.2.3 site doors, 2.2.4 defects found, 2.2.5 known gaps). **Do not pre-fill §2.3–2.17 from
  memory or by copying this one** — the playbook says so explicitly, and it's right: each
  email's sourcing gets decided deliberately, one at a time.
- **Shared machinery it inherits from New Listing, verified tonight, do not rebuild:**
  `resolveSubject` (`lib/deliverable/recipes/shared.ts`) for house resolution, the same
  four-supplier hierarchy (free spine → our own tables → SteadyAPI → paid Apify row already on
  disk), the same `buildLifecycleEmail` chrome, the same claim-gated narrator
  (`authorListingNarrative`).

## 1. WHY THIS ONE, NOT ANOTHER — the actual state of the 19 recipes

Checked file sizes across `lib/deliverable/recipes/*.ts` before picking this. **Every recipe
already has real code** — this platform is not starting from stubs. What's actually missing for
every recipe except New Listing is the WALK: the ingredient census, the sourced fallback ladder
written down, the site-door inventory, and a reproducible acceptance-run script — the same
treatment §2.1 got tonight. That is the work. Do not mistake "the file already has 651 lines" for
"nothing to do here" — read on for what's real and unverified.

## 2. WHAT THIS RECIPE ALREADY DOES (read the code comments in full — they are honest and
   detailed) — do not re-derive, verify and document

- **Same chrome as every lifecycle email** (`buildLifecycleEmail`) — ribbon "Coming Soon", hero
  centred with the CITY (not the address) over the price, spec strip, narrator, agent card, CTA.
- **Address suppression is structural, not a prompt request** — the street/house-number/ZIP never
  reach the hero, photo alt, subject, CTA url, or the model's fact sheet (`teaserFacts`), and the
  model's OUTPUT is also redacted and claim-gate-dropped if it still leaks
  (`redactStreetLine`/`leaksStreet`). **This is the one thing this recipe cannot get wrong — verify
  it live before anything else**, the same way §2.1's acceptance run proved its own numbers.
- **Geography ships at the community/city/county grain only**, written by CODE not the model —
  community in the prose, city in the hero, county in the scarcity block.
- **The scarcity strip + funnel chart** (`scarcityBand`, `scarcityStats`, `scarcityChartSpec`,
  `scarcityOpenSlots`) — a three-tier funnel (all active homes → in this price range → beds+size
  match), COUNTY-grain, built from active-listing counts. **This is the one genuinely new data
  shape New Listing never needed** — walk where its counts actually come from (which table, what
  fill rate, what happens when the county has too few active listings to make a funnel meaningful)
  and write it into §2.2.1/§2.2.2 with real counts, the same way §2.1.1 counted the four suppliers
  live instead of trusting a comment.

## 3. THE ACTUAL WORK — do these, in order

1. **Write and run the acceptance script**, mirroring `scripts/email/render-new-listing.mts`:
   `scripts/email/render-coming-soon.mts`. Same contract — drives the real pipe end to end, prints
   a per-cell provenance table, picks a real address off a live join (a house that exercises the
   scarcity funnel with real, non-degenerate counts — check the county has enough active listings
   in-band before picking one, or the funnel chart is an open slot on the very house chosen to
   prove it works).
2. **Live-verify the suppression contract**, not by reading the code and trusting the comments —
   render a real house and grep the output HTML for the street number and ZIP. Zero tolerance:
   any leak is the finding of the whole walk, not a footnote.
3. **Count the scarcity funnel's real fill rate** — how many counties/price-bands produce a
   funnel with all three tiers real vs. degenerate (e.g., 0 or 1 homes in-band, which makes
   "how few homes like this" a meaningless or embarrassing claim). Name the floor below which the
   chart should drop to open slots rather than print a funnel of 1.
4. **Cheapest-first, Apify only where nothing free exists** — same discipline as §2.1: the free
   daily-sweep spine and our own tables are lane 1/2 (zero marginal cost, one is already a live
   query, the other reads a row we've already bought), SteadyAPI live calls are lane 3, a NEW paid
   Apify call is lane 4 and only when the first three are exhausted for a field New Listing already
   proved is genuinely Apify-only (year built, HOA, gallery, description — same census as §2.1.1,
   reuse those numbers, don't re-derive them for the same fields on the same paid-record table).
5. **Fallbacks: every ingredient gets a stop-at-first-hit ladder, written down**, exactly the
   §2.1.2 format: field → lane 1 → lane 2 → ... → OPEN SLOT. Never a guess, never a zero standing
   in for "we don't know."
6. **Fonts — already fixed tonight, inherit it, do not touch it again.** `lib/brand/fonts.ts`
   MONTSERRAT_SANS/LATO_SANS both carry live-verified `webfontUrl`s (network-checked 08/05/2026 —
   both loaded 200 OK in a real browser render), and MONTSERRAT_SANS's fallback stack was just
   corrected from two legacy desktop fonts (`'Century Gothic', 'Trebuchet MS'` — absent on
   mobile/Gmail) to a real system-font stack. This is shared chrome — Coming Soon gets it for
   free through `buildLifecycleEmail` + `applyBrand`. **Do not hardcode a font anywhere in
   `coming-soon.ts`** — if a demo/acceptance script needs a brand fixture, reuse the existing
   Dani Vero / Cast & Coast Realty fixture pattern from `render-new-listing.mts`, don't invent a
   second fictional agent.
7. **Open a check** the same way tonight's did: `node scripts/check.mjs open email
   coming_soon_live_verify "..." --class verify` before calling this done, and close it only with
   a pasted acceptance-run output, not an assertion.

## 4. FAILURE MODES — named before building, per RULE 3.5

- A degenerate scarcity funnel (0 or 1 homes matching) prints a claim that reads as false or
  embarrassing. Guard: a minimum in-band count before the chart renders; below it, open slot.
- The suppression contract regressing silently (a future edit adds a field to `teaserFacts` that
  re-includes address grain). Guard: a red test asserting the street/ZIP never appear in rendered
  output for a real address — check whether `coming-soon.test.ts` (362 lines, already exists)
  already covers this before writing a new one.
- The narrator paragraph failing the claim gate non-deterministically, same as New Listing's
  narrator tonight (see open check `new_listing_narrator_claim_gate_nondeterministic` —
  `authorListingNarrative` is SHARED code, so this risk is inherited, not new to Coming Soon).
  Don't re-diagnose it here; link back to that check instead of opening a duplicate.

## 5. WHAT NOT TO DO

- Don't rebuild the chrome, the narrator, the claim gate, or the four-supplier hierarchy — all
  shared, all proven tonight against New Listing.
- Don't invent a second demo agent fixture.
- Don't pre-write §2.3–2.17. One at a time, per the playbook's own rule.
- Don't touch `lib/brand/fonts.ts` again without a live re-verification (crawl4ai caniemail.com,
  or a real browser network check) — it was already re-verified tonight, not from memory.
