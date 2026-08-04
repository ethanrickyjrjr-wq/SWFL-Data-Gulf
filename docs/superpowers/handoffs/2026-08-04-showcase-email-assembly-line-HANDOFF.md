# HANDOFF — code EVERY email to one Common Foundation, then one coded lane each

**To:** an Opus session starting cold.
**From:** Opus 5, 08/04/2026.
**Your job:** write the per-email plan. One plan per email type. Do NOT start building until the
operator walks them with you — he asked for the map before the build, four times now.

**Everything below was verified in-session against code, the catalog, the live database, or our own
research. Where something is a CLAIM and not a measurement, it says so. Do not promote a claim to a
fact without re-running the check — the numbers in a prior plan were wrong twice this week.**

---

## 0. THE DECREE — the operator's own words, do not re-derive them

He has restated this design four times (`_ASSISTANT/SCRATCHPAD.md`, 08/04/2026). Build against these
seven lines; do not answer them with a new design.

1. Every entry button carries a TAG for what it is ("Listing Email"), wherever it is clicked —
   showcase, homepage, anywhere. The user lands on the email grid; the tagged click goes to
   COMMON FOUNDATION in the background.
2. Common Foundation stamps the proper header + footer, READS THE TAG, and sends it down that tag's
   pipeline.
3. Each pipeline holds that email's coded format — cards, fonts, which chart, and EXACTLY where each
   one goes. The doc is stamped with its grid BEFORE any data arrives.
4. Then it moves down the pipe to be FILLED — Apify / brains / lake / whatever wire runs to that
   coded slot — keyed off the address.
5. Buttons auto-wire to the brand links the user gave us.
6. The AI builder gets the numbers and the property description and writes COMMENTARY ONLY —
   positive, agent-voice, the way the research says. It may change the chart or anything else ON
   REQUEST. It needs page awareness and grid awareness.
7. SAME PROCESS FOR EVERY EMAIL. The ONLY difference is the split after Common Foundation.

Cost posture, verbatim: *"we figure out the fastest easiest way to do it and record it, then we
determine the cheapest and run the cheapest until we can afford the best, but always have a fallback
and spend when we have to."*

---

## 1. READ THESE FIRST — and the rules are GITIGNORED

`_RESEARCH/` never ships. **A repo-wide Grep returns nothing for it. That is not absence** — it is
the exact reason the foundation research went unread for a month. Open by path with Read:

- `_RESEARCH/deliverable-and-design/2026-07-01-ai-deliverable-design-quality-research.md` — §1.1
  internal ≤ external spacing (the real evenness rule, ⚠ UNBUILT); §1.2 avoid small differences
  between type steps; §1.3 closed enums + a linter (✅ shipped 08/04/2026); §2.1 chart type by data
  shape; §2.2 WCAG 4.5:1 text / 3:1 large / 3:1 non-text.
- `_RESEARCH/email-and-social/2026-08-03-strongest-real-estate-email-concepts-structure.md` — the
  5-part skeleton, subject taxonomy, market-report content order, and Part D render constraints.
  **Part A carries the reference shape for the report grammar we do not have** (see §5).
- `_RESEARCH/email-and-social/2026-08-03-email-length-and-per-type-benchmarks.md` — 50–125 words,
  1–3 questions, 3rd-grade level; the FLOOR bites harder than the ceiling.
- `_RESEARCH/email-and-social/2026-08-03-button-link-mechanics.md` — 42–72px, never an image-based
  button, and why a homepage fallback is a deliverability violation.
- `_RESEARCH/competitor-and-strategy/2026-08-03-apify-actor-fit-assessment.md` — **the ADDENDUM is
  the load-bearing part for this job** (measured Apify economics, §3).
- `_RESEARCH/data-and-ingest/2026-08-02-property-tax-history-full-scope.md` — 64 field paths in a
  response we ALREADY PAY FOR; we persist 3.
- `_RESEARCH/real-estate-market/2026-07-01-listing-lifecycle-marketing-research.md` — the stage
  sequence the lanes map onto.

