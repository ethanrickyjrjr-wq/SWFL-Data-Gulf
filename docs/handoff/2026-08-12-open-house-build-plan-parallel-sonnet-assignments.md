# HANDOFF — Open House build plan, split into parallel-safe work packages for multiple sessions

**Written 08/12/2026.** Source of truth for WHY and WHAT: read
`docs/handoff/2026-08-12-open-house-and-build-ai-grounding-handoff.md` first — §1 is settled fact
(cite, don't re-derive), §4 is the full build plan this document slices up. This document only adds
the SPLIT: which files each package owns, so N Sonnet sessions can run at once without colliding,
and which package is not startable yet.

Research backing all four packages: `_RESEARCH/agent-behavior/2026-08-12-validator-in-the-loop-generation.md`,
`_RESEARCH/agent-behavior/2026-08-12-grounding-abstention-and-context-injection.md`,
`_RESEARCH/agent-behavior/2026-08-12-build-time-ai-grounding-outlines-critic-context-caching.md`,
`_RESEARCH/email-and-social/2026-08-12-open-house-invitation-craft.md`.

---

## Filing status as of this writing (don't re-do)

All 4 research files above are on disk and committed. 3 of 4 have `_RESEARCH/INDEX.md` lines; the
4th (`build-time-ai-grounding-outlines-critic-context-caching.md`) is written but its index line is
pending — `_RESEARCH/INDEX.md` was under an active session's claim while this doc was written.
Whichever session picks up Package 5 below finishes that in one edit.

The 5th `paid-before-free` strike line on `_ASSISTANT/STRIKES.md` (guard-gap: an already-authenticated
paid surface used for an out-of-scope purpose — see the Apify incident handoff) is also still owed,
same reason (`_ASSISTANT/STRIKES.md` under active claim). Same package.

---

## Why these 4 packages don't collide

Checked against the file lists in the source handoff's §4 — each package's files are disjoint from
every other package's:

| Package | Owns |
|---|---|
| 1 | `components/lab-entry/AddressPopup.tsx`, `components/email-lab/EmailLabGridShell.tsx`, the `ArrivalPlan`/`planSeedStart` path |
| 2 | `lib/deliverable/recipes/open-house.ts` |
| 3 | `app/api/email-lab/ai/route.ts`, `lib/project/digest.ts` (read-only reuse), `docs/standards/email-build-playbook.md` §2.6 prose |
| 4 | `lib/deliverable/recipes/shared.ts`, `lib/narratives/validate.ts` (reuse, don't fork), `scripts/email/render-open-house.mts` |

If two sessions run at once, plain `main` work is fine — no RULE 1.5 worktree isolation needed
unless a package turns out to touch a file outside its own list. If that happens mid-build, stop and
isolate via `scripts/worktree.mjs` before continuing (RULE 1.5).

**Sequencing note, not a hard block:** the source handoff calls Package 1 "unblocks everything else"
because it's the only way a REAL open-house date/time reaches the field end-to-end. Packages 2–4 can
still be built and unit-tested today using the existing CLI-argv path
(`scripts/email/render-open-house.mts:88-89`) — they don't need Package 1's UI merged first, only
its final end-to-end acceptance pass does. Build order recommendation: kick off Package 3's
prerequisite (playbook §2.6 prose) and Package 1 first since they're pure-addition, lowest-collision-risk;
2 and 4 touch code the acceptance script already asserts against, so run their acceptance script
before and after to catch regressions early.

Every package is TDD-gated (RULE 3.5) — the failure-modes/guards table below IS the required
"name the break before you build" section; write the test named after the guard, then implement.

---

## Package 1 — Capture open-house date/time in the UI

**Unblocks the others' end-to-end test, not their code.**

Files: `components/lab-entry/AddressPopup.tsx` (extend its generic gap-fields mode),
`components/email-lab/EmailLabGridShell.tsx` (`buildAfterBrand`), the `ArrivalPlan`/`planSeedStart`
path (spec: `docs/superpowers/specs/2026-07-16-seed-capture-or-blank-design.md`), then thread into
`ListingFacts.openHouseDate`/`openHouseTime` (`lib/email/listing-scrape.ts:45-46`).

Failure modes → guards:
- popup re-asks every build → persist on the project/seed; assert "ask once" in the arrival test
- free text becomes an invented date downstream → validate as a real date at capture; assertion 3 in
  `render-open-house.mts` already fails on invented day words — keep it green
- user skips → the card must be omitted, not guessed — assertion 4 covers this today

Acceptance: `scripts/email/render-open-house.mts` (all 8 existing assertions stay green) + a new
"ask-once" test on the arrival path.

---

## Package 2 — Layout: RSVP button beside the date/time card; bottom button → realtor.com listing

Files: `lib/deliverable/recipes/open-house.ts` (`dateTimeCard()` :124, `buildOpenHouse()` :175).
Blast radius confirmed narrow — `dateTimeCard()` has exactly one caller, one callee
(source handoff §1d, hosted `gx_impact`). For the bottom button, prefer fix (B) from source §1e:
read `button_destinations` off the account row via `roleDestinationsFromBrand`, same as the two live
send routes — narrow, production-proven. File fix (A) — adding the column to `PROFILE_FIELDS` +
`PROJECT_CARRY_KEYS` in `lib/brand/profile-ledger.ts` — as a separate follow-up, not blocking this.

Failure modes → guards:
- recipe writes a position literal (recipes never position) → `design-system-reachability.test.ts`
  already fails on a `layout:` literal; express "beside" via span/order, not coordinates
- `applyBrand`'s single global `website_url` override clobbers the realtor.com URL (`emails.md`
  §0.1d) → assert the rendered `href` in the acceptance script, don't trust the recipe's value
- two buttons read as two CTAs → RSVP stays the single primary, bottom link stays secondary (same
  reasoning already applied to the community button, `emails.md` §0.1c)

Acceptance: `scripts/email/render-open-house.mts` — extend with an `href` assertion on the bottom
button and a visual/DOM check that RSVP remains the sole primary CTA.

---

## Package 3 — Ground the email-lab AI: ONE AI, TWO FEEDS

**Prerequisite, same package, do first:** write playbook `email-build-playbook.md` §2.6 (Open House)
prose — marked "BUILT IN CODE, SECTION OWED." This is not someone else's precondition; it's step one
of this package because Feed 2 reads from it.

Files: `app/api/email-lab/ai/route.ts`, `lib/project/digest.ts:300` (read-only reuse — do not fork
or duplicate `buildProjectDigest()`).

*Feed 1 — project context, by REUSE, not a new mechanism.* Copy the shipped **projection + guard**
pattern already proven for project chat (source handoff §1f, RESOLVED 08/12/2026): don't inject the
raw digest — reuse `projectPageContextForPath()`'s 11-field compact shape and its stale-project leak
guard (`digest.projectId !== projectIdFromPath(path)` → undefined). **The email lab's path may not
name a project at all** — resolve which project a build belongs to explicitly, or the AI silently
inherits whichever project was opened last and describes the wrong one's data with full confidence.
This is the single highest-value guard in the whole build plan and is not optional.

*Feed 2 — this recipe's rules.* One small server-side resolver: `recipeKey` → { length profile
(`lib/narratives/length.ts`), the playbook §2.6 prose (written above), the acceptance assertion names
from `scripts/email/render-open-house.mts`, which data fields the recipe actually holds
(`docs/standards/data-roots.md`) }. Inject as a cached system prefix ahead of the volatile document
(`_RESEARCH/.../build-time-ai-grounding-...md` Topic 3: prompt caching covers `tools`→`system`→
`messages` in that order; put static content first, breakpoint before the volatile doc).

