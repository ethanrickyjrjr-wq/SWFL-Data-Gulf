# HANDOFF — BUILDING THE NEXT EMAIL (2.5), AND NOT REPEATING THE LAST FOUR

**Written 08/06/2026, immediately after Under Contract (§2.4) shipped and the acceptance harness was
consolidated.** Operator: *"write handoff for next email to be newly produced so claude doesn't fuck
up every fucking email."*

**The next email is JUST SOLD** unless the operator says otherwise — it is the lifecycle successor to
Under Contract and the next address-spine recipe. If he names a different one, everything in PART A
and PART B below still applies verbatim; only PART C changes.

---

## PART A — THE ORDER OF OPERATIONS. DO NOT IMPROVISE THIS.

Every one of the four walks that produced a defect produced it by skipping a step here.

**A1. READ, IN THIS ORDER, BEFORE WRITING A LINE OF CODE.**
1. `docs/standards/email-build-playbook.md` — **PART 1 in full** (universal), then **your email's
   section in PART 2**, then **§2.1–2.4** of the four already walked. A hook blocks email edits if
   the playbook was never opened this session; that hook is not a formality, it is the record of
   three defects that were already written down before the build that re-shipped them.
2. **PART 1.12** specifically — the acceptance harness rule, written 08/06/2026.
3. The gitignored rules, **by path** (`Grep` cannot see them, and a search returning nothing is NOT
   evidence of absence):
   - `_RESEARCH/deliverable-and-design/2026-07-01-ai-deliverable-design-quality-research.md`
   - `_RESEARCH/email-and-social/2026-08-03-strongest-real-estate-email-concepts-structure.md`
   - `_RESEARCH/email-and-social/2026-08-03-email-length-and-per-type-benchmarks.md`
4. `lib/deliverable/CLAUDE.md` and `lib/email/CLAUDE.md`.
5. **The existing recipe file for your email.** All 17 keys already have a builder. You are almost
   never writing from zero — you are deciding what the walk changes. Read what is there before
   proposing to replace it.

**A2. STATE THE BUILT COUNT FIRST, COUNTED FROM CODE.** Before starting, say how many emails have a
builder (count `lib/deliverable/recipes/index.ts`) and how many have been WALKED (count the
`scripts/email/render-*.mts` files). Those are different numbers and conflating them is how a status
report lies. On 08/06/2026: 17 builders, 4 walked.

**A3. BRAINSTORM, THEN NAME THE BREAK, THEN TDD.** `superpowers:brainstorming` is mandatory before
any design. No design gets approved without a failure-modes section — every way it can break, each
paired with the guard that stops it. Then `superpowers:test-driven-development`: the failing test is
named after the failure mode it targets. **A green test suite is not a guard against an environment
hazard, a data-existence failure, or an invented claim.** Those need a validation/gate/lint, named
separately.

**A4. REGISTER THE BUILD.** `node scripts/new-build.mjs <slug> "<label>"` — spec stub plus the
`<slug>_live_verify` check in one step. Without it there is no check to close and the build is
invisible to the session loop.

**A5. RENDER IT AND LOOK AT IT.** Under Contract found **four defects by rendering and looking that
no test could see**, and one assertion that was a latent false alarm which would have fired on any
condo. Coming Soon found the doubled-name broken-logo bug the same way. Open the HTML. Look at it.

**A6. REPORT n OF N.** Never report a multi-part task without the fraction and the names of the parts
not done. Partial is fine; partial reported as whole is the defect.

---

## PART B — THE TRAPS. ALL OF THESE ARE MEASURED, NOT THEORETICAL.

**B1. DO NOT WRITE A SECOND RESOLVER.** `resolveSubject` (`recipes/shared.ts`) is the ONE inspection
point for all seven address-spine emails. A fact wired there reaches all seven at once. If your
recipe needs a fact it does not return, check first whether we are already fetching it and throwing
it away — `lotSize`, `propertyType` and `baths` all were.

**B2. DO NOT COPY A HELPER. IMPORT IT.** This is the lesson that cost 08/06/2026. `withCommas` had
**eight** copies; `clip` had three variants and the two scripts missing it still carried the bug it
was written to fix. Roots that now exist and must be imported, never re-typed:
- `lib/format-number.ts` — `withCommas`
- `scripts/email/_harness.mts` — the whole acceptance scaffold
- `lib/email/social/platforms.ts` · `lib/email/listing-flyer.ts` (`spec`, `pricePerSqft`) ·
  `lib/listings/listing-url.ts` · `lib/brand/profile-ledger.ts` (`PROJECT_CARRY_KEYS`)

**B3. BUT A PARAMETER IS NOT DUPLICATION.** The counterweight, and it bit on the same day: each
acceptance script's **default house is its own**, chosen for what that email exercises. Collapsing
them into one shared constant silently re-pointed two scripts at a different property. Consolidate
what is genuinely one thing.

**B4. BRAND OFF THE REAL ACCOUNT ROW, NEVER A HARDCODED FIXTURE.** A fixture proves the renderer and
proves nothing about whether an agent who fills in their brand actually gets it. A hardcoded fixture
hid a 17-field account-to-project drop for an entire session. `loadAccountBrand()` in the harness.

**B5. A STALE ALARM IS WORSE THAN NO ALARM.** Any diagnostic that hardcodes a list which lives
somewhere else will go stale and then report a defect that is already closed — and the next session
re-opens fixed work. Derive from the root. Coming Soon's 14-key copy of a 32-key list is the
worked example.

