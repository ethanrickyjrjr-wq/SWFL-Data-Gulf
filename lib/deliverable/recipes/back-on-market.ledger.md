# back-on-market — coverage ledger

What this recipe's tests actually hold down, and what they do not. Rewritten 08/06/2026 when
property mode was collapsed onto `buildListingFlyer`.

## Enforced

- **PROPERTY mode is the new-listing flyer, not a lookalike.** It calls `buildListingFlyer`
  and turns two dials (ribbon word, CTA label). The strip, the description block, the
  `$/Sq Ft` emphasis ruling and the link ladder are inherited, so the two emails cannot
  drift. Pinned by the strip-order test (`beds · baths · sq ft · lot · $/sq ft · type`).
- **The three deletions each have a red test.** No "Days Off" cell anywhere; no
  cancellation-rate prose (local OR national) in the rendered bytes; no homepage behind the
  CTA. Asserting ABSENCE, not "exactly once" — the stronger guard.
- **The status budget on a single-address email is the ribbon plus the subject line.** Both
  are pinned. Nothing else may re-explain the status.
- **`BACK_ON_MARKET_PROHIBITIONS` binds BOTH modes**, asserted on the RENDERED HTML, never
  the source (the constant itself contains the word "stigmatized" and a source scan would
  self-fail).
- **The narrator leak guard, on two REAL captured outputs.** Narration that TRAILS the real
  paragraph is dropped and the paragraph kept; a bracketed placeholder costs its SENTENCE,
  not the whole paragraph; an all-narration response leaves the slot OPEN.
- **AREA mode keeps its rates and its NUMBER-ONCE discipline** — hero only, never restated.

## Surprises worth keeping

- **Order is load-bearing in `stripReasoningPreamble`: brackets first, THEN the noise test.**
  A bracketed placeholder usually reads like narration — `[year not provided]` contains the
  literal phrase "not provided" — so testing for noise first classified the whole paragraph
  as narration and threw away the good sentences with the bad clause. Cut the clause, then
  judge what is left. There is a test named for this.
- **The first version of that guard was written for the inverse bug and made it worse.** It
  took the LAST segment after a `---` rule, assuming narration always led. The very next
  live render put the real description first and an apology last, so it kept the apology and
  binned the description — and the email shipped with no prose at all. Position is not the
  signal. Shape is.
- **`secondSpecRow(facts, false)` still emits a labelled EMPTY Type cell.** That is an open
  slot on the canvas (absent from the sent email), not a duplicate. Assert on
  `label === "Type" && value`, never on the cell count.

## Unenforced / known gaps

- **No relist address we hold carries a description TODAY — but it is one paid fetch away,
  not a dead end.** Counted live 08/06/2026: **102 relist events (`holding → active`,
  `days_off_market >= 7`) in `data_lake.listing_transitions`, ZERO of their addresses carry a
  row in `data_lake.apify_property_records`** (383 rows in the lake, none of them a relist).
  `data-roots.md` §"Comp PHOTOS + the listing DESCRIPTION" is the catalog authority: the
  description root is `ListingFacts.remarks` with the Apify `text` field as the paid lane-2
  fallback, and **the vendor populates `text` for for_sale/pending listings** — a relist is
  ACTIVE, so the vendor holds one. This is RULE 0.7a rung 3 (a paid call for ONE specific
  missing field, behind the spend switch), i.e. an operator spend decision, NOT missing data.
  Check: `back_on_market_no_paid_row_for_any_relist`.
- **A fact-poor house can ship with NO agent-authored prose.** On 13501 Brown Bear Run the
  claim gate correctly dropped the paragraph on repeated runs (invented "office", "2400",
  "under 2 [miles]"). `NARRATOR_ATTEMPTS = 2` halves the empty rate and then stops — we do
  not lower the gate to fill a slot. §1.9's 50-word body floor is therefore not guaranteed.
  Check: `back_on_market_wordless_on_fact_poor_house`.
- **The narrator leak guard is a LOCAL BACKSTOP, not the fix.** Every listing-lifecycle
  recipe calls the same `authorListingNarrative` and can hit the same leak. Check:
  `shared_narrator_leaks_reasoning_preamble`.
- **`shortType` passes the free spine's "Residential" through unmapped**, so the Type cell
  can read "Residential" rather than a real property type. Pre-existing, all seven emails.
  Check: `listing_type_cell_prints_raw_Residential`.
- **AREA mode has never been rendered and looked at.** Covered by tests only. Check:
  `back_on_market_area_mode_never_rendered`.
- **The house paragraph is a LIVE Sonnet call on every build**, unlike the `/r/` pages which
  read baked, validated prose via `loadNarrative`. Every baked surface today is AREA-grain
  (`zip`, `brain`, `corridor`, `area-email`), so the bake can absorb this recipe's AREA mode
  but not its per-listing paragraph — that would need a per-LISTING cache keyed on
  `address_key + inputs_hash`. Not a decision to make silently.
