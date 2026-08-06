# Precomputed, pre-checked commentary for the builder — the plan

**Date:** 2026-08-06
**Origin:** operator, mid-market-pulse-walk — *"Has to be a fucking way we can get commentary that
is checked before it hits builder and builder can just add a CTA and a little extra commentary."*
**Supersedes the premise of:** `docs/superpowers/specs/2026-08-06-precompute-narrative-cache-design.md`
(that spec targeted a dead code path — see §1).

---

## §1 — CORRECTION FIRST: the prior spec aimed at a path that stopped running 07/17/2026

The prior spec's problem statement was *"`buildDeliverableNarrative()` fires a synchronous, uncached
Sonnet call on every `/api/deliverables/[id]/refresh`."* The code claim is true. The **volume claim
was never checked**, and it is wrong. Live probe against `public.api_usage_log` + `public.deliverables`,
08/06/2026:

```
api_usage_log — calls by call_type, last 30 days
  narrative_bake               1446   $15.30   (07/10 → 08/06)
  assistant_stream              744    $7.56   (07/07 → 08/06)
  email_build                   636    $5.89   (07/08 → 08/06)
  factuality_ci                 573    $1.77
  ingest_city_pulse_distill     190    $9.31
  deliverable_build             110    $2.35   (07/07 → 07/17)   ← LAST CALL 07/17
  ...
api_usage_log — deliverable_build LIFETIME
  lifetime_calls 187 · days_with_any_call 16 · first 07/01 · last_ever 07/17/2026

deliverables — total 92 · refreshes (supersedes_id not null) 1 · last_30d 68 · distinct_users 3
```

**`deliverable_build` has fired zero times in 30 days. `/refresh` has been used once, ever, across
92 deliverables.** Caching that path saves nothing. This is the second time this exact mistake has
been made here — SCRATCHPAD 0z, 07/21/2026, operator verbatim *"there is no traffic..is there?"*
after a caching plan proposed without checking volume. Recording it so the third time doesn't happen.

**Two further corrections the probe forces:**

- The live narrative traffic is **`email_build` — 636 calls / $5.89 per 30 days** — the *recipe*
  path (`lib/email/build-doc.ts` → `lib/deliverable/recipes/*.ts` → `authorListingNarrative`), a
  different call site with a different validator from `buildDeliverableNarrative`. The prior spec
  conflated them. **This plan targets `email_build`.**
- At 636 calls / $5.89 a month over 3 users, **this is not a cost fix and must not be sold as one**
  (RULE 11). It is a correctness-and-latency fix: commentary that is *checked before it reaches the
  builder*, which is exactly what was asked for.

---

## §2 — The mechanism already exists. This is a 4th adapter, not a new system.

`scripts/bake-narratives.mts` + `lib/narratives/*` is already a precompute-validate-cache pipeline,
live, running 1,446 calls a month. Read before proposing (RULE 0.5) — it already has every property
the prior spec said needed fresh design:

| Prior spec said we'd need to design | Already built, and where |
|---|---|
| A staleness key beyond wall-clock TTL | `lib/narratives/hash.ts` `inputsHash()` — sha256 over `{facts, asOf}`. A surface rebakes only when its **inputs** move. Solves "source moved, not just TTL expired" exactly. |
| Validate before the row is readable | `lib/narratives/validate.ts` `validateNarrative()` — no-invention lint (every numeric token in output must exist in inputs), length bounds, hedge + jargon guards. Runs *before* `upsertNarrative`. |
| Fail-closed on a bad narrative | A failed key keeps its **previous row**; the run exits 1. Nothing invented is ever written. |
| The cache table | `public.narratives` (`surface`, `surface_key`, `sections`, `inputs_hash`, `sources`, `model`, `baked_at`), upsert on `(surface, surface_key)`. |
| Read-through on the consuming path | `lib/narratives/store.ts` `loadNarrative()` — null on any failure, consumer renders without. |
| Cost control | Anthropic **Message Batches API** (50% rates), `NARRATIVE_BAKE_RUN_CAP_USD` per-run cap, `BAKE_CADENCE` weekly gate, plus the metered client's daily/monthly spend caps. |
| Surface extensibility | `SURFACE_ADAPTERS` map — `zip`, `corridor`, `brain` today. Adding one is a `{list, assemble}` pair. |

**And the email bridge is already proven.** `lib/email/zip-seed.ts:76` already does
`loadNarrative("zip", zip)` — an email doc reading a pre-baked, pre-validated narration instead of
firing its own model call. That is the operator's ask, already working, on one surface.

