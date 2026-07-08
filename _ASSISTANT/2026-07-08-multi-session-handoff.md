# Multi-session handoff — 2026-07-08

Where every live Claude checkout actually is right now, verified against `git status`/`git log`/`git diff`
(not memory), and what to do with each when you're back. Three locations have live, uncommitted or
unmerged work:

| Location | Branch/HEAD | State |
|---|---|---|
| `C:\Users\ethan\dev\brain-platform` (this repo, `main`) | `38e1aaa1`, in sync with `origin/main` | 17 files uncommitted, 3 untracked files, 4 mixed threads |
| `C:\Users\ethan\dev\bp-fold` | **detached HEAD** `79794ed3`, no branch | 1 commit, unreachable by any ref except this checkout — orphan risk |
| `C:\Users\ethan\dev\bp-pipeline-census` | `wt/pipeline-census` `622b1c83` | 3 commits ahead of main, 48 behind — stale, needs rebase |

---

## 1. Main repo (`main`) — uncommitted, 4 separate threads bundled in one working tree

Working tree is clean history-wise (main == origin/main), but there's a full day of uncommitted work
sitting on top. **These are four unrelated threads that happen to be dirty at the same time** — split
them into separate commits, don't squash into one.

### 1a. One Assistant unification — web-fallback rung (#12) — looks DONE, needs verify+push
Files: `lib/assistant/web-fallback.ts`, `lib/assistant/conversation-path.ts`, `lib/assistant/report-path.ts`.

This is the next step flagged in `_ASSISTANT/TODAY.md` item 11 ("web-fallback rung (#12)"). New shared
`webFallbackForAnswer()` in `web-fallback.ts` replaces the conversation-path-only
`webFallbackForConversation` and is now called from **both** `conversation-path.ts` and
`report-path.ts` — so the report dock (popup/highlighter path) now checks the live internet for a
figure the dossier doesn't hold, same as the chat path. Looks structurally complete (one shared
function, both call sites wired, no dead code left behind).

**Next when you're back:**
- Run `bun test lib/assistant` and `bunx next build` to confirm green.
- Manually smoke the report-dock path with a figure-ask it wouldn't otherwise hold, confirm a cited
  web answer comes back (not a deflect).
- Commit as its own commit, push per RULE 1.