Then the code roots: `docs/standards/emails.md` §00 (the pipe + the corrected mind map), §0.0 (step
zero), §4 (the design system); `lib/email/CLAUDE.md`; `docs/standards/data-roots.md` **top section**;
`ingest/cadence_registry.yaml` `source_scope:` blocks.

---

## 2. VERIFIED STATE — what is already true, with the evidence

**Common Foundation already works, for listings.** Three recipes built in-process, 08/04/2026:

```
new-listing    seam: true  blocks: 9
price-reduced  seam: true  blocks: 9
just-sold      seam: true  blocks: 9
header@0,0 12x2 | hero@0,2 12x1 | image@0,3 12x6 | hero@0,9 12x4 |
stats@0,13 12x3 | text@0,16 12x4 | agent-card@0,20 7x4 | button@7,20 5x2 | footer@0,24 12x3
```

Byte-identical geometry. Only printed values differ. **The operator's design is not hypothetical —
it is running for one family.** The job is moving the rest onto it.

**The tag already travels.** `planArrival` run live with four inputs, 08/04/2026: every `recipe=`
tag returns `{"kind":"blank"}` (instant blank grid for the user) while the tag itself continues to
`authorDoc`, which resolves the recipe. A bare `zip=` returns `{"kind":"zip"}`. Doors are built by
`lib/lab-entry/destination.ts` and a test fails the suite on any raw hand-typed lab URL, so no
button can bypass the tag.

**Buttons already auto-wire, keyed by ROLE not by button** (`lib/email/button-destinations.ts`), so
a community button and a booking button hold different saved URLs and survive a relabel. `listing`
and `community` refuse a homepage fallback — Gmail's sender guidelines require the recipient know
what to expect on click.

**The type scale is now enforced** (commit `ea8a6ea5`, 08/04/2026).
`lib/email/blocks/type-conformance.test.ts` fails on any raw `fontSize` / `fontWeight` /
`lineHeight` in a block component. It caught 11 violations, two shipping to inboxes. `text(role)`
returns size + leading + weight together and is the only legal way to size text.

**AI page awareness: YES. Grid awareness: NO.** `docSkeleton` (`lib/email/build-doc.ts:354`) hands
the model every block's id, text, open slots, and the held figures — price, beds, baths, sqft,
address, metric values. It does NOT hand it `x/y/w/h`. **Decree item 6 says the builder needs grid
awareness; today it has page awareness only.** Closing that is a small addition to `docSkeleton`,
not a rebuild — but it is UNBUILT, do not assume it.

**The lane split as of 08/04/2026 — VERIFY THE COUNTS YOURSELF, do not quote these.** Grep
`buildLifecycleEmail` and `finalizeDoc(` tree-wide. Last count: 8 recipes on the shared chrome
(new-listing via the `buildListingFlyer` thin wrapper, coming-soon, open-house, price-reduced,
under-contract, just-sold, market-comps, back-on-market); 6 hand-building their own chrome then
calling the seam (agent-brand-intro, community-info, listings-digest, listings-showcase,
review-reply, sphere-weekly); 2 never calling the seam at all (`agent-launch.ts`, `market-pulse.ts`);
`showing-prep-doc.ts` doing both; plus `default-grid` as the terminal fallback.

---

## 3. THE DATA QUESTION — the operator asked it, here is the measured answer

He asked: *"should we just be using Apify for most builds or what do we actually need to combine."*

**Live SQL, 08/04/2026, the answer is no — Apify is not the spine today, and the gap is enormous:**

```
apify_property_records:  26 rows / 20 distinct properties
listing_state:           35,202 rows
data_lake tables:        16 total — 1 apify, 15 steadyapi
```

**Twenty properties.** Any plan that assumes "Apify brings in everything" is planning against a
cache that is effectively empty. The SteadyAPI-fed lake is the substantial holding. Say this to the
operator plainly — he has *"seen reports on apify bringing in everything,"* and for a single
on-demand call that is close to true, but **we have not stored it.**

