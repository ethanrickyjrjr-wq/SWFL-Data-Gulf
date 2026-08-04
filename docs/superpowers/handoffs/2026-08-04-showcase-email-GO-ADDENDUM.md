# ADDENDUM — verification + GO order for the showcase-email assembly line

> **Recommended model:** ⚡ Sonnet

**To:** the Opus session executing `2026-08-04-showcase-email-assembly-line-HANDOFF.md` (same folder).
**From:** Fable 5, 08/04/2026, second independent verification pass.
**Read the base handoff FIRST. This file only records (a) what re-verified, (b) what was WRONG in it,
(c) the operator's GO, (d) execution suggestions. It does not restate the design.**

---

## A. THE GO — the operator has authorized the build (08/04/2026)

Verbatim intent, same day as the base handoff: *"ALL EMAIL BUILDS LOCATED ON SHOWCASE SITE PAGE OR
COMING FROM HOMEPAGE OR ANYWHERE ELSE ALL RUN THROUGH WHAT WE ARE PUTTING TOGETHER. SOME THINGS WE
MAY ALREADY HAVE AND THAT IS GREAT BUT WE ARE BUILDING EACH ONE BY ONE AND FINALIZING THE PATH FOR
EACH ONE SO THEY ARE PERFECT EVERY FUCKING TIME."* And: *"let's get started on showcase emails the
correct way using fields and tags and all the research we've found and actually build in place so
Claude can't fuck more shit up."*

This **amends** the base handoff's "do NOT start building until the operator walks them with you":
the walk gate is satisfied for starting. **Scope of the GO: build the guards + move email lanes one
by one, walk-order sequence intact.** Still walk each per-email PLAN (the §4 eight-point spec) past
him before that email's lane is finalized — "building each one by one and finalizing the path for
each one" is him describing exactly that per-email review.

"Build in place so Claude can't fuck more shit up" = the guard rails ARE the deliverable. Walk-order
steps 1–3 (recipe key on the row, generated playbook, output-based seam assertion) are not
preliminaries to skip on the way to the fun part; they are the request.

---

## B. RE-VERIFIED 08/04/2026 (independent pass — live SQL, tree-wide grep, files read)

- **SteadyAPI landed families — EXACT match.** Live counts this pass:
  `steadyapi_property_history_raw` 17,875 · `steadyapi_tax_history` 273,051 ·
  `steadyapi_property_permits` 79,281 · `steadyapi_listing_events` 235,383. §3's core claim stands:
  rung 2 of the ladder is real, typed, populated, and unconsumed by email recipes.
- **`listing_state` 35,202 rows** (it lives in `data_lake`, not `public`). Matches.
- **Apify cache is effectively empty — confirmed.** 26 rows, and this pass measured **26 distinct
  `address_key`** (base handoff said 20 distinct properties; either way, ~two dozen vs 35k —
  the conclusion "Apify is not the spine, cache-first is mandatory" is unchanged).
- **Lane split — confirmed by tree-wide grep.** 8 recipes on `buildLifecycleEmail` (7 recipe files +
  `lib/email/listing-flyer.ts` for new-listing) · 6 report recipes calling `finalizeDoc(` directly
  (agent-brand-intro, community-info, listings-digest, listings-showcase, review-reply,
  sphere-weekly) · `agent-launch` + `market-pulse` in neither.
- **Registry enumerated fresh:** `lib/deliverable/recipes.ts` holds **19 keys** = the 16 named above
  + `default-grid` + **`social-pack` + `social-cut`**. The base handoff never mentions the two
  social keys — they are social-surface, OUT of this job's scope, but the generated playbook (§7
  step 2) must print them with an explicit `chrome: none (social)` so nobody "fixes" them onto
  email chrome.
- Research roots re-read (`_RESEARCH/email-and-social/2026-08-03-strongest-real-estate-email-
  concepts-structure.md`): the Compass literal block order for the report grammar is as described,
  and Part A's merge-tag survey confirms **no universal token format exists** — our tag/field enums
  are ours to define, closed, in code.

## C. CORRECTIONS — the base handoff is wrong here, do not inherit these

1. **`showing-prep-doc.ts` is NOT "doing both" — it does NEITHER.** It lives at
   `lib/email/showing-prep-doc.ts` (not under `lib/deliverable/recipes/`), calls neither
   `buildLifecycleEmail` nor `finalizeDoc`, and carries its **own private `keepOrDefault` chrome
   copy** (line 34). So the bypass set is **three** (agent-launch, market-pulse, showing-prep-doc),
   and the walk-order item "chrome AND seam in ONE change" applies to it as a full bypass, not a
   hybrid. Its ledger exemption is masking a third seam-less lane.
2. **`data_lake` is not "16 tables."** Measured this pass: **71 base tables** — 1 apify,
   **12 steadyapi**, 58 other. The base handoff's "16 total — 1 apify, 15 steadyapi" is wrong on
   both the steadyapi subcount and (badly) the total; it silently excluded every non-apify/steadyapi
   lake table. The point it was making (apify:steadyapi ratio) survives; the number doesn't. Same
   lesson the handoff itself preaches: re-derive, don't quote.
3. Minor: apify distinct-property count is 26 by `address_key`, not 20 (see B).

## D. SUGGESTIONS — from this pass, for the executing session

1. **"Fields and tags" = make the per-field source ladder CODE, not prose.** The operator's phrase
   is the spec. Give every recipe a typed, closed field manifest — `field → primary lane → fallback
   lane → on-miss (open slot)` — registered next to the recipe key, and a red test that refuses any
   registered recipe without one (exactly the `type-conformance.test.ts` pattern that already
   works). The §4 plan tables then GENERATE from these manifests instead of drifting in markdown,
   and per-field provenance (§6 failure mode 2) falls out for free because the manifest is the
   provenance record.
2. **Order the guards before any lane moves:** recipe key on the deliverable row → registry-driven
   build-and-assert test (kills the `layout: {` evasion) → generated playbook. All three are
   additive and cheap; land them in one push so every subsequent lane move is measurable.
3. **Grid awareness for the builder (decree item 6, still UNBUILT):** add `x/y/w/h` to what
   `docSkeleton` (`lib/email/build-doc.ts:354`) hands the model. Small, and it unblocks
   "may change the chart or anything else ON REQUEST" from being half-true.
4. **Per-build cost meter before any Apify wiring** — with 26 cached properties, every showcase
   build is a cold paid call today. Meter first, then cache-first by `address_key`, then wire.
5. **First lane to move: `listings-showcase`** (operator named it; base handoff §7 step 6 agrees) —
   but only AFTER guards (1–2 above) and the free win of §7 step 5 (tax/permits/price-cut events
   into the listing lanes, $0, already typed).
6. Do not re-litigate anything in the base handoff's §8 DO-NOT list. It all still applies,
   including `renderGroundedReport` staying untouched.