Verified live via dry-run, 08/06/2026: `bun scripts/bake-narratives.mts --surface zip --force --dry-run`
→ `done — dry-run baked=52 skipped=0`.

---

## §3 — The constraint that decides the whole design: not every recipe is precomputable

19 recipes declare a `subject` spine in `lib/deliverable/recipes.ts`. That field, not the recipe
name, decides what can be baked ahead of time.

**PRECOMPUTABLE — `subject: "area"` (bounded, known-in-advance key set).** The subject is a ZIP or
city drawn from a finite set we already enumerate (`listZipSurfaceKeys` returns 52 today). We can
bake the area read on a cadence because we know every key before anyone asks.
→ `market-pulse`, `review-reply`, `sphere-weekly`, `community-info`, `listings-showcase`,
`listings-digest`, `default-grid`, `social-pack`, `social-cut`.

**NOT PRECOMPUTABLE — `subject: "address"` (unbounded, unknown until the request).** The subject is
a specific house the user types in. There is no key set to enumerate; the house may not have existed
as a listing an hour ago. These must keep generating live.
→ `new-listing`, `coming-soon`, `market-comps`, `under-contract`, `just-sold`, `open-house`,
`price-reduced`, `back-on-market` (address mode).

**PARTIAL — `subject: "agent"`.** Bounded by user count (3 today) but invalidated by every brand
edit. Not worth an adapter at this volume; explicitly out of scope for this plan.
→ `agent-brand-intro`, `agent-launch`.

**This maps onto the operator's own sentence exactly.** "Commentary that is checked before it hits
builder" = the **area read**, baked and validated on a cadence. "Builder can just add a CTA and a
little extra commentary" = the house-specific line + CTA, still authored live at build time, because
it is about a house that only exists once the user names it. The split isn't a compromise — it's the
sentence, implemented.

---

## §3.5 — STATUS 08/06/2026 — what is BUILT and what is NOT

Operator: *"fix whatever you need to and mint area email, i guess"* — so `area-email` is a **minted
surface**, not a reuse of `('zip', key)`. His call, overriding the reuse recommendation in §4/§7.

**BUILT (bake side, tests green, dry-run proven):**
- `lib/narratives/validate.ts` — value-aware number gate. `canonicalNumber` (trailing-decimal-zero)
  + `scaleExpansions` (K/M, **only** when the suffix is literally in the source). Absorbs Class A
  notation drift; Classes B and C still fail, pinned by test.
- `lib/narratives/length.ts` — per-surface narration length, ONE root, consumed by *both*
  `prompt.ts` and `validate.ts` so the length asked for and the length judged can never disagree.
- `lib/narratives/area-email-inputs.ts` — the adapter. Same data root (`assembleZipReport`), 6
  copy-ready facts, no dossier context, empty-tolerant.
- Registered in `scripts/bake-narratives.mts` `SURFACE_ADAPTERS`.
- Tests: `validate-scale.test.ts` (9), `area-email-inputs.test.ts` (8). **45 pass / 0 fail** in
  `lib/narratives/`; **21 pass / 0 fail** across downstream consumers (`zip-seed`, `gate-narrative`).
- Live dry-run: `--surface area-email --force --dry-run` → **52 surfaces, 6.00 facts each, 0
  unready displays, 0 starved**.

**The guard earned itself immediately.** First run across all 52 live surfaces: **25 of 52 ranked a
bare ratio into the top 6** (`Pending Ratio=0.16`, `Average household size=1.63`) — exactly the shape
that produced the rounding failures. Selection now takes the top 6 *that are copy-ready* rather than
the top 6 outright. We do **not** rescale or relabel those facts: whether a "pending ratio" may be
shown as a percent is a semantic claim this adapter has no standing to make.

**NOT BUILT — checks opened, do not read this plan as finished:**
- `area_email_readthrough_phase2` — **Phase 2 is not started.** No recipe reads the baked row yet;
  every area recipe still authors its own commentary. The bake side exists; the consuming side does not.
- `bake_rounding_computed_prompt_fix` — the validator fix addresses **3 of 11** measured failures.
  The other 8 (rounding, arithmetic) are prevented *for `area-email` only*, by handing copy-ready
  facts. `zip` / `brain` / `corridor` still hand raw values and still fail.
- `zhvi_median_brain_metric_label` — residual upstream brain label.
- **No real bake has run.** Everything above is dry-run + unit tests. A first real `area-email` bake
  is a paid run and is operator-gated.

