# Chat stops negotiating charts; fix the brain router feeding chat grounding + AI email charts

**Date:** 2026-07-09
**Status:** approved (operator, 07/09/2026) — implementation plan written 07/09/2026, build pending
**Checks:** `chart_router_heat_inventory_deadzone`, `followup_chips_build_verb_hijack`,
`brain_slug_leak_runtime_no_scrubber`, `chart_offer_unfulfillable_by_construction`,
`chat_chart_honesty_live_verify`

## Problem

Live transcript, 07/09/2026. The user asked "Which corridors are heating up?" and got a bar chart
of the twelve highest-priced ZIPs by median sale price. They then asked, explicitly, for "a chart of
inventory tightening by corridor" and the assistant replied "I can build that chart for you" — and
then asked a clarifying question instead of building anything. The follow-up chips underneath were
about building permits. The prose named `listing-momentum-swfl`, `market-temperature-swfl`, and
`active-listings-swfl` out loud.

Four independent roots, each verified by executing the code (not by reading it).

### R1 — The brain router has a dead zone

`lib/highlighter/reach.ts` holds `TOPIC_TO_SLUG`: **6 topic rules for 42 brains.** It covers env,
cre, permits, rentals, labor, and tourism. It has no rule for housing, market heat, listings,
momentum, price distribution, home values, or investor yield — the core of a real-estate product.

Executed against the live routers:

```
Q: "Which corridors are heating up?"            Q: "a chart of inventory tightening by corridor"
  routeRankedDelta : null                         routeRankedDelta : null
  routeChart       : null                         routeChart       : null
  resolveReachTargets : []                        resolveReachTargets : []
```

`resolveReachTargets("chart the median sale price by ZIP")` also returns `[]` — the single most
obvious question in the product routes to nothing.

`market-heat-swfl` is reachable *only* through `routeRankedDelta`, whose `RANKED_INTENT` regex
enumerates `which zips|which areas` but not `which corridors`, and whose topic regex matches
`market ?heat` but not "heating up". Double miss. `listing-momentum-swfl`,
`market-temperature-swfl`, and `active-listings-swfl` are unreachable from chat entirely.

**Consequence.** `buildChartForQuestion` falls to `CHART_FALLBACKS[0] = housing-swfl`, whose primary
metric is median sale price. Every routing miss renders the same chart. This is precisely the
operator's report: *"one chart was the only thing that popped up for every prompt I clicked."*

**Second consequence.** `buildMenu` in `compose-chart.ts:105` seeds its data menu from
`["master", ...resolveReachTargets(...)]`. With an empty reach, the LLM composer sees only master's
region-wide rollups, has no per-ZIP inventory or days-on-market points to select, and returns null.
The composer is not broken — it is starved by the same router.

**Third consequence.** `housing-swfl` — the brain the fallback already fetched — holds days on
market, inventory, and market-heat direction (`brains/housing-swfl.md` scope line). The engine
fetched the right brain, plotted the wrong column, and then told the user it needed to go pull data
it was already holding.

### R2 — The verb "build" is routed as a construction permit

The permits rule, byte-identical in **two** files (`lib/highlighter/reach.ts:17` and
`lib/assistant/follow-up-suggestions.ts:32`):

```js
/\b(permit|construction|build(?:ing|s)?|new homes?)\b/i
```

The alternation `build(?:ing|s)?` matches the bare verb **"build"**. Both tables are
first-match-wins and permits sits above rentals and above price/listing.

- `resolveReachTargets("build me a chart of rents by ZIP")` → `["permits-swfl"]`. The verb beats the
  noun. Verified by execution.
- `suggestFollowUps` matches against question **and** answer. `OUTSIDE_SYSTEM` instructs the model to
  offer to *build* a chart. So any chart offer manufactures permit chips. That is why the operator
  saw "What's driving the permit activity?" under a corridor-heat conversation.

### R3 — Internal brain slugs leak into customer prose

`brains/master.md` names its upstream brains in the dossier text (`listing-momentum-swfl` ×7,
`market-temperature-swfl` ×8, and so on). `buildDossier` carries that text into the grounding block.
`OUTSIDE_SYSTEM` then instructs, verbatim: *"name the specific datasets we hold for that topic."*
The model complies, using the only names it has — our internal slugs.

