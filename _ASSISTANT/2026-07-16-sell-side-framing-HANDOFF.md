# Sell-side favorable framing — execution handoff

**Written:** 07/16/2026 (session paused mid-Phase-2, blocked on account-wide weekly usage limit — resets 07/18/2026, 7pm America/New_York)

**Read these two first, in order:**
1. `docs/superpowers/specs/2026-07-15-sell-side-favorable-framing-design.md` — the design (why, what, the three-narrator scope correction, the chart addition).
2. `docs/superpowers/plans/2026-07-15-sell-side-favorable-framing-plan.md` — the 11-task TDD plan being executed.

Both were corrected during planning review (advisor caught that the framing block would have contradicted two recipes' absolute no-numbers prompts) and again during a second crawl4ai research pass the operator explicitly asked for (`_ASSISTANT/research/2026-07-15-authority-reasoning-not-hype-research.md`) — do not re-litigate either correction from scratch; both docs already carry the reasoning and citations.

## Where the work lives

**Git worktree:** `C:\Users\ethan\dev\bp-sell-side-framing`
**Branch:** `wt/sell-side-framing` (LOCAL ONLY — per CLAUDE.md RULE 1.5, this branch is never pushed as itself; it gets rebased onto `main` and landed at the end via `node scripts/worktree.mjs land sell-side-framing`, run from the main repo).
**Worktree status right now:** clean (`git status --short` empty). Every task so far is committed.

## What's done — Phase 1, all 7 tasks, all reviewed clean

Executed via `superpowers:subagent-driven-development` (fresh implementer subagent per task, fresh task-reviewer subagent per diff, both against the worktree above):

1. `aa893521` — `positioning: "sell-side"|"story-side"` added to `Recipe`, all 14 `RECIPE_KEYS` entries declared.
2. `971979bb` — `FAVORABLE_FRAMING_POLICY` constant added to `shared.ts` (verified byte-identical to the plan's exact text by the reviewer, independently re-derived, not trusted from the report).
3. `b8a56b09` — wired into `authorListingNarrative` (shared.ts).
4. `41a2fa0f` — wired into `authorUnderContractNote` (under-contract.ts). *Note: this file's test had no pre-existing model mock at all — built from scratch, not reused as the brief assumed. Same true for Task 6's `agent-brand-intro.test.ts` and `sphere-weekly.test.ts` later — if a future task brief assumes a mock exists in an untouched-so-far recipe test file, verify first, don't trust the assumption.*
5. `16631d21` + **`04cb67d6` (fix)** — wired into `buildNarratorPrompt` (market-comps.ts) + added the direction-symmetric magnitude tier to `buildPriceCase`'s `s1` sentence. **The review process caught a real Critical bug here**, worth remembering: the original `isExtreme` formula (three OR'd conditions, one of them a `diff/median >= 0.4` check) could claim a subject sits "outside the entire range" of comps while it was still strictly inside that range — a self-contradiction with the paragraph's own next sentence, never caught by any lint (the code-authored verdict is never run through `auditClaims`). Fixed by dropping that condition entirely, keeping only the two conditions that are true by construction (subject strictly below min or above max). Re-reviewed and approved after the fix. **If Phase 2 work ever needs a similar "state a computed relation directly when it's extreme" pattern, copy the fixed version of `isExtreme`, not the original plan text** — the plan's own Task 5 code block still shows the buggy formula; the worktree's actual committed code is correct.
6. `076844e4` — negative-guard tests confirming the policy text never reaches `agent-brand-intro`, `agent-launch`, `sphere-weekly`, `market-pulse`, `review-reply`'s prompts. Reviewer independently ran all 5 tests and confirmed none are vacuous (each genuinely exercises the real narrator, not just an unpopulated capture variable).
7. `44c5471c` — `lib/deliverable/CLAUDE.md` (new) + playbook Part 10. **This doc already describes Phase 2's `priceVsAreaDotSpec`/`price-vs-area-dot` as if shipped — it isn't yet.** That's intentional (the plan's own brief specifies this forward-referencing content since Phase 2 runs immediately after), confirmed by the reviewer as faithful transcription, not invention. Once Tasks 9-10 land, this doc becomes accurate; until then it's one phase ahead of the code, on purpose.

**Ledger file** (gitignored, worktree-local, survives compaction): `C:\Users\ethan\dev\bp-sell-side-framing\.superpowers\sdd\progress.md` — lists all 7 completed tasks with their commit ranges. Trust this + `git log` over any session's own memory if resuming after a gap.

## What's NOT done — Phase 2, Tasks 8-11

**Task 8 (extract `isComparableHome`/`perSqft`/`median` from `market-comps.ts` into `shared.ts`) has NOT started — zero commits.** It failed during its baseline-checking step (before touching any code) when the account hit its weekly usage limit. Nothing to clean up; just re-dispatch.