**What Apify genuinely wins at (measured, from the fit-assessment ADDENDUM, ~$0.80 spent live
08/03/2026):**
- `moving_beacon-owner1/realtor-com-property-scraper`, **$0.01/result** — takes explicit
  `date_from`/`date_to`, verified reaching 06/2025 (14 months back). Returns sold_price, beds,
  full_baths/half_baths, sqft, county, tax_history, agent/broker contacts, and **`alt_photos` — the
  FULL gallery, 50 photos on one home.**
- `one-api/realtor-property-scraper`, **$0.007/result** — its `Raw.details.text` is the **3,000-char
  full MLS description on an ALREADY-SOLD home.**
- rdcpix photo rot falsified at 5 months (HTTP 200).
- 2 of 5 store actors tested were junk (scrapeworks failed 2/2, grimnir returned 0 items). Do not
  assume a store actor works — test it.
- Our own actor `swfl-market-pulse` measured **$0.000665/run** (~1,500 runs per dollar).

**What the lake wins at:** everything already paid for. Quota is 50k/month at 1 req/s. And the
`/property-tax-history` families are **already landed and typed** — verified by direct row count,
08/04/2026:

```
steadyapi_property_history_raw:  17,875 rows — the FULL response body in jsonb
steadyapi_tax_history:          273,051 rows / 14 cols — 9-yr tax + assessment + market value
steadyapi_property_permits:      79,281 rows / 14 cols — permit type/project/status/date
steadyapi_listing_events:       235,383 rows / 22 cols — per-event price cuts, days_after_listed,
                                                          source_name MLS board, status-change dates
```

**READ THIS BEFORE YOU PLAN ANY PAID CALL.** An earlier draft of this handoff said we persist 3 of
64 field paths and throw the rest away. **That was FALSE** — it was quoted from a
`source_ceiling.summary` in `ingest/cadence_registry.yaml` still dated 08/02/2026, two days after
the fix shipped, while the registry's own comments twenty lines below it recorded the tables being
built. The summary has since been corrected. **The lesson is the one this whole session keeps
hitting: a summary describes the state its author saw. Re-derive from the live source before you
plan against it.** Raw bodies are retained, so any field still unparsed costs ZERO paid calls to
reach — re-census the raw body to see what's left (`statistics{}` / `meta{}` rollups had no typed
table as of this writing). Brokerage and agent fields are a genuine vendor ceiling — zero across all
18 endpoints.

### 3b. APIFY FULL-SCOPE — operator decree 08/04/2026

Verbatim: *"Make sure we are bringing everything from apify, as well. Leave nothing on the table.
I would rather delete than spend money and not get."*

This is FULL-SCOPE-FIRST (root `CLAUDE.md`) applied to a PAID, PER-CALL source, where the cost of
under-pulling is real money rather than a re-run. **The rule: never spend a paid call without
landing the ENTIRE response body, and never spend the same call twice.**

Measured live 08/04/2026 — the storage design is already right, the volume is not:

```
apify_property_records: 46 columns, and critically it keeps
  raw          jsonb  — the FULL response body
  alt_photos   jsonb  — the full gallery, not just a primary
  description  text   — the long MLS description
…but only 26 rows across 20 distinct properties.
```

So **nothing we have paid for has been thrown away** — `raw` preserves every path. What is missing
is typing and volume:

- **Untyped but paid for:** the sold scraper returns agent/broker contacts and a `tax_history`
  block. There is no column for either; they exist only inside `raw`. Census `raw` and decide what
  earns a column. Zero additional spend to do this.
- **Volume:** 20 properties cached means nearly every build today is a cold paid call. Cache-first
  by property is not an optimization here, it is the difference between the ladder working and not.
- **Verify before you trust a store actor:** 2 of 5 tested were junk (one failed both attempts, one
  returned zero items). Test, then wire.

**Each plan must state, per paid call: what the full response contains, which paths we type, that
the raw body lands, and the cache key that prevents a second call for the same property.** A paid
call whose response is not fully landed is the failure the operator named — spending money and not
getting.

