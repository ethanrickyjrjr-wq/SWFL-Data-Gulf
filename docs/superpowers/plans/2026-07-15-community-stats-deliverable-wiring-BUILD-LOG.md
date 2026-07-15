# Community Stats → Deliverable Wiring — Build Log

> **Recommended model:** ⚡ Sonnet — 8 tasks, keywords: architecture







Durable record of the subagent-driven execution of `docs/superpowers/plans/2026-07-15-community-stats-deliverable-wiring.md`. Appended after every task's review. See also the design spec (`docs/superpowers/specs/2026-07-15-community-stats-deliverable-wiring-design.md`) and the advisor-caught join-key correction folded into it.

**Execution mode:** subagent-driven-development. Every implementer subagent runs on Opus (operator instruction). Task review is done by the orchestrating session directly (Sonnet), not a dispatched reviewer subagent — operator's "you review." No worktree — working directly on `main` (confirmed no file overlap with concurrent session activity via `git status` at kickoff; this plan's files are all under `ingest/`, `lib/listings/`, `lib/email/listing-scrape.ts`, `lib/deliverable/recipes/`, none of which the concurrent session's dirty files — `components/email-lab/TemplateGallery.tsx` and a per-unit-coverage-ledgers spec — touch).

Each task's own commit(s) carry the code; this log carries the narrative: what happened, what deviated from the plan and why, what the review found, and the test evidence.

**Scratch-path note:** this session's `.superpowers/sdd/` report files collided with a concurrent session (`abaa67d4`) also running subagent-driven-development in this same working tree — its claim on `task-1-report.md` blocked our implementer from writing there. No content conflict (different target files entirely), just a shared-scratch-path naming collision. From Task 1 on, task reports are captured directly in this build log from the subagent's inline summary + my own independent verification, rather than depending on the shared scratch file.

---

## Task 1 — `ingest/lib/community_aliases.py`: `label_by_pattern`

**Status:** DONE. Commit `4804dcff` "feat(ingest): add label_by_pattern for the neighborhood_stats alias fold" (2 files, +25 lines).

**What happened:** Opus implementer wrote the function and both tests verbatim from the task brief — TDD RED (`ImportError: cannot import name 'label_by_pattern'`) confirmed, then GREEN. No deviation from the plan.

**My review (independent):** `git diff` against base commit `85fab8e9` shows an exact match to the plan's specified code, byte for byte. Re-ran `python -m pytest ingest/lib/test_community_aliases.py -v` myself: 5/5 passed (3 pre-existing + 2 new), 0.03s, no warnings. Approved, no fixes needed.

**Note on commit SHAs below:** this session was interrupted and resumed between Task 3's dispatch and its review. On resume, `git log` showed different short SHAs for Tasks 1–2's commits than originally recorded above (`4804dcff`→`2b79be6a`, etc.) — a rebase happened in the shared working tree (concurrent-session activity, per RULE 1.5's known landmines), not a rewrite by this session. The commit *content* is unchanged and still verified; only the hash labels shifted. SHAs from Task 3 onward are read fresh from `git log` at review time.

---

## Task 2 — `ingest/duckdb_pipelines/neighborhood_stats/agg.py`: SQL-side alias fold

**Status:** DONE. Commit (current SHA) `4e990aa6` "feat(ingest): fold aliased subdivision names in SQL before median() in neighborhood_stats" (2 files).

**What happened:** Opus implementer wrote `aggregate_stats(con, alias_label_by_pattern=None)` exactly per the brief — a `_alias_map` temp table + `LEFT JOIN` + `COALESCE` resolving `resolved_name` before both the `median()` GROUP BY and the `count_by_type` GROUP BY, so the median is computed over the folded group, never merged from separate per-name medians. Backward compatible (no arg → empty map → unchanged behavior). Caught one arithmetic slip in the plan's own prose ("4 existing + 4 new = 8 tests" — actually 3 existing + 4 new = 7) and correctly treated it as a doc typo, not a blocker.

**My review (independent):** `git diff` confirms an exact match to the plan's specified SQL and Python. Re-ran `python -m pytest ingest/duckdb_pipelines/neighborhood_stats/ -v` myself: 12/12 passed (includes `test_pipeline.py`/`test_dry_run.py`, which is how I discovered those two files existed — the plan's Task 3 section wrongly claimed no test file existed for `pipeline.py`). Approved. Corrected the plan (see Task 3 below) before dispatching it, rather than let that implementer discover the gap cold.