**Closed with evidence:** `zhvi_median_mislabel_email` — already fixed 07/18/2026 (the figure was
REMOVED from `market-context.ts`); tree-wide check finds zero consumers calling ZHVI a median. It
had been sitting open as a stale obligation, not a live defect.

## §4 — Phases

### Phase 0 — DIAGNOSED 08/06/2026. The validator is mostly RIGHT; the prompt is what's wrong.

The check has said "5 surfaces fail the no-invention validator" since 07/26 without anyone naming
the numbers. Pulled the real run log (`gh run view 29962120766 --log-failed`, the last bake, which
was **07/22/2026 — the bake has not fired in 15 days**) and replayed each failing key's inputs
through `buildNumberWhitelist`. All 11 failures resolve into exactly three classes:

**Class A — scale notation. Validator bug. 3 cases.** The value IS in the inputs; only its notation
differs, and the validator compares *strings*, not values.
- `price-distribution-swfl` wrote `300000`; inputs hold `300` (a `$300K` bucket label).
- `zip/34116` wrote `3.0`; inputs hold `3`.
- `licenses-swfl` wrote `18`; inputs hold `0.18` ("Certified Building Contractor Share = 0.18").
  Writing that as 18% is a *faithful* restatement of a share.

**Class B — rounding. Real defect. 5 cases.** A different number, presented as fact.
- `properties-collier-value` `37` ← `36.50%` · `freshness-pulse` `400000` ← `$399,900`
- `zip/34134` `93` ← `93.7%` · `zip/34135` `15` ← `14.72` · `tourism-tdt` `1.0` ← `1.04`

**Class C — computed. Real defect. 2 cases.**
- `freshness-pulse` `75000` — no relation at any scale; `$400,000 − $325,000 = $75,000` is the
  arithmetic it almost certainly did across two provided figures.
- `econ-dev-swfl` `100` — inputs are announcements `1` (last 90d) and `0` (prior). "100%" is a
  derived change, and from a zero base it isn't even defined.

**So 8 of 11 failures are genuine.** Do NOT "fix" this by loosening the gate — that would ship
rounding and arithmetic. And note Class A's `×100` case is *ambiguous*: legitimate for a share
(`0.18` → 18%), illegitimate for `econ-dev`'s derived 100%. A blanket percent allowance would let
Class C through. Scale-normalize only the unambiguous cases (K/M expansion, trailing-decimal-zero).

**The actual root cause is a prompt/input conflict.** `buildNarrativePrompt` hands raw values
(`0.18`, `1.04`, `36.50%`, `93.7%`, `14.72`) and instructs "never round." A writer told to produce
plain English for a local reader will round — that is what readable prose does. The instruction and
the material are in conflict and the model resolves it the human way, every run.

**The fix is market-pulse's, applied here:** don't hand raw values and ask for restraint — hand
**display-ready strings already written the way they should appear**, so "restate verbatim" becomes
trivially satisfiable instead of a rule the material fights. This is why `assembleAreaEmailInputs`
(Phase 1) formats every fact reader-ready at assembly time rather than inheriting the raw-value habit.

### Phase 0 — Make the bake green before hanging anything else on it. **BLOCKING.**

Open check `narrative_bake_invented_number_rejects` (opened 07/26/2026, 17 days untouched):
*"narrative-bake exits red every run: 5 surfaces fail the no-invention validator (invented counts not
present in bake inputs); previous rows kept, nothing invented ships."*

Verified how bad it is, in code, before treating it as a blocker: failures are **per-key isolated**
(`t.failures.push(\`${surface}/${key}\`)` per entry; the loop continues; `upsertNarrative` still runs
for healthy keys). So a new adapter *can* reach a written row today. But:

- there is no green baseline, so a new adapter's failures are indistinguishable from the standing red
  at the exit-code level (CI/cron can only see exit 1);
- the failing class — **invented counts not present in inputs** — is the *same defect* market-pulse
  already solved and the exact thing "checked before it hits builder" is supposed to guarantee.
  Shipping a 4th adapter onto a validator that is failing this way ships the bug it was meant to stop.

**Do:** apply market-pulse's proven discipline to the bake prompt (`lib/narratives/prompt.ts`) — the
narrator receives **settled English sentences, never a set** (`pulseUserMessage` takes
`SettledClaim[]`, not `ZipMove[]`; the *signature* is the gate). A model given a set will count it;
that is the documented 07/13/2026 defect ("Five of those six ZIPs" when the answer was four). Close
the check with a green run, pasted.