**So the ladder, cheapest first — this is what each plan must specify per field:**

1. **Lake / brains** — already paid, zero marginal cost. Default for everything it covers.
2. **The already-paid response, already landed** — per-event price cuts with the vendor's own
   days-on-market, 9-year tax and assessment history, per-property permits. Typed tables, live row
   counts above, $0 marginal. **Most plans will find their field here and never need rung 4.**
   Anything still unparsed sits in the retained raw body — also $0.
3. **The user's own upload / a figure they typed** — free, and lane 2 and 4 of the four-lane moat.
4. **Apify, per-call** — $0.007–$0.01/result. Reach for it where the lake genuinely cannot go:
   the full photo gallery, the full MLS description on a sold home, and sold events older than our
   sweep window (capture began 06/30/2026).
5. **Nothing** — an open slot. **An open slot always beats an invented number and always beats a
   bad link.** This is not a failure state; it is the designed one.

**Every plan you write must carry a per-field source table: field → primary → fallback → what
happens when both miss.** The operator's example is the spec: if Apify returns everything but price
fails, fall back to the lake number. Do not hand-wave this per email — write it per FIELD.

**Open, not answered here:** nobody has measured what a single email build actually costs across
those lanes. There is no per-build cost meter. Recommend one as step 0 of the build phase —
otherwise "run the cheapest" is a slogan, not an operation.

---

## 4. WHAT TO WRITE — one plan per email

Enumerate the email-producing recipes from `lib/deliverable/recipes.ts` yourself (**count the file;
the last written count went stale within a week**). For EACH one, the plan states:

1. **Tag** — the exact key, and every door that can emit it.
2. **Grammar** — listing or report (§5). Not negotiable per-email; it follows the family.
3. **The coded grid** — every block, its span, its row, in order. This is the "stamped before data
   arrives" step. Positions are NEVER written by the recipe; the recipe hands a flat plan and the
   seam assigns every position. A `layout: {` literal in a recipe fails a red test.
4. **Per-field source ladder** — the table from §3. Field, primary, fallback, miss behavior.
5. **Chart policy** — whether this email gets a chart at all. A chart only when the deliverable is
   ABOUT a number, about the SUBJECT. Empty chart slot = drop the slot. Chart type follows the
   data's shape per the research decision table, not taste.
6. **What the AI writes** — the prose slots ONLY. Name them. Code computes every comparison, count
   and ordering; the narrator receives settled sentences. The model may select chart points and may
   never write a figure.
7. **Buttons** — which roles, and what each falls back to.
8. **Failure modes + the guard for each** (RULE 3.5 — a design with a hand-waved failure section
   does not get approved).

---

## 5. THE ONE REAL DESIGN DECISION — the report grammar does not exist

The listing grammar is real and running: ribbon, photo, hero with address over price, spec strip,
the recipe's own middle, narrative. Eight recipes on it.

The REPORT grammar — showcase, digest, sphere-weekly, community-info, market-pulse — **has never
been designed.** Do not force a newsletter through the listing spine: it has no single address and
no single price, so the hero renders empty.

**You are not designing this from scratch.** The 08/03 structure research captured Compass's actual
rendered agent newsletter (not their marketing copy about one). Its literal block order: logo/header
→ full-width hero photo → section-label row → body copy → CTA button → repeat (label → copy → CTA),
stacked as a single-column table, no flexbox. That is close enough to our block set to adopt.
Zillow's drip emails are the same two shapes: market report and listing alert, agent photo pinned to
the top.

**The commercial point, worth telling the operator:** Compass's personalization model is the agent
swapping in ONE asset — their headshot — and then *"running the stats and plugging them into the
template"* BY HAND. The largest player in the category does the data step manually. The tag →
coded-grid → auto-fill pipeline in §0 is precisely the step they don't have. Design the report lane
to that standard and it is not parity, it is the wedge.

---

## 6. FAILURE MODES, EACH WITH ITS GUARD