---

## Task 3 — `ingest/duckdb_pipelines/neighborhood_stats/pipeline.py`: real fixture + guarded replace-all

**Status:** DONE. Commit `243bdf46` "feat(ingest): wire the real alias fixture into neighborhood_stats + replace instead of upsert" (3 files: `pipeline.py`, `test_pipeline.py`, `test_dry_run.py`).

**Plan correction before dispatch:** the plan's original Task 3 claimed "no existing test file for pipeline.py." Found live (see Task 2 above) that `test_pipeline.py` and `test_dry_run.py` both exist and both patch/import `_upsert` directly — both would have broken silently under the rename to `_replace_all`. Corrected the plan (commit `394dcb87`/current SHA `8d4d3b76`) to fold the exact required test updates into Task 3 *before* dispatching its implementer, rather than have the implementer hit it unbriefed.

**What happened:** Opus implementer wired `label_by_pattern()` into `_aggregate()`, replaced `_upsert` with a guarded `_replace_all` (DELETE-all + INSERT-all inside one transaction, `assert_min_rows` guard before the DELETE so a broken/empty run aborts loud instead of wiping the table), and updated both pre-existing test files exactly per the corrected brief — including the new `test_replace_all_aborts_before_delete_when_stats_is_empty` guard test and the fixed alias-fold assertion in `test_aggregate_feeds_rows_through_the_real_agg_function` (raw `"HERITAGE BAY"` now correctly asserted as folding to `"Heritage Bay"`, since the real fixture applies once `label_by_pattern()` is wired through).

The work was sitting uncommitted when this session resumed after an interruption; verified it matched the corrected plan exactly before committing.

**My review (independent):**
- `git diff HEAD` on all three files: exact match to the corrected plan text.
- `python -m pytest ingest/duckdb_pipelines/neighborhood_stats/test_pipeline.py ingest/duckdb_pipelines/neighborhood_stats/test_dry_run.py -v`: 6/6 passed (2 pre-existing untouched + 2 renamed/fixed + 2 new).
- `python -m ingest.duckdb_pipelines.neighborhood_stats.pipeline --dry-run` against live production Postgres: **failed** with `psycopg.errors.QueryCanceled: canceling statement due to statement timeout`, inside `_load_parcel_subdivision_rows()`'s unpaginated `SELECT * FROM data_lake.parcel_subdivision` (604,362 rows, no LIMIT). This function and query are **untouched by Task 3** (pre-existing code, not part of this diff) — the timeout is a pre-existing characteristic of the pipeline's full-table-read approach when run ad hoc from this connection, not a regression this task introduced. Opened check `neighborhood_stats_full_scan_statement_timeout` (project `ingest`) to track it rather than silently deferring, per RULE 2.4 — out of scope to fix as part of this plan.

Approved (all in-scope test evidence green; the live smoke-test gap is tracked, not swept under the rug, and doesn't implicate this task's actual code changes).

---

## Task 4 — `lib/listings/community-lookup.ts`: join-key lockstep + citation line

**Status:** DONE. Commit `6558b92d` "feat(listings): join-key lockstep for the neighborhood-stats resolver + citation line" (2 files, +147/-5).

