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
