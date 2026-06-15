# A-9 — Self-review, ledgers, ship — **SONNET**

## Goal
Verify A end-to-end, reconcile the durable trackers, and land it (operator-approved push).

## Green gates
- **Run the FULL `bun test` suite — NOT file subsets.** The partial-`mock.module` SYNTHESIS_MODEL
  footgun throws only on subsets; the full run is clean. Do not attribute that failure to Plan A.
- `tsc`; `eslint`; `bun run build` clean (affected routes stay static where expected).
- `DELIVERABLE_MODEL` still pinned to Sonnet (cost guardrail — no Opus without operator sign-off).

## End-to-end verification (the integrated A flow)
1. **Exactly one** AI+Briefcase pill on `/`, `/charts`, `/r/<any>` while logged out (no double on
   `/r/*`, no zero off it).
2. **On `/r/*`:** pill thread persists via `HighlighterContext` AND file-this-chart works (no change
   from the retired dock).
3. **Off `/r/*` (e.g. `/charts`):** pill standalone, opens `BriefcaseChat`, files to global draft,
   **no** error from a missing `HighlighterContext`.
4. Logged-out popup: pitch + 4 example cards; each `/p/example-*` opens, cited, with a **current**
   freshness token matching live `/r/*`; both exits work (`LoginModal`; `MCPInstall` shows
   `claude mcp add ...`).
5. File logged-out → persists across nav → "Sign in to build" → OTP login → draft imported to a
   `projects` row → "Open project" → Build produces `/p/<id>`.
6. Revisit count (anon `localStorage`) changes the prompt set + CTA intensity; prompts reflect page
   context.
7. **Meter (prod row):** logged-in web build/send writes `usage_events.user_id = auth.uid`; an MCP
   build writes `client_id = mcp:<owner_uid>` with `MCP_BEARER_TOKEN` OFF; logged-out stays
   `sdg_cid`; an `is_example` build writes no usage event.

## Ledgers (same push)
- `SESSION_LOG.md` top-of-file entry.
- `_AUDIT_AND_ROADMAP/build-queue.md` marked `[x]`/`[~]`.
- `scripts/check.mjs` — open `briefcase_examples_live_verify` (prod: live `/p/example-*` tokens match
  live `/r/*`); add a dedicated **prod-migration-applied** check for A-8.5; close
  `meter_uid_attribution` only on live row evidence.

## Push
Stage only A's files (explicit paths; never `git add -A`); `node scripts/safe-push.mjs` **after**
operator diff-review approval (no autonomous push).
