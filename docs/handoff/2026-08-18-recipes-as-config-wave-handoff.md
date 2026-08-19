# HANDOFF — the recipes-as-config wave (for one or several Fable 5 / Opus sessions)

**Date:** 2026-08-18 · **Operator mandate, verbatim:** "Stop writing such dumb fucking code and
simplify all of this!!! It's fucking 7 emails!!! That are coded to create the same fucking
things over and over basically!!!" — and, wrapping the night: "this has been a 2 month or more
process for something easy."

**Check:** `recipes_as_config_live_verify` (open) · **Design (approved):**
`docs/superpowers/specs/2026-08-18-recipes-as-config-amendment-design.md` — read it in full
before any work; this handoff is the execution brief, the spec is the design authority.
**Registration stub:** `docs/superpowers/specs/2026-08-19-recipes-as-config-design.md`.

**Inherited-plan skepticism applies to THIS document** (standing rule): every file:line and
claim below was verified 08/18/2026 but the repo moves — re-verify a seam live before building
on it.

## Decisions LOCKED by the operator 08/18/2026 — do not re-litigate

1. **Simplify as a WAVE over the listing lifecycle** — the 7 lifecycle emails collapse
   together onto configs + shared builders. Non-lifecycle recipes migrate per-touch after.
2. **Quick-swap = a CYCLE BUTTON** (one "Swap layout" control cycling the recipe's grid
   family; no rail thumbnails).
3. **Quick-swap = PAID** — route `"paid-only"` in `lib/email/lab/capabilities.ts`
   (`FEATURE_ROUTING`); never hardcode tier in a shell.
4. **Banks everywhere in the wave** — every lifecycle email ends up with a sentence bank;
   the model's job shrinks to digit-free connective behind the existing claim gate.

## What exists and is load-bearing (all verified in-session 08/18/2026)

- **THE ONE LAYOUT:** `buildLifecycleEmail` (`lib/email/lifecycle-chrome.ts:199`) — every
  lifecycle email flows through it; recipes hand it a `LifecycleChrome` (ribbon, photo,
  description slot, `middle`/`tail` blocks, narrative, CTA). It already sweeps every
  stats-type block through the cell-policy registry. **The wave feeds this seam; it does not
  replace it.**
- **THE ONE REGISTRY:** `lib/deliverable/recipes.ts` — `RECIPE_KEYS` (19) + `RECIPES`
  (typed `Recipe`: key, positioning, label, skeleton, prose, subject, chart, prompt, needs,
  target). `RecipeConfig` becomes a FIELD on this entry. **A second registry is the
  documented sin — never.**
- **SENTENCE BANKS (the commentary mechanism):** `lib/deliverable/language.ts` (pure
  engine) + `lib/deliverable/language-banks.ts` (typed key→bank registry) + banks live on
  `just-sold` and `price-reduced` (`recipes/*.language.ts`). Bank sentences are pinned
  character-for-character by the acceptance scripts. Model connective is gated at the
  narrator seam (`recipes/shared.ts`). Spec: `2026-08-10-sentence-banks-design.md`.
- **CELL POLICY:** `lib/deliverable/cell-policy.ts` + Gate 18 in
  `.claude/hooks/check-prepush-gate.mjs` — buyer-facing cost cells (HOA family) cannot
  render; fleet test `cell-policy.test.ts`. Configs resolve cells through the shared
  catalog; the policy class rides the catalog entry (design doc, failure modes).
- **THE STATUS PAGE (generated):** `docs/standards/email-status.md` ←
  `bun scripts/email/status.mts`; stale page = red test (`scripts/email/status.test.mts`).
  **Regenerate in the same commit as any registry/bank/script change or the suite is red.**
  This page is the operator's scoreboard — the bank column going all-yes IS the wave landing.
- **Default-grid fallback + skeleton fill:** `fillSkeletonFromSources`
  (`lib/email/build-doc.ts:725`) and the one-lane dispatch (08/02 build, pending its own
  live-verify — do not disturb it).
- **Streaming + human-wins merge:** `lib/email/lab/consume-stream.ts` — the touched-blocks
  merge rule the quick-swap MUST reuse (an edit survives a swap).
- **/go** (`app/go/page.tsx` → OneClickHero → lab door) shares this pipeline — the wave's
  output is what /go produces. No separate email logic exists there.

## The work, in order (split across sessions/subagents as you see fit)

**Step 0 — the implementation plan.** First artifact: a task-by-task plan via the
writing-plans skill (model the 08/10 sentence-banks plan:
`docs/superpowers/plans/2026-08-10-sentence-banks.md` — goal/architecture header, global
constraints, TDD tasks with explicit files). The design is approved; the plan is mechanics
only. Register nothing new — the build is registered.