Failure modes → guards (from source §4 Step 3, all still apply):
- latency/cost is a KNOWN accepted cost at pre-launch volume — do not build a caching layer up
  front; interactive mode stays on Haiku by default
- injected block bloats every turn → measure tokens, single `cache_control` breakpoint
- resolver silently returns empty for an unknown `recipeKey` while appearing grounded → unit test
  asserting every registry key resolves to a non-empty constraint set
- AI cites a drifted constraint → derive from code roots at request time, never retype into a prompt
  string
- grounding claimed but never exercised → a promptfoo/factuality case asking "why don't I have X"
  and asserting an abstention, not a confabulated answer (`_RESEARCH/.../grounding-abstention-...md`,
  Sufficient Context finding: strong models answer instead of abstaining by measured default)

Acceptance: new factuality case (abstention test) + stale-project leak test (path with no project →
context resolves to undefined, not the last-opened project).

---

## Package 4 — Give the live narrator the guard it never had

Files: `lib/deliverable/recipes/shared.ts` (the `opts.invitation` branch, ~lines 580–617),
`lib/narratives/validate.ts` (reuse `validateNarrative()` — never write a second validator),
`scripts/email/render-open-house.mts` (new assertion 9: length + ask-present).

Pattern (CRITIC's external-feedback shape, per `_RESEARCH/.../validator-in-the-loop-generation.md`
finding #2/#9 and `.../build-time-ai-grounding-...md` Topic 1): generate → `validateNarrative()` →
on fail, one retry naming the specific violated rule → on second fail, a deterministic pre-approved
fallback. Keep the validator pure deterministic code — never let it become a second LLM call
(finding #9: an LLM-judge veto path measured 42%→~0 total-loss only because "no LLM in the veto
path"; finding #10/#12: LLM-as-judge measurably hedges toward false passes, not over-rejection).

Failure modes → guards:
- infinite retry / latency blowup → hard cap of one retry, then fallback (also budget tokens, not
  just attempt count — finding #4)
- validator rejects everything, emails silently degrade → log the fail reason; assert the fallback
  path fires in a test
- length check counts the property description or community block → use the two carve-outs already
  in `emails.md` §0.1; count the agent's own copy only
- 15–35 words (current invitation constraint) collides with the 50–125 word band elsewhere → resolve
  per-constraint with the operator (source §1g) before coding a number; never average them
- fallback rate goes unmonitored, so drift is invisible → log which path fired (pass-first-try /
  pass-on-retry / fell-through-to-fallback) per send (finding #15's "blind audit" pattern, cheapest
  version: log and look, not a live statistical alarm — none was found to exist as a named pattern)

Acceptance: `scripts/email/render-open-house.mts` new assertion 9 (length + ask present) + a
retry/fallback unit test using the CRITIC pattern above.

---

## Package 5 (tiny) — finish today's filing, once the locks clear

1. `_RESEARCH/INDEX.md` — add the line for
   `agent-behavior/2026-08-12-build-time-ai-grounding-outlines-critic-context-caching.md`, and correct
   the `agent-behavior/` and `email-and-social/` header counts (verify actual bullet count first —
   both headers were already stale before today, off by 2, independent of this session's adds).
2. `_ASSISTANT/STRIKES.md` — add the 5th `paid-before-free` strike line (text already drafted in this
   session's earlier turn; guard-gap: existing authenticated paid surface used out-of-scope).

Whichever session is free first does this — five-minute task, no design judgment needed.

---

## COORDINATION — added 08/12/2026 after all 4 plans were written. READ BEFORE STARTING ANY PACKAGE.

All four plans are on disk (`docs/superpowers/plans/2026-08-12-open-house-pkg{1,2,3,4}-*.md`). Each
was written against the real code, and four things in THIS document turned out to be wrong or
incomplete. Fix them here rather than rediscovering them per-session:

1. **The "why these 4 packages don't collide" table has a hole: `lib/email/build-doc.ts` is owned by
   NO package and is required by TWO.** Package 1 needs `BuildScope` (`:100–107`) plus a 4-line
   insert inside `authorDoc` (after `:1272`) — it is the only server-side point where a captured
   date/time can reach `facts` before `buildOpenHouse` runs. Package 3 needs `contentPatchSystem`
   (`:446`) and its two call sites (`:576` in `authorAddedSlots`, `:895` in `fillSkeletonResult`) —
   the AI route only dispatches; the system prompt the model actually reads is assembled there.
   The regions do not overlap, so git will merge them, but two sessions editing one file on plain
   `main` is the RULE 1.5 case. **Sequence them, or the second one isolates via
   `scripts/worktree.mjs`.**
2. **Assertion numbering in `scripts/email/render-open-house.mts` is double-claimed.** Package 2's
   plan claims 9 and 10; Package 4's claims 9. Whichever lands second renumbers off the live
   `checks` array length — never off a hardcoded literal.
3. **A stale-project hazard found by Package 3 lives in Package 1's file.** `EmailLabGridShell` is
   keyed `grid-${buildKey}`, not `grid-${id}-${buildKey}`, at the embedded mount — a client-side
   move between two projects' email-lab pages could serve a stale `projectId` closure, which is
   exactly the confidently-wrong-project failure Package 3's guard exists to prevent. Unverified
   without a live browser trace. **Package 1 owns the one-line key fix**; Package 3 must not reach
   into that file for it.
4. **The graph WAS available this session** — `mcp__graphify__gx_callers` / `graph_stats` load
   normally via `ToolSearch`. Package 2 reported them missing and fell back to Grep; its
   one-caller/one-callee finding for `dateTimeCard()` happened to be correct, but it is
   Grep-verified, not graph-verified. Don't record "the graph was unavailable" as a repo fact.

Two claims in this document that the plans DISPROVED against real code — do not act on them:

- **Package 2's `applyBrand` "single global `website_url` override" failure mode is dead code.**
  `lib/email/brand/apply-brand.ts:74–109` resolves destinations by ROLE (fixed 08/03/2026; the old
  blanket rewrite survives only as a comment). The live risk is the opposite shape: a NEW button
  that omits `props.role` inherits the primary-CTA website fallback.
- **Package 4's "reuse `validateNarrative()`" is blocked as literally written.** Its input type
  mandates a 1–3 item `outlook` array carrying `[INFERENCE]` tags, hedge language, a numeric base
  and a 20+ char falsifier (`lib/narratives/types.ts:17–22`, hard-failed at
  `lib/narratives/validate.ts:109–111`). A two-sentence invite has none of that. The real choice is
  an additive sibling export inside `lib/narratives` vs. a recipe-local checker — an operator call,
  not a fork.

**Package 2 is BLOCKED on an operator decision, not just under-specified.** The literal two-button
ask fails `lib/deliverable/campaign-coherence.test.ts:123` ("exactly ONE call to action", asserted
across every lifecycle email), contradicts `email-build-playbook.md:812–813`, and the bottom button
pointing at the listing is the exact anti-pattern named in `lib/email/lifecycle-chrome.ts:144–145`
("never point at what the reader is already looking at"). This session's own research measured the
cost of multi-CTA (`_RESEARCH/email-and-social/2026-08-12-open-house-invitation-craft.md` §2a). Do
not implement the second button until Ricky rules on it.

**Also unresolved and now blocking more than one package:** the 15–35 word invitation band
(`lib/deliverable/recipes/shared.ts:602`) vs. the 50–125 body band (`email-build-playbook.md:397`,
encoded at `lib/narratives/length.ts:29–36`). Package 4 needs it for assertion 9; Package 3 needs it
because the grounded AI will be TOLD which one is true, and citing the wrong one is itself the
constraint-drift failure that package exists to prevent. Neither package picked a number. Don't
average them.

---

## NOT startable — blocked on the operator

**Step 5 of the source plan (build the RSVP behavior)** cannot start until Ricky answers source
handoff §2 — mailto vs. lead-capture page vs. calendar invite. Do not guess or default; put the
three options to him directly. No package above depends on his answer, so nothing here is blocked
by this, but don't let a session drift into building RSVP handling before he's chosen.

## What NOT to re-derive (from source handoff §5, still true)

- Zero call edges between the two AI surfaces as of commit `658c25ba` (Package 3 deliberately adds
  the first edge — that's the plan, not a contradiction).
- `button_destinations` was never in the ledger — full git history searched, not a regression.
- `lengthProfile()`'s `area-email` scoping is correct, not a bug.
- `dateTimeCard()`'s blast radius is one caller / one callee.
- The narrator's constraints each trace to a real caught failure (source §1g) — don't relitigate as
  a blanket loosen.