### 1b. SWFL scope correction — 6-county → Lee+Collier+Hendry core
Files: `refinery/packs/catalog.mts`, `env-swfl.mts`, `hurricane-tracks-fl.mts`, `storm-history-swfl.mts`
(+ their `.test.mts`), `refinery/sources/env-swfl-source.mts`, `fema-nfip-source.mts` (+test),
`storm-history-source.mts` (+test) — **and** `lib/assistant/conversation-path.ts`'s `PUBLIC_SYSTEM`/
`OUTSIDE_SYSTEM`/`PUBLIC_GROUNDED_SYSTEM` prompts (Charlotte/Glades/Hendry/Sarasota stripped out of the
assistant's own claimed coverage).

This is the correction CLAUDE.md already locked 07/07/2026: *"SCOPE: Lee (12071) + Collier (12021) —
the two core, data-rich counties; Hendry (12051) is a small minor addition… Charlotte/Glades/Sarasota
are NOT real coverage today — don't claim them."* This diff is that correction landing in code: new
`SWFL_COUNTY_COUNT` constant replaces hardcoded `6`, catalog/pack prose rewritten to "core counties",
NFIP county-code fallback lists trimmed from 6 FIPS codes to 3 (`12071+12021+12051`).

**Next when you're back:**
- Packs touched → pre-push Gate 5 (`catalog.test.mts` mirror + each pack's own `bun:test`) and Gate 2
  (vocab coverage) both apply. Run `bun refinery/tools/check-vocab-coverage.mts --all` and the pack
  test suites before pushing.
- Grep for any other `12071.*12021.*12015\|6 SWFL counties\|6-county` strings that this sweep might
  have missed elsewhere in refinery/lib or docs.
- Commit separately from 1a/1c — this is a data-honesty fix, not a feature.

### 1c. Map fix — Fort Myers Beach island correction
Files: `public/maps/lee-collier.svg` (1174 → 4 lines — full replace, not an edit), `public/maps/swfl-zcta.geojson`
(full content replace).

Matches the open TODO in `_ASSISTANT/TODAY.md` item 14: the old contractor SVG welded Fort Myers Beach
(33931) to the mainland, which is why the ZIP choropleth was pulled from `/r/zip-report`. This looks
like the corrected map landing.

**Next when you're back:**
- Visually confirm 33931 renders as a real, separated island in the new SVG before trusting it.
- If confirmed, this unblocks re-adding the County-section choropleth block that was deliberately
  pulled — `lib/report/zip-choropleth-data.ts` + `ZipChoropleth` are already built and waiting per
  TODAY.md item 14.
- Confirm which script produced the new SVG (TODAY.md references `scripts/clean-contractor-map.mjs`)
  and that it's reproducible, not a one-off hand edit.

### 1d. New — Hyperlocal geo-scope + reach-weighting (RESEARCH BRIEF, not approved)
File (untracked): `docs/superpowers/specs/2026-07-07-hyperlocal-geo-scope-reweighting-design.md`.

Explicitly marked "NOT approved to build. No code touched." Proposes replacing the naive
substring city-matcher (`ingest/lib/pulse_match.py:47`) with a real place hierarchy + reach-weighting
so hyperlocal facts stay local and big news climbs the geography. Has 7 open questions for the
operator (gazetteer source, reach rubric, discrete vs continuous weight, ambiguity handling, etc).

**⚠ Cross-reference:** the `bp-pipeline-census` worktree (see §3 below) already has an UNMERGED,
48-commits-stale "Phase 1 deterministic city/corridor matcher" commit (`9a5e583e`) touching this exact
same matcher. Read this new research brief before touching or landing that old worktree commit —
they may now conflict in approach, and the brief explicitly says it *supersedes the framing* in
`pulse_match.py`.

**Next when you're back:** this is a read-and-decide, not a build. Answer the 7 open questions (or
just the gazetteer-source one, which blocks everything else), then brainstorm before any code.

### 1e. Scheduling policy spec — addendum, one open question
File: `docs/superpowers/specs/2026-07-07-scheduling-policy-design.md` (+42 lines, existing spec).

Adds a rollout plan (Phase 1/Phase 2, checks to open per RULE 2.4) and flags one open scope question:
is 07:00–23:00 ET a hard-coded allowed send window, or should it track the BATCH window as that
widens later? Recommends hard-coding now, revisiting later — needs an operator yes/no, not code.

### 1f. Minor / housekeeping
- `CLAUDE.md`: documents the already-working crawl4ai PATH shim (`crawl4ai <url>` alias) — pure docs,
  safe to push standalone.
- `.claude/settings.json`: removes the `check-build-context.mjs` PreToolUse hook. **Unclear why** —
  verify this was intentional (dead hook? superseded by something?) before pushing; don't let a hook
  silently disappear.

### 1g. Untracked files to dispose of (not part of any active thread)
- `_ASSISTANT/2026-07-07-handoff-answer-highlight-session.md` — a handoff written for Codex during a
  **now-resolved** incident (a blocked push over an unverified follow-up-chip fix, plus a caught-before-
  written fabrication near-miss in `verification/answer-proofs.jsonl`). Verified: both commits it
  discusses (`7a0d2b31`, `3a4bda91`) are now on `origin/main`, the push went through, and
  `answer-proofs.jsonl` has fresh legitimate entries through 07/07. This file is now history, not an
  open task — delete it or move it under a resolved/archive folder so it doesn't get mistaken for
  live-blocking state.
- `response.html` — 90KB, no extension context, sitting at repo root. Looks like a stray debug/test
  dump (not present in any commit). Check what it is before deleting; if it's scratch output it
  belongs in the scratchpad, not the repo root.

---

## 2. `bp-fold` worktree — ORPHANED COMMIT, fix this first

```
git -C C:\Users\ethan\dev\bp-fold log --oneline -5
79794ed3 feat(billing): socials promo band, Postiz-style monthly pricing, highlighter off on /billing
02a0d26e feat: gate nudge chip to actionable (pending/built) steps only — display-side, adapter still records all (design C)
2d2d9af6 feat: render dismissible lifecycle-arc nudge chips on the arc strip
4f65d818 feat: expose + dismiss lifecycle_nudges via the sequence API
ea3e55e6 feat: daily cron wrapper for lifecycle-arc nudges
```

The bottom 4 commits (`02a0d26e` through `ea3e55e6`) are **already merged into `main`** — that's the
shipped ARC-nudges / lifecycle work (`project_arc-nudges-design-C-display-gate.md`). Only the top
commit, `79794ed3` (billing: socials promo band + Postiz-style monthly pricing + highlighter off on
`/billing`), is new and **is not on any branch** — this worktree is in detached HEAD with nothing else
pointing at that commit. If this worktree gets removed or someone checks out a different commit here,
that billing work becomes unreachable (eventually GC'd).

**Do this first, before anything else, next session:**
```
git -C C:\Users\ethan\dev\bp-fold branch wt/fold-billing HEAD
```
That alone makes the commit safe. Then decide: land it via `node scripts/worktree.mjs land fold-billing`
(rebases onto main, prints finish commands) or review the diff first if the billing/pricing change
needs a look before merging.

---

## 3. `bp-pipeline-census` worktree — stale, needs rebase before landing

3 commits, self-contained and small:
```
622b1c83 feat(census): capture SteadyAPI meta.total into data_lake.source_totals instead of discarding it
c3c29020 feat(census): add data_lake.source_totals — ledger for live source-total reconciliation
d1a2ea40 docs(ingest): document source_scope registry schema for the pipeline data census
```

But the branch is **48 commits behind `origin/main`** — a straight `main..HEAD` diff shows ~10,800
deleted / 2,400 added lines, which is almost entirely stale-branch noise (things main already moved
past), not real work in this branch. The actual payload is just the 3 commits above: a
`data_lake.source_totals` reconciliation ledger + migration (`migrations/20260707_source_totals.sql`,
not yet confirmed applied to prod) + wiring SteadyAPI's `meta.total` into it instead of discarding it.

**Next when you're back:**
- Rebase onto current `main` (expect real conflicts given the age — `ingest/pipelines/city_pulse/*`,
  `lib/assistant/conversation-path.ts`, and several refinery files have all moved).
- Re-run the pipeline-census suite after rebase, then `node scripts/worktree.mjs land pipeline-census`.
- Check whether `migrations/20260707_source_totals.sql` has already been applied directly to prod
  (per RULE 1's "SQL migrations: run directly" — possible this already landed outside git) before
  re-running it.
- Note the pulse-matcher cross-reference in §1d above before assuming the Phase-1 matcher commit
  (`9a5e583e`, already on this branch, older than the 3 listed here) is still the right approach —
  the new research brief may change the plan for that file.

---

## When you're back — suggested order

1. `git -C C:\Users\ethan\dev\bp-fold branch wt/fold-billing HEAD` — stop the bleeding on the orphan.
2. In `main`: split the 4 threads (§1a–1c) into separate commits; run the relevant test/gate commands
   for each before pushing; leave 1d/1e as read-and-decide, not code.
3. Decide on `.claude/settings.json`'s hook removal (§1f) — intentional or accidental.
4. Clean up the two stale untracked files (§1g) or confirm they're worth keeping.
5. Land `bp-fold`'s billing commit (worktree land or review-first).
6. Rebase and land `bp-pipeline-census`, checking the migration-already-applied question first.