**What happened:** Opus implementer added `canonicalCommunityKey()`, wired it into `resolveCommunityStats()`'s lookup and `resolveCommunityForListing()`'s returned name, added `neighborhoodStatsSourceLine()` + `ResolvedCommunityStats` + the source-supply tracking comment — all matching the plan exactly. Went beyond the brief in two good ways, on its own initiative: (1) enhanced the test mock to capture the actual `.eq("subdivision_name", …)` argument and assert it equals the canonical label, closing a gap my own plan left untested (I'd noted the existing mock couldn't distinguish query arguments and accepted that as a limitation — the implementer fixed the mock instead); (2) independently verified that Python's `_stem` (`ingest/pipelines/parcel_subdivision/resources.py`) and TS's `normalizeSubdivisionName` (`refinery/lib/subdivision-aliases.mts`) are byte-identical, confirming the two sides of the join-key lockstep actually agree rather than just trusting the existing code comment that says so.

**My review (independent):** `git diff` confirms an exact match to the plan's specified code (plus the two above-and-beyond additions, which are real improvements, not scope creep — they test something the plan should have tested). Re-ran `bun test lib/listings/community-lookup.test.ts` myself: 15/15 passed, 27 assertions, 74ms. Approved, no fixes needed.

---

## Task 5 — `lib/email/listing-scrape.ts`: `ListingFacts.communityStats`

**Status:** DONE. Commit `26f39872` "feat(email): add ListingFacts.communityStats" (1 file, +9).

**What happened:** Opus implementer added the one field + its import, verbatim from the brief, kept distinct from the existing `community` field. Ran `bunx next build` per the plan's operator-preferred typecheck command (not `tsc`) — full production build compiled clean, lint-staged clean.

**My review (independent):** `git diff` confirms an exact match to the plan's specified code — nothing more, nothing less. No separate build re-run needed; the implementer's `bunx next build` already exercised the full compile (a type-only change has no test surface of its own — Task 6 exercises it end to end). Approved, no fixes needed.

---

## Task 6 — `lib/deliverable/recipes/shared.ts`: resolve + narrate wiring

**Status:** DONE. Commit `74379a21` "feat(deliverable): wire resolved neighborhood stats into the shared subject resolver + narrator" (2 files, +118/-1). This is the payoff task — the one that makes real neighborhood stats reach all six listing-lifecycle recipes with zero recipe-file edits.