- **A report email gets an empty hero.** Guard: the chrome must not require a hero; grammar stays
  per family, and no report recipe may call the listing spine.
- **A fallback silently swaps a source and nobody knows which one rendered.** Guard: the per-field
  provenance must survive to the doc. Four-lane means the reader can be told where a number came
  from; a fallback that erases its own origin breaks the moat, not just the email.
- **Apify returns a stale photo or a dead URL.** Guard: rot was falsified at 5 months, not forever.
  Validate on fetch; an open slot beats a broken image.
- **A number is invented when both lanes miss.** Guard: the output lint (`gateNarrative`) plus the
  claims layer. This is the ONLY hard block in the whole system.
- **Cost runs away because every build hits a paid actor.** Guard: cache-first by property, and a
  per-build cost meter (§3, unbuilt). Twenty properties cached today means almost every build is
  currently a cold call — measure before scaling.
- **Someone reintroduces hand positioning.** Guard: the layout ledger — but know it is EVADABLE.
  It matches the literal text `layout: {`, and the two live bypasses write `layout: l` and
  `layout: slotLayout`. **Build the durable form first:** for every key in the recipe registry,
  build it and assert the seam stamp plus a layout on every block. That cannot be dodged by renaming
  a variable, and it covers a new recipe the moment it is registered.
- **Recipes do real I/O and the assertion needs a harness.** Guard: reuse the mock-at-the-data-
  boundary harness in `scripts/email/campaign-sim.mts`. **Do NOT build a second harness** — that is
  how the 06/16 convergence job got declared green and abandoned with ten frozen goldens still
  sitting there.
- **A block hand-types a font size again.** Already guarded (`type-conformance.test.ts`). Do not
  weaken it; extend it if you find a new class.

---

## 7. WALK ORDER

1. **Record the recipe key on the deliverable row.** Additive, zero risk. **Until this exists,
   "is the assembly line unified" is a claim nobody can query** — every live doc records its template
   as `block-canvas` and none records which recipe built it.
2. **Generate the playbook FROM the registry** — every key, its chrome, its grammar, its chart
   policy, printed from what the code actually holds. A generated playbook cannot drift; a written
   one already did, and drifted comments describing a dead tier split misled a session on
   08/03/2026. This is the operator's own idea and it is the best one in the thread.
3. **The output-based seam assertion** (§6). Build the guard BEFORE the deletions — a deleted lane
   gets recreated by the next session that needs one; only a red test stops it.
4. **Extract the chrome** into its own root so it can be stamped BEFORE the tag routes (today chrome
   and listing body are fused in `buildLifecycleEmail`, which is why a report email cannot get the
   shared header without a listing hero). Deletes 8 byte-identical `keepOrDefault` copies. Provably
   safe: all 8 sites already pass identical geometry.
5. **Wire the already-landed families into the email lanes** (§3) — tax history, permits, and
   per-event price cuts are typed and populated but the email recipes do not read them. This is
   free data with no consumer, which is the cheapest win on the board. Re-census the retained raw
   body for anything still unparsed before assuming a paid call is needed.
6. **Design the report grammar with the operator, one email at a time, starting with
   `listings-showcase`** — he named it, and it is the reference for the family.
7. Then the remaining report recipes, then `showing-prep-doc.ts` (chrome AND seam in ONE change or
   its ledger exemption goes red), then the two seam bypasses, then `default-grid` last.

---

## 8. DO NOT

- Do not re-derive the seven-line design in §0. It has been restated four times.
- Do not write another markdown playbook that describes the code. Generate it (§7 step 2).
- Do not delete a lane before the output assertion exists and the recipe key is recorded.
- Do not touch `renderGroundedReport` — real duplicate, serves the public share page and the PDF,
  has its own half-finished convergence plan with ten frozen goldens. Separate job.
- Do not widen this into every string-emitting renderer. Open a check instead.
- Do not quote a count from this document. Re-derive it. Two counts in the prior plan were wrong
  within a week, and one of them was mine.