The no-jargon rule blocks a hardcoded word list (`master`, `brain`, `payload`, `dossier`, `Accela`)
and never mentions slugs. `display-leak.test.mts` is a **build-time** test over code-authored
strings and structurally cannot catch a slug the model emits at runtime. `lib/assistant/stream.ts`
has **no runtime scrubber** (verified).

### R4 — The chart offer is unfulfillable by construction

`chartForConversation()` runs to completion *before* `streamAnswer()` is called. The model has no
chart tool. When the producer returns null, `OUTSIDE_SYSTEM` (conversation-path.ts:199) says: *"if
no chart is on screen this turn, offer to build one and name what you would plot."*

The model obeys, and the offer asks the user for **scope** ("all 90 ZIPs, or the top 20?"). Scope
does not change routing. The user's answer re-enters the identical producer, which misses
identically. The loop cannot terminate.

The `chart-for-question.ts:50` comment records this surface being patched live on 07/03, and the
"offer to build" paragraph exists because it replaced a worse deflection ("I can't chart, that's on
you"). Both prior fixes went at the prompt. The prompt was never the root.

## Goal

Chat tells the truth. It never negotiates a chart, never promises a build it cannot perform, never
speaks an internal identifier, and answers heat/inventory/momentum questions from real numbers.
The router fix lands where charts actually belong: the AI-authored email deliverable.

Non-goal: the file→lab deliverable flow (accumulate → build → Email Grid / PDF lab, the unnamed
template with a fence for the AI builder). That is **spec B**, brainstormed separately. Non-goal:
re-introducing charts to chat. The operator has deferred that decision.

## What we're building

### Surface 1 — `lib/highlighter/reach.ts` (the router)

Expand `TOPIC_TO_SLUG` from 6 rules to cover the chartable brain set, and **delete the bare `build`
verb** from the permits alternation (keep `building` / `builds`).

Order is priority (first-match-wins, capped at `MAX_REACH = 3`), so specific rules must precede
general ones. Rules to add, in priority order before the existing six:

The table below is derived from the brains' **actual** `detail_tables`, inspected 07/09/2026 — not
from slug names. Verified content:

- `market-heat-swfl` — 99 ZIP rows. Columns: `Heat Tilt (0-100)`, `Hotness (relative)`,
  `Hotness Rank`, `Median DOM`, `DOM Y/Y`, `Inventory Y/Y`, `Pending Ratio`, `Pending Ratio Y/Y`,
  `Price-Cut Share`, `Median Active Listings`. Plus a 36-month region trend table. The brain's own
  metric prose calls Heat Tilt `>50 = tightening/seller-favoring` and `Inventory Y/Y` **"the lead
  tightening signal."**
- `housing-swfl` — 124 ZIP rows: `Median sale price`, `Median sale price YoY`, `Median days on
  market`, `Median days-on-market YoY change`, `Active inventory`, `Months of supply`,
  `Sale-to-list ratio`, `Homes sold (90-day)`.
- `active-listings-swfl` — 67 ZIP rows: `Active listings`, `Avg days on market`, `Median asking
  price`. **Levels only — no year-over-year.**
- `listing-momentum-swfl` — 67 ZIP rows: `New-listing share`, `Price-cut share`, `Active listings`.

This corrects a first-draft error. "Inventory tightening" must route to `market-heat-swfl` (which
holds `Inventory Y/Y`), **not** `active-listings-swfl` (raw counts, no delta — it cannot express
"tightening" at all).

| topic signal | slug |
|---|---|
| heating up, cooling off, market heat, hotness, hottest, tightening, sellers'/buyers' market, pending ratio | `market-heat-swfl` |
| days on market, DOM, time on market, price cut, price reduction, new listings, momentum | `listing-momentum-swfl` |
| median sale price, sale price, sold price, list price, sale-to-list, months of supply, inventory, supply | `housing-swfl` |
| active listings, listing count, how many listings | `active-listings-swfl` |
| home value, ZHVI, appreciation | `home-values-swfl` |
| price distribution, price tier, affordability band | `price-distribution-swfl` |
| seller stress, distressed, foreclosure | `seller-stress-swfl` |

**Ordering constraint (priority inversion guard).** The existing `cre-swfl` rule already claims
`cap rate`. An `investor-zip-swfl` rule keyed on `investor / rent yield / cash flow` must be placed
**after** `cre-swfl` and must **not** include `cap rate`, or a commercial cap-rate question silently
reroutes to the investor brain — a regression against today's behavior. `routeRankedDelta` retains
its own `cap ?rate` → `investor-zip-swfl` mapping; that path is unchanged and is gated on an explicit
ranking intent.

`ALLOWED = buildReportIdSet()` already fail-closes any slug not in the live inventory, so an entry
for a brain that is not published is inert rather than a crash. `market-temperature-swfl` and
`corridor-pulse-swfl` are intentionally omitted from v1: their coverage overlaps `market-heat-swfl`
and adding both would burn the 3-slot `MAX_REACH` budget on near-duplicates. Revisit with evidence.

Three consumers benefit from this one change: chat grounding (Surface 2), `report-path.ts:97`, and
`build-doc.ts:248` (Surface 5).

### Surface 2 — `lib/assistant/conversation-path.ts` (chat)

**Remove charts.** Delete `chartForConversation()` and both call sites (lines 661, 762). No `{type:
"chart"}` frame is ever pushed into either prelude. Delete the two `=== CHART ON SCREEN ===`
grounding blocks. Do **not** delete `chart-for-question.ts` or `compose-chart.ts` — Surface 5 needs
them.

Side effect worth stating: `composeChartFromRequest` is a paid LLM call (`TRIAGE_MODEL`) that fired
on every chart-worthy turn. Removing it from chat makes chat strictly cheaper.

The comp-path charts (`comp.chart`, lines 696 and 793) are **out of scope** — they are a
user-directed property-comp visual on a different lane, not the topical auto-chart. They stay.

`looksChartWorthy` (exported from `chart-for-question.ts`) loses its only caller when
`chartForConversation` is deleted — it gated the chat auto-chart, and `buildChartForQuestion` never
calls it internally. **Delete the function and its tests.** The email path (`build-doc.ts`) always
wants a chart and never gated on it, so nothing downstream regresses. Leaving a dead exported gate
in a chart module invites a future caller to re-wire chat charts by accident.

**Add grounding reach.** In `buildGroundedRegionSystem`, generalize the existing hardcoded
`cre-swfl` special case into a loop over `resolveReachTargets(lastUser, "master")`, appending each
brain's dossier as a `GroundingBlock` with a clean, customer-facing label (never the slug). Each
fetch is independently `try`/`catch` fail-open, matching the existing nested `cre-swfl` failsafe:
a brain that will not load is skipped, master-only grounding survives, and the no-invention floor is
unchanged.

This is the fix for the vagueness. "Which corridors are heating up?" will fetch `market-heat-swfl`
and `active-listings-swfl` and answer from their real figures, instead of paraphrasing master's
region-wide rollup because it had no numbers.

Label mapping (slug → customer-facing name) lives in one exported map so Surface 3 can reuse it.

### Surface 3 — the jargon leak (two layers, per operator decision)

**Layer 1, input scrub (the real fix).** A new pure function sanitizes brain-slug tokens out of
dossier text before it enters the system prompt. The model cannot speak a name it never saw. It maps
a known slug to its customer-facing label (`listing-momentum-swfl` → "listing momentum") and, for an
unrecognized `*-swfl` token, strips the `-swfl` suffix and de-hyphenates. Applied **inside
`renderBlock`** (`lib/highlighter/grounding.ts`) — the one boundary every grounded surface already
passes through, so chat, `report-path`, and the welcome path all inherit it from a single edit.

**Layer 2, runtime output scrubber (belt-and-suspenders).** A transform in `lib/assistant/stream.ts`
matching `\b[a-z][a-z0-9-]*-swfl\b` in the streamed text. Because a slug can split across SSE chunk
boundaries, the transform holds back a tail buffer (the longest possible partial match, ~32 chars)
and flushes it on completion. This catches a hallucinated slug or a future regression that bypasses
Layer 1.

Layer 2 **substitutes via the same slug→label map as Layer 1**, and only falls back to deletion for
an unrecognized token. A naive strip-to-nothing leaves broken grammar in the user's face — *"I also
track , which reads…"* — which is a worse bug than the leak it fixes. Both layers share one map, so
they can never disagree.

### Surface 4 — `lib/assistant/follow-up-suggestions.ts` (chips)

Delete the bare `build` verb from the permits rule (same one-word edit as Surface 1). Do **not**
change the question+answer matching strategy — the module header explains that question-only matching
can never escape the generic bucket once a generic chip is clicked back in.

Add a topic rule for inventory/heat/momentum so a corridor-heat conversation gets relevant chips
rather than falling to `GENERIC_FOLLOW_UPS`.

### Surface 5 — the three system prompts (all in `lib/assistant/conversation-path.ts`)

`OUTSIDE_SYSTEM`, `PUBLIC_GROUNDED_SYSTEM`, and `PUBLIC_SYSTEM` are all declared in
`conversation-path.ts`, not in `system-prompt.ts` (which holds only `FORMAT_RULE` and
`freshnessDirective`). `system-prompt.ts` is untouched.

Delete the chart-offer paragraph from `OUTSIDE_SYSTEM`. Replace with:

1. Answer the question from the cited data below, or from a named web source (four-lane, RULE 0.7).
2. Never mention charts, offer a chart, or promise a future build.
3. Never name a dataset, table, or identifier. Describe what the data *is* in plain English.
4. After a substantive answer, route: offer to save this into a file, or — if the user is done
   researching — to build it in the lab now. The user chooses.
5. If no project is open, offer to start one on the first substantive answer (operator decision,
   07/09/2026).

Apply (2) and (3) to `PUBLIC_GROUNDED_SYSTEM` and `PUBLIC_SYSTEM` as well. `buildSummarizeSystem`
needs (3) only.

The affirmative capability line ("You CAN also build a cited chart…") is deleted, not softened. It is
false on this surface.

### Surface 6 — the AI email chart (`lib/email/build-doc.ts`)

**No code change.** `buildPromptChart` passes the user's prompt into `buildChartForQuestion`, which
routes through `resolveReachTargets` — so Surface 1 fixes the AI-authored email chart for free. Today
an email prompt about inventory or heat receives the same `housing-swfl` median-price fallback.

Verified scope boundary: `lib/deliverable/bind-frame.ts` (the **grid** binder, called from
`build.ts:160`) is pure, takes an explicit `BrainOutput`, and never touches the router. **Grid charts
are unaffected by every change in this spec.**

Test hazard: `build-doc.test.ts` module-mocks `chart-for-question` (see commit `84ce2092`, "restore
real chart-for-question module in build-doc.test.ts afterAll"). Any new assertion must respect that
mock lifecycle.

## Data flow (chat, after)

```
question
  → resolveReachTargets(question, "master")        # ≤3 brains, allowlist-bounded
  → fetchBrain(master) + fetchBrain(each reach)    # each fail-open
  → buildDossier → sanitizeSlugs → renderBlock     # Layer 1 scrub
  → system prompt (no chart block, no chart offer)
  → streamAnswer → slug-strip transform            # Layer 2 scrub
  → SSE text  (prelude carries place + sources; NO chart frame)
```

## Error handling

Every added fetch is fail-open and independently caught. A reach brain that will not load is skipped
silently; master-only grounding remains a complete, honest answer. A total master failure falls back
to the un-grounded premise exactly as today. The no-invention floor is unchanged on every path. No
new failure mode can block or 500 an answer.

## Testing

Regressions that would have caught the live bugs:

- `reach.test.ts`: `"build me a chart of rents by ZIP"` → `["rentals-swfl"]`, **not** permits.
- `reach.test.ts`: `"chart the median sale price by ZIP"` → non-empty (housing).
- `reach.test.ts`: `"Which corridors are heating up?"` → contains `market-heat-swfl`.
- `reach.test.ts`: `"where is inventory tightening"` → contains `active-listings-swfl`.
- `follow-up-suggestions.test.ts`: an answer containing the verb "build" does not return permit chips.
- `conversation-path.test.ts`: **no** `{type:"chart"}` frame is emitted on any question, located or
  region-wide (the auto-chart lane; comp charts still allowed).
- `conversation-path.test.ts`: grounding for a heat question includes the reach brain's dossier.
- new `slug-scrub.test.ts`: Layer 1 maps known slugs to labels; Layer 2 strips a slug split across
  two chunk boundaries.
- `build-doc.test.ts`: a heat/inventory prompt routes to a heat brain, not the price fallback
  (respecting the existing module mock).

Gate 5 (pack ⇆ catalog) is not triggered — no pack changes. No vocab slugs change. No migration.

## Adjacent finding — not in scope

While auditing the routing targets, `active-listings-swfl` and `listing-momentum-swfl` were found to
carry out-of-region ZIP row labels — `31420 (Collier)` is Savannah GA, `33155 (Collier)` is Miami,
`33467 (Lee)` is Lake Worth, `33040 (Hendry)` is Key West — and `33936` appears under **both** Lee
and Hendry. This spec routes chat grounding traffic to those brains, so bad ZIPs could surface in
answers. Tracked separately as check `active_listings_zip_county_contamination` (ZIP gate G1). It
does not block this work: `market-heat-swfl` and `housing-swfl` carry the load for the heat and
inventory questions, and both use clean ZIP labels.

## Open questions

None. Both design forks were decided by the operator on 07/09/2026: charts leave chat entirely, and
the slug scrub ships as both input and runtime layers.

## Implementation plan (written 07/09/2026, code-verified against current HEAD)

Every file and line number below was re-read at current HEAD before this plan was written — the
design above matches the live code almost exactly (it was written same-day from a live audit). Four
things surfaced during that re-read that this plan accounts for and the sections above don't:

1. **The Testing section above has a stale case.** It asserts `"where is inventory tightening"` →
   contains `active-listings-swfl` — that was the *pre-correction* expectation. Surface 1's own
   routing table (corrected in a follow-up commit) says tightening must route to `market-heat-swfl`
   (it holds `Inventory Y/Y`; `active-listings-swfl` is levels-only, no delta). The new test below
   uses the corrected slug.
2. **Surface 3's Layer 1 map would duplicate an existing one.** `refinery/render/speaker.mts`
   (already imported by `grounding.ts`) has `PACK_ID_LABELS` and `displayName()`/
   `humanizeBrainId()` covering nearly the same slug set the spec describes building fresh.
   **Decided:** extend that map rather than author a second one.
3. **`scripts/prove-chart-conversation.mts`** (not named above) manually drives the chat chart path
   for live testing. Its premise dies with Surface 2 — needs retiring or repurposing.
4. **`lib/assistant/CLAUDE.md`** (area conventions, auto-loads on edits here) still documents the
   chat auto-chart as current behavior. It goes stale the moment Surface 2 ships.

Six phases, in dependency order, each independently testable and each closing one `checks` entry:

**Phase A — Router + chips** (closes `chart_router_heat_inventory_deadzone`,
`followup_chips_build_verb_hijack`)
- `lib/highlighter/reach.ts`: insert the spec's 7 new `TOPIC_TO_SLUG` rules before the existing 6,
  in table order (incl. the `investor-zip-swfl`-after-`cre-swfl` ordering guard). Delete bare
  `build` from the permits regex at line 17 (keep `building`/`builds`).
- `lib/assistant/follow-up-suggestions.ts`: same one-word permit-regex edit (line 32). The file
  already has a 7th, partial-match rule (line ~64: `market heat|listing`) that the spec's "add a
  topic rule for inventory/heat/momentum" would otherwise shadow or collide with — **extend that
  existing rule** to also match `tighten(ing)?|hotness|hottest|days on market|dom|momentum|
  inventory` instead of adding a competing one. Simpler, no ordering risk, extends rather than
  duplicates (per RULE 3 C2).
- No code change needed in `compose-chart.ts` or `lib/email/build-doc.ts` — both already route
  through `resolveReachTargets`, so this phase alone fixes the compose-chart starvation and the AI
  email chart for free (Surface 6 confirmed a no-op).
- Tests, `reach.test.ts`: `"build me a chart of rents by ZIP"` → `["rentals-swfl"]`, not permits;
  `"chart the median sale price by ZIP"` → non-empty; `"Which corridors are heating up?"` → contains
  `market-heat-swfl`; `"where is inventory tightening"` → contains `market-heat-swfl` (**corrected**
  from the Testing section above). Tests, `follow-up-suggestions.test.ts`: an answer containing the
  verb "build" does not return permit chips; a heat/inventory question returns the extended rule's
  chips.
- Close both checks once tests pass.

**Phase B — Slug scrub, Layer 1** (progresses `brain_slug_leak_runtime_no_scrubber`)
- Extend `refinery/render/speaker.mts`'s `PACK_ID_LABELS` with any of the 7 new slugs it's missing,
  and export a `sanitizeSlugs(text): string` helper from there — reusing `displayName()`/
  `humanizeBrainId()`'s existing unrecognized-token fallback logic rather than writing a new one.
- `lib/highlighter/grounding.ts`: apply `sanitizeSlugs` inside `renderBlock` (line 108), at the same
  chokepoint as the existing `scrubStatsJargon` call that wraps `parts.join("\n")` (line 139) —
  same precedent pattern already used for stats-jargon scrubbing.
- New `slug-scrub.test.ts`: a known slug maps to its label; an unrecognized `*-swfl` token falls
  back to a de-hyphenated, non-broken-grammar substitution.

**Phase C — Remove chat auto-chart + grounding reach loop** (closes
`chart_offer_unfulfillable_by_construction`, part 1)
- `lib/assistant/conversation-path.ts`: delete `chartForConversation` (lines 76-84) and its two call
  sites (~661, ~762), the two `=== CHART ON SCREEN ===` grounding blocks, and the two
  `prelude.push({type:"chart",...})` lines they feed. Re-confirm exact line numbers immediately
  before editing — earlier edits in this same file will have shifted them. Leave the `comp.chart`
  lines (the property-comp lane, ~682/~793) untouched — different lane, out of scope.
- Generalize `buildGroundedRegionSystem`'s hardcoded `cre-swfl` special case (lines 297-313) into a
  loop over `resolveReachTargets(lastUser, "master")`; each fetch stays independently `try`/`catch`
  fail-open; each grounding block is labeled via Phase B's map, never the raw slug.
- Delete `looksChartWorthy` (`chart-for-question.ts:53-58`) — it has no dedicated test file, only a
  mock-stub line in `build-doc.test.ts:29`; drop that stub line too since the export disappears.
- Tests, `conversation-path.test.ts`: no `{type:"chart"}` frame is emitted on any auto-chart path,
  located or region-wide (comp charts still allowed); grounding for a heat question includes the
  reach brain's dossier.

**Phase D — Slug scrub Layer 2 + system prompts** (closes
`chart_offer_unfulfillable_by_construction`, part 2)
- `lib/assistant/stream.ts`: in `streamAnswer`'s loop (lines 79-81), wrap `extractText(ai)`'s
  yielded text with a tail-buffered (~32 char, the longest possible partial match) regex transform
  matching `\b[a-z][a-z0-9-]*-swfl\b`, substituting via Phase B's same map, flushing the held-back
  tail once the loop completes (before the final `done: true` enqueue). `sseMessage`'s zero-token
  path is untouched — it never carries model-authored text.
- `conversation-path.ts`: delete the chart-offer paragraph and the affirmative capability line from
  `OUTSIDE_SYSTEM` (~lines 186-202); replace with the 5-point block from "Surface 5" above. Apply
  points 2 and 3 to `PUBLIC_GROUNDED_SYSTEM` and `PUBLIC_SYSTEM`. Apply point 3 only to
  `buildSummarizeSystem` (line 346) — it already bans jargon/vendor names but never had chart-offer
  language to remove.

**Phase E — Cleanup** (not in the original design above; found during this code read)
- Retire or repurpose `scripts/prove-chart-conversation.mts` — its premise (proving the chat chart
  path) disappears once Phase C lands.
- Update `lib/assistant/CLAUDE.md`'s chart paragraph: `composeChartFromRequest`/
  `buildChartForQuestion` still power the AI-authored email chart and user-directed comp charts;
  the chat auto-chart lane is gone.
- Add the "heat/inventory prompt routes to a heat brain, not the price fallback" assertion (from the
  Testing section above) to `chart-for-question.test.ts`, not `build-doc.test.ts` — that file's own
  top-level `mock.module` stubs `buildChartForQuestion` to `null` for its entire run, restored only
  in `afterAll`, so a real-routing assertion can't live there without its own scoped mock override.

**Phase F — Close the loop**
- `node scripts/check.mjs close <key>` for each of the four build-time checks as its phase lands.
  `chat_chart_honesty_live_verify` stays open for the operator to run — paid live-verify, never
  autonomous.
- Gate 5 (pack ⇆ catalog) is not triggered anywhere in this plan — no pack, vocab, or migration
  changes.

**Verification, once built:**
`bun test lib/highlighter/reach.test.ts lib/assistant/follow-up-suggestions.test.ts
lib/assistant/conversation-path.test.ts lib/assistant/chart-for-question.test.ts` plus the new
`slug-scrub.test.ts`; `bunx next build`; manual check in chat that "Which corridors are heating up?"
and "a chart of inventory tightening by corridor" produce no chart, no spoken slug, and real
`market-heat-swfl`/`housing-swfl` figures.
