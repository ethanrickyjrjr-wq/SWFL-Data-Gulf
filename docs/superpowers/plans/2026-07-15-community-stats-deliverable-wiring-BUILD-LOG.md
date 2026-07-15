# Community Stats → Deliverable Wiring — Build Log

> **Recommended model:** ⚡ Sonnet




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