**What happened:** Opus implementer wrote `zip5From()` (ZIP from the raw address string's last comma-segment, not geocoding, so the new resolver call runs in `Promise.all` alongside the existing vendor lookup rather than serially), wired `resolveCommunityForListing()` into `resolveSubject()`, attached `facts.communityStats` only on a real `matched:true` result, added `neighborhoodStatsSourceLine(facts.communityStats)` to the narrator's `lines` array, and inserted the "THE NEIGHBORHOOD" hard-rule block right after the existing untouched "THE COMMUNITY" block in the system prompt — all exactly per the plan. Created the first-ever `shared.test.ts` for this file (3 tests: attach-on-match, undefined-on-no-match, undefined-on-no-ZIP). Ran the full `lib/deliverable/recipes/` suite as the brief required (not optional) and confirmed zero regression across every recipe.

**My review (independent):** `git diff` confirms an exact match to the plan's specified code. Re-ran `bun test lib/deliverable/recipes/` myself: 443/443 passed across 14 files, 1335 assertions, 745ms — zero regressions. No recipe file (`new-listing.ts`, `coming-soon.ts`, `just-sold.ts`, `open-house.ts`, `price-reduced.ts`, `under-contract.ts`, `market-comps.ts`) was touched, confirming the "ONE resolver, ONE narrator" architecture actually delivers what it promises. Approved, no fixes needed.

---

## Task 7 — `lib/deliverable/recipes/under-contract.ts`: settled-claim wiring

**Status:** DONE_WITH_CONCERNS → resolved. Commit `c49bf311` "feat(deliverable): settle the neighborhood-stats claim in under-contract's narrator" (2 files, +97). Production code (`under-contract.ts`) matches the plan exactly: `settleCommunityStats()` + one line in `settleAll()`, no `NarratorInput`/call-site change, as the plan's divergence note predicted.

**The implementer's three flagged concerns, and how each resolved:**

1. **The plan's own test 4 didn't survive the real gate.** My plan's test paraphrased the settled sentence ("The tax roll counts 1,900 homes...") and asserted `proseViolations(...) === []`. Run for real, it fails: `auditClaims` treats "N homes" as a COUNT-shaped claim and accepts a count ONLY as a verbatim restatement of a settled sentence — a paraphrase is correctly rejected, fail-closed, exactly as this recipe's claim gate is designed to behave (it exists because a paraphrase shipped a real invented comparison once). The implementer consulted advisor mid-task, confirmed this was the gate working as intended rather than a bug, and replaced my one (wrong) test with two precise ones: a positive proving a word-for-word restatement survives, and a negative proving the exact paraphrase from my plan is rejected with `"word-count:900 homes"`. This is a correction to my plan, not a weakening — verified by re-running both tests myself.
2. **Home-count claims are verbatim-only, project-wide.** Informational: any consumer of `neighborhoodStatsSourceLine`'s output must restate it word-for-word, never paraphrase the count. Already consistent with Task 6's own system-prompt wording ("restate ONLY the home count and median value it states, word for word") — no action needed, just confirms the design holds end to end.
3. **A real, out-of-scope finding: community names can launder a water-attribute claim.** `inventedAttributes` checks its `ATTRIBUTE_CLAIMS` word list (waterfront, canal, bay, gulf, etc.) against the full `sourceText`, which now includes the settled neighborhood sentence — and that sentence embeds the community's raw NAME (e.g. "Heritage Bay"). Any SWFL community whose marketed name contains a water word — extremely common (Bonita Bay, Miromar Lakes, River Hall, Grande Isle) — would "legitimize" the model claiming that water feature about the HOUSE, not just naming the neighborhood. Same shape as the already-fixed `BRAND_NAME`/"gulf" hole (this file already strips "SWFL Data Gulf" before matching for exactly this reason) but far larger in surface. Opened check `community_name_water_word_legitimizes_invented_attribute` (project `under-contract`) with a concrete fix direction (strip the community-name segment the same way `BRAND_NAME` is stripped) — real finding, correctly not fixed inside this task's scope.

**My review (independent):** `git diff` confirms production code is an exact match to the plan; only the test file diverges, and only in the way described above (a correction, not a weakening — the negative test locks the paraphrase-rejection behavior in place with a precise matcher, not a loose assertion that could rot). Re-ran `bun test lib/deliverable/recipes/under-contract.test.ts` myself: 80/80 passed, 194 assertions, 409ms. Approved. Concern 3 tracked via the check above rather than silently dropped.

---

## Task 8 — `lib/deliverable/recipes/market-comps.test.ts`: confirm zero exposure

**Status:** DONE. Commit `9c5989e1` "test(deliverable): lock in market-comps' zero exposure to communityStats" (1 file, +34/-1). No production code touched, as the plan specified — `market-comps.ts` deliberately never reads `facts.communityStats`.

**What happened:** Opus implementer added the one regression test exactly per the brief, using the file's real existing `SUBJECT`/`HOMES` fixtures and `buildPriceCase`/`narratorClaims` functions. Went further than asked, on its own initiative: to prove the test wasn't a tautology, it temporarily injected a fake `communityStats` leak into `narratorClaims`, confirmed the new test actually goes red and catches it ("Heritage Bay" surfaces), then reverted — leaving `market-comps.ts` itself with an empty diff, confirmed twice. Also grepped the whole recipe file to confirm `communityStats` appears nowhere in it, so `buildNarratorPrompt` (which receives the full `facts` object) has no indirect path to it either.

**My review (independent):** `git diff` confirms an exact match to the plan's specified test, plus one faithful adaptation (added `describe`/`it` to the file's `bun:test` import, since it previously only used flat `test`). Re-ran `bun test lib/deliverable/recipes/market-comps.test.ts` myself: 33/33 passed (32 pre-existing + 1 new), 249 assertions, 592ms. Approved, no fixes needed.

---

---

---