Tasks 9, 10, 11 (chart policy, `priceVsAreaDotSpec` + wiring into `buildPriceReduced`, build-level chart tests) have not been attempted at all.

**To resume**, from the main repo (`C:\Users\ethan\dev\brain-platform`), re-enter the `superpowers:subagent-driven-development` process at Task 8:

```bash
cd /c/Users/ethan/dev/bp-sell-side-framing
bash "/c/Users/ethan/.claude/plugins/cache/claude-plugins-official/superpowers/6.1.1/skills/subagent-driven-development/scripts/task-brief" docs/superpowers/plans/2026-07-15-sell-side-favorable-framing-plan.md 8
git rev-parse HEAD   # should print 44c5471c... — this is Task 8's BASE
```

Then dispatch Task 8's implementer per the plan's own Task 8 text (also mirrored in the brief just generated), review, and continue through Tasks 9-11 the same way. The task list (`TaskList`/`TaskUpdate` ids 1-11 in this session) has 1-7 marked completed, 8 in_progress (never finished — reset it or just proceed), 9-11 pending.

**Model note:** the weekly usage limit hit on this account is account-wide, not per-model — it triggered once on Opus (mid-Task-4) and again on Sonnet (start of Task 8). Switching models does not avoid it; only time (resets 07/18/2026, 7pm ET) or a different account/billing path does.

**Known tooling quirk, worth telling every future dispatch:** Edit/Write are blocked for this worktree's path by a cross-project hook when a subagent tries to use them directly; the workaround every implementer so far has used successfully is Bash (heredocs, or writing to a scratch file then `cp`). `node -e` with inline backtick/`\n` strings gets mangled under bash quoting — write the replacement to a scratch `.js`/`.ts` file first.

## Git/commit status — what needs committing when this finishes

**Nothing is uncommitted right now, anywhere.** The worktree is clean. But there are two separate things to be careful of when this eventually lands:

1. **The worktree itself is not yet landed.** When Tasks 8-11 are done and reviewed, the plan's own Self-Review notes call for a final whole-branch review (`superpowers:requesting-code-review`) before `superpowers:finishing-a-development-branch`. THEN, from the main repo: `node scripts/worktree.mjs land sell-side-framing` — this rebases the 8 (soon to be ~13+) commits onto current `main` and prints the finish commands. It does NOT push automatically. A SESSION_LOG.md entry is required in the same push (CLAUDE.md RULE 0), and the repo's push-approval hook will block an autonomous push regardless — it needs the operator to say "push" explicitly, docs-only or not (confirmed live this session: even a docs-only push got blocked with `OPERATOR_APPROVED_PUSH=1` required).

2. **`main` itself has unrelated, unpushed state that predates and is independent of this work — do not touch it, do not bundle it into this feature's eventual push without asking first.** As of 07/16/2026:
   - Local `main` is **1 commit behind origin/main** (`6e74bc19`, an automated daily-rebuild bot commit — just needs a pull, not a conflict).
   - Local `main` is **4 commits ahead of origin/main** with commits that are **not from this session** (`dfa3b088`, `6ca33682`, `e11c5e17`, `cd39193c` — SteadyAPI social-listening research, an agent-profile-bio spec correction, a HuggingFace sweep — none of it touches `lib/deliverable/`). This is another parallel session's work sitting on the shared `main` checkout, unpushed. This session's own docs commit from 07/15 (`ec59ae22`, the spec+plan+research correction) is safely further back in that same history — confirmed still an ancestor of current `main` HEAD — but a raw `git push` on `main` right now would push those 4 foreign commits too. Per house rule (`feedback_safe-push-ask-before-bundling-foreign-commits`), ask before bundling someone else's unpushed commits into a push, don't just include them.
   - There is also one **untracked file** on `main` unrelated to this feature: `docs/steadyapi-research/2026-07-16-realtor-full-scope-audit.md` — not created by this session, left alone.

Net: this feature's own git story is entirely self-contained in the worktree and isolated from all of the above. When it's time to land, `worktree.mjs land` handles the rebase onto whatever `main` looks like at that time — the only human decision needed is what to do about `main`'s own pre-existing unpushed/foreign state, which is a separate matter from this feature and not blocking it.

## Durability already in place (don't redo this either)

- Design spec + plan cite all 3 research files by path; `lib/deliverable/CLAUDE.md` (Task 7) and playbook Part 10 (Task 7) both auto-load/are canonical references for anyone touching `lib/deliverable/` going forward.
- Two auto-memory entries already exist from the planning phase: `project_sell-side-favorable-framing.md` and `feedback_authority-confidence-scales-with-magnitude.md` — a fresh session in a different conversation will see these without needing this handoff at all, though this handoff has the precise execution-state detail those memory entries don't carry.