**Phase A — the config layer, proven on ONE recipe.** `RecipeConfig` type (MUST survive
`JSON.parse(JSON.stringify(cfg))` identical — fleet-test it), the shared CELL CATALOG (each
cell key owns label, source lane, formatter, policy class), the keyed DERIVATIONS registry
(named functions: days-to-contract, speed-stats, comps banding…), the config-consuming
builder feeding `buildLifecycleEmail`. Migrate **under-contract** first (mid-size, 654
lines, carries the HOA precedent). Gate: its acceptance render script
(`scripts/email/render-under-contract.mts`, RED assertions already present) must pass and
the rendered email must be reviewed — render parity or a deliberately-approved diff, never
a silent change.

**Phase B — the wave.** Migrate the remaining lifecycle recipes (per the status page's
lifecycle rows: new-listing, coming-soon, market-comps, just-sold, open-house,
price-reduced — plus back-on-market if its chrome usage matches). One recipe per commit,
each behind its acceptance script. Banks ride along: every migrated recipe gets its
`.language.ts` bank — **draft sentences from the playbook's voice card (§1.20) and the
per-email section, then STOP for operator approval of the words before they ship**
(price-reduced's reword is ALREADY pending him — carry it). Parallelizable: one recipe per
subagent/worktree (`scripts/worktree.mjs`, RULE 1.5 — never push wt/*).

**Phase C — quick-swap (after ≥2 recipes have an authored alternate grid).** Alternate
configs in the recipe's entry (a FAMILY, same cell keys, different arrangement) · cycle
button in the lab · `"paid-only"` routing · swap reuses filled cells VERBATIM (test pins
byte-equal values) · human-wins touched-blocks merge (test: edit → swap → edit survives).

## Gates and evidence bar (every phase)

`bun test lib/email lib/deliverable` green · affected acceptance scripts green ·
`bunx next build` exit 0 · `bun scripts/email/status.mts` regenerated in-commit ·
campaign-sim dry (`bun scripts/email/campaign-sim.mts`) 7/7 before the wave is called done ·
RENDER AND LOOK: a green suite is not a rendered artifact — open the real output.

## Traps that will bite YOU, the executing session (all live as of 08/18/2026)

- **Read-first gates are ENFORCED BY HOOKS now:** editing `lib/email/`/`lib/deliverable/`
  code blocks until the session (or its transcript family) has READ
  `docs/standards/email-build-playbook.md` AND the area's CLAUDE.md. Put those reads in
  every subagent's prompt — the family scan usually saves a subagent whose controller read
  them, but do not rely on it.
- **Proof-of-red gate:** a push ADDING a new test file blocks unless that test was seen
  FAILING in the session's transcripts. Run each new test red first (stash the seam),
  or the push needs the documented escape.
- **Claim-read Stop gate:** naming a code file in a behavior claim you never opened blocks
  your turn end. Open files before describing them.
- **No push without the operator's word, per push** (`OPERATOR_APPROVED_PUSH=1` only when
  he says push in that conversation). Commit per task, explicit paths, never `git add -A`.
- **This is a >5-file refactor: RULE 1 puts it in ask-first territory** — build local,
  show, push on approval.
- **Bank words are the operator's** — code may draft, only he approves sentences.
- **Do not** revert or rework the 08/02 one-lane build, the cell-policy registry, or the
  chrome's layout authority. Extend seams (RULE 3 C2).
- **jargon fence:** nothing here (keys, registries, "recipes") ever appears in user-facing
  output.

## Read-first list for every executing session (in this order)

1. `docs/superpowers/specs/2026-08-18-recipes-as-config-amendment-design.md` (the design)
2. `docs/standards/email-status.md` (current state — regenerate, never trust stale)
3. `docs/standards/email-build-playbook.md` PART 0 + 1 + your email's PART 2 section
4. `lib/email/CLAUDE.md` + `lib/deliverable/CLAUDE.md` (+ their STEP ZERO research files)
5. `docs/superpowers/specs/2026-08-10-sentence-banks-design.md` + plan (the pattern to model)
6. The recipe you are migrating, end to end, plus its acceptance script

**Definition of done for the wave:** the status page's lifecycle rows read yes across
builder/test/acceptance/bank; each recipe's file is a config + (at most) a small derivations
module; one content ruling lands in one file and every email obeys it; /go builds show the
operator's approved sentences. Close `recipes_as_config_live_verify` only on operator-seen
rendered output, per phase evidence attached.