**B6. AN EMPTY CHART BOX IS WORSE THAN NO CHART.** Twelve of seventeen emails declare chart policy
`none`, and none means DROP the slot — `dropEmptyChartSlot` also closes the hole, because filtering
a positioned block leaves a void.

**B7. THE OPEN-SLOT CONTRACT.** A fact we cannot source is an OPEN SLOT — never a zero, never a
placeholder, never "TBD", never invented. The label is the instruction to whoever fills it, and the
label ships to the recipient once filled.

**B8. THE CLAIM GATE FAILS CLOSED AND SILENTLY.** A dropped narrator paragraph is a `console.error`
nobody reads, and its symptom — a slightly thin email — looks like nothing being wrong. The harness's
`captureNarratorDrops()` surfaces it. Use it, and check the line on every acceptance run.

**B9. ASSERT AGAINST THE RENDERED BYTES, NOT THE SOURCE DOC.** And watch for substring false alarms:
a `!lower.includes("dom")` check would have fired on **"condominium"** — 6,489 condos in the lake —
on the first condo it ever saw. Case-sensitive word boundaries for token labels.

**B10. PROVE A REFACTOR WITH A PAIRED RUN.** Old script and new script, back to back on the same live
data, byte-compare the HTML. Never against an earlier snapshot: `resolveSubject` reads a live vendor
feed, so the subject price, hero photo hash and comp set move between runs, and a stale baseline
reports a false difference. This is PART 1.12.

**B11. NEVER FETCH A LISTING PORTAL, AND NO AERIAL VIEWS.** The listing's own photo or nothing.

**B12. SPEND.** State the metered calls before running. The acceptance house is chosen for ZERO new
vendor spend; the only metered call should be the one narrator paragraph, and running without
`ANTHROPIC_API_KEY` skips even that (which also makes the render deterministic — that is how the
paired run in B10 is done).

---

## PART C — WHAT IS ALREADY KNOWN ABOUT JUST SOLD, SO IT IS NOT RE-DERIVED

Read `lib/deliverable/recipes/just-sold.ts` in full — its header already records a live probe from
07/13/2026. The load-bearing findings:

**C1. THE CLOSE PRICE IS THE ONE NUMBER THIS EMAIL EXISTS FOR, AND NO VENDOR SELLS IT TO US.**
`resolveSubjectListing` reads the FOR-SALE feed, so `facts.price` is an **ASK**. Putting it in a
"Just Sold" hero announces a close that never happened. Forbidden.

**C2. AND THE OBVIOUS SUBSTITUTE IS A TRAP.** `fetchSoldEvent` returns the property's LAST RECORDED
TRANSFER, whenever that was. Probed live: a house ACTIVE at $595,000 returns a 2023 land/teardown
transfer of $160,000. Rendering that as "Just Sold — $160,000" is a real number answering the wrong
question. **A real source is not the same as a source-faithful answer.**

**C3. THE ONLY HONEST CLOSE** is the subject's own row in its own nearby-SOLD set carrying
`priceKind === "sold"`. An AVM estimate or a last-list price can never fill this cell. Unsourced
means an OPEN SLOT the agent fills — and because county recording lags by weeks, **that is the
common case, not the edge case.**

**C4. A COMP MUST HAVE beds AND sqft OR IT IS BARE LAND.** Confirmed in this subject's own sold set:
315 Shore Dr, beds null, sqft null, $127,500. Charting bare land beside a 2,847 sq ft house makes
the close look like a steal for a fake reason. Filter BY DATA, never by guessing at a type name.

**C5. THE PAIRING RULE.** A price cell that is not the close may only appear ALONGSIDE the close,
never instead of it.

**C6. DATE GRAIN.** Every sale date we serve is MONTH grain and lags roughly seven weeks. Render
"May 2026", never "05/01/2026" — an exact day asserts precision the source does not have.

**C7. CHART.** Comps-bar, and ONLY when the close is sourced — the subject's own bar IS the point. No
close means no chart at all, and the sold-comps list still carries the context.

---

## PART D — THE ACCEPTANCE SCRIPT YOU WILL WRITE

Roughly 60 lines. Import everything from `scripts/email/_harness.mts`; write only your `rows[]`
provenance list, your assertions, and your own default house. The skeleton:

```
const ADDRESS = subjectAddress("<your own default house>");
const { brand, profile } = await loadAccountBrand();
const narratorLog = captureNarratorDrops();
const { facts } = await resolveSubject(ADDRESS, "");
const built = await buildJustSold({ facts, currentDoc: applyBrand(defaultDoc(), brand), prompt: "", scope: {} });
const doc = applyBrand(built, brand);
const rows: ProvenanceRow[] = [ /* YOUR cells, each naming the lane that filled it */ ];
printProvenance(rows);
printBottom(doc);
const { html } = await renderAndSave(doc, "just-sold-email.html");
printBrandCarry(profile);
reportAssertions("THE SOLD CONTRACT", [ /* YOUR assertions, read off `html` */ ]);
```

Pick the default house **deliberately** — for Just Sold it must be one with a REAL recorded sale in
its own comp set, or every run tests the open-slot path and the close cell is never exercised.

---

## WHAT TO CLOSE WHEN DONE

The `<slug>_live_verify` check from A4, with pasted evidence: the command and its real output, the
assertion lines, and the rendered file path. Not "tests pass" — the test line. Not "it renders" —
the run.