**Also do, same phase — the catalog check (failure #9).** `docs/standards/data-roots.md:75` demoted
ZHVI on 07/18/2026: no user surface serves it as a VALUE, and trap T2 says plainly *"ZHVI is a
typical-value INDEX, not a median."* Line 258 records the mislabel as still live in three places,
**email among them**. `market-pulse.ts` — the first recipe queued for baking — reads
`home_values_by_zip.home_value_zhvi` / `value_mom_pct`. Baking it as-is caches a labeling defect
across 52 rows. The no-invention validator will not catch this: the number is genuinely in the
inputs; it is the *label* that lies. Fix the label before the first bake, or the feature's headline
benefit is faster wrong copy.

**Done when:** `bun scripts/bake-narratives.mts --surface all --force --dry-run` clean AND one real
gated run exits 0, AND no area fact entering the bake calls an index a median. Also closes
`bake_green_post_collision_fix`.

### Phase 1 — TDD the `area-email` adapter (no model calls)

Per RULE 3.5, tests first, each named for the failure mode it targets.

1. `listAreaEmailSurfaceKeys()` — the bounded key set. Start from the same source
   `listZipSurfaceKeys` uses; a key that isn't in Lee/Collier never enters the set.
2. `assembleAreaEmailInputs(key)` → `BakeInputs | null`. **Every fact is code-computed**, the same
   way `settledPulseFacts` computes counts/ranking/range in `market-pulse.ts`. Null (not an empty
   bake) when the area has no sourced facts — an unbaked key falls back live, never ships blank.
3. Register in `SURFACE_ADAPTERS`.

**The one open design question, flagged not hidden:** whether the email area read is a *new* surface
(`area-email`) or reuses the existing `('zip', key)` row that `zip-seed.ts` already reads. Reuse is
one row and zero drift; a separate surface exists only if the email voice must differ from the report
page voice. **Recommendation: reuse `('zip', key)` first** — `zip-seed.ts` proves it renders — and
split only if the voice genuinely diverges. Cheaper to split later than to merge two drifted rows.

### Phase 2 — Read-through on the area recipes, live-generate preserved

For each `subject: "area"` recipe, in this order (smallest blast radius first):
`review-reply` → `market-pulse` → `sphere-weekly` → the rest.

- `const baked = await loadNarrative(surface, key)` before the narrator call.
- Hit → use the baked read; the builder authors **only** the CTA + the one house/moment-specific line.
- Miss (`null` — new key, never baked, bake behind) → **generate live exactly as today**, gate as
  today. RULE 0.7: a build is never refused for a missing precomputed row.
- The row's validation state travels with it. A narrative that was hard-stripped on write must be
  marked as such, not silently served as clean.

### Phase 3 — Cadence + proof

- The bake needs **no new cron**, but be precise about how it fires — `ingest/cadence_registry.yaml`
  `jobs:` (line 2553): `narrative-bake` / `narrative-bake.yml`, *"Chained off daily-rebuild's
  completion; **own schedule retired 07/12**."* It is a CHAIN off daily-rebuild, not a standalone
  schedule. A new surface inherits that trigger; it also inherits the failure mode that if
  daily-rebuild doesn't complete, the bake never fires and every area recipe silently falls back to
  live generation (which is correct behavior, but invisible — see failure #10).
- Prove it the way this repo proves things: render it and look
  (`scripts/email/render-market-pulse.mts` pattern), screenshot, paste the acceptance lines.

**Explicitly NOT in this plan:** Vercel Workflows. The prior research recommended starting with cron,
and that recommendation now costs nothing to follow — the cron already exists and already runs this
pipeline. Adopting a new managed product for a job already done by a working script fails RULE 11 and
RULE 0.9 §3. Revisit only if the chain grows genuinely multi-step.

---

## §5 — Failure modes and the guard for each (RULE 3.5)

| # | Failure | Guard |
|---|---|---|
| 1 | **Stale-serve** — baked row outlives its inputs | `inputsHash()` delta gate. Already built; nothing new. |
| 2 | **Invented number cached and re-served** — the worst case; a bad read served confidently to every build instead of failing once | Phase 0 blocks on it. `validateNarrative` no-invention lint + settled-sentences-only prompt. Fail-closed: previous row kept. |
| 3 | **Silent-empty** — cache miss renders a blank slot | `loadNarrative` returns null on any failure; Phase 2 falls back to live generation. Empty-tolerant contract, same as `getSourcedFigures`. |
| 4 | **Address recipe wrongly routed to a baked row** — serving a generic area read as if it were about a specific house | Route on `Recipe.subject`, which is a required compile-time field. An `address`-spined recipe cannot reach the read-through path. |
| 5 | **Red bake hides a new adapter's failures** | Phase 0 is blocking, for this reason. |
| 6 | **Bake spend runs away** | Existing `NARRATIVE_BAKE_RUN_CAP_USD` (default $1/run), cadence gate, metered-client daily/monthly caps. A key that doesn't fit the cap is dropped **loud** and re-queues (its hash is never stored). |
| 7 | **Batch never returns** | Vendor-verified: batches **expire at 24h**. `narrative_bake_batches` already persists pending batches and Phase 0 of the script collects them on the next run. |
| 8 | **Run-cap silently under-bakes** — already happening: check `zip_narration_residual_unbaked` (47 of 91 ZIPs baked, rest re-queued) | Not introduced by this plan, but the area recipes will inherit it. A key that has never been baked must be indistinguishable-from-miss → live fallback (#3). |
| 9 | **Baking a known mislabel across 52 keys.** `docs/standards/data-roots.md:75` — ZHVI was **demoted 07/18/2026**: *"no user surface serves the index as a VALUE (charts/map/email swapped to real medians)"*, legit remaining use is YoY-growth panels + investor yield only. Trap T2: *"ZHVI is a typical-value INDEX, not a median."* Line 258 records the mislabel as **still live in three places, email among them**. `market-pulse.ts` reads `home_values_by_zip.home_value_zhvi` / `value_mom_pct` — so the first recipe queued for baking sits on exactly this defect. Precomputing it would cache a labeling error into 52 rows and serve it faster and more confidently. | **Added to Phase 0, blocking with the validator fix.** Before any area surface bakes, confirm every figure entering `assembleAreaEmailInputs` is labeled as what the catalog says it is — an index is called an index, never a median. The no-invention validator cannot catch this: the number IS in the inputs, it is the *label* that lies, so this needs a naming check, not a numeric one (RULE 3.5's scope limit — a green test suite is not a guard against a class it was never built for). |
| 10 | **Bake never fires and nobody notices** — it is chained off daily-rebuild (§Phase 3), so a failed upstream means zero bakes, and every area recipe falls back to live generation. Correct, but silent: the feature appears to work while delivering none of its benefit. | Live fallback keeps output correct (#3). Add an observable signal — a stale `baked_at` on the area surface should surface the same way other freshness gaps do, not be discovered by reading `api_usage_log` months later. |

---

## §6 — Vendor facts, verified live via crawl4ai 08/06/2026 (not memory)

`https://platform.claude.com/docs/en/build-with-claude/batch-processing` — Message Batches API:

- **50% cost reduction**; most batches complete in **under 1 hour**.
- Results retrievable when all requests finish **or after 24 hours, whichever comes first**;
  **batches expire if not complete within 24h**; results downloadable for **29 days**.
- Limits: **100,000 requests or 256 MB per batch**, whichever hits first. (Our largest surface is 52
  keys — three orders of magnitude of headroom.)
- **Tool use is supported in batch**, including forced tools and server tools. Load-bearing: the
  narrative path uses a forced tool (`tool_choice: {type: "tool"}`), so it batches.
- **Not supported in batch:** `stream: true`, `speed` (Fast mode), `store`/`previous_thread_event_id`,
  `cache_hint`/`context_hint`, `max_tokens: 0`, `research_preview_2026_02`.
- Doc recommends the **1-hour cache duration** with prompt caching for batches, since batches exceed
  the 5-minute ephemeral window. Relevant if the bake prompt ever clears the cacheable floor — note
  that `build.ts:352-356` already records that its ~450–500-token system prompt sits *under* Sonnet's
  1,024-token minimum, so the existing breakpoint never activates. Do not assume a cache benefit
  without re-measuring `cache_creation` in `api_usage_log`.

---

## §7 — What needs an operator call before Phase 2

1. **Reuse `('zip', key)` or mint an `area-email` surface?** Recommendation in §4 Phase 1: reuse.
2. **Phase 0 is blocking — confirm.** It means fixing a 17-day-old open defect before new feature
   work. The alternative is building on a validator that is failing at the exact thing this feature
   promises.
3. **Nothing here is committed or pushed.** Per standing rule, no push without confirmation.
