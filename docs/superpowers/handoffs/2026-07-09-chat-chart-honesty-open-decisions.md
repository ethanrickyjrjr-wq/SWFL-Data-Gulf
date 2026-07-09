# Open decisions — chat chart honesty follow-up (2026-07-09)

Continuation of `2026-07-09-chat-chart-honesty-followup.md`. That handoff opened four checks;
two are fixed in this pass (see below), two are genuine operator calls and are NOT yet decided
or built. This file exists so the decision — not just the bug — survives to the next session.

## Done in this pass (clean, no decision needed)

- **`chart_fallback_chain_dies_on_first_fetch_error`** — fixed. `buildChartForQuestion`'s
  `CHART_FALLBACKS` loop (`lib/assistant/chart-for-question.ts`) wrapped all ten fallback slugs in
  one `try/catch`; the first `fetchBrain` failure abandoned every remaining fallback. Moved the
  `try/catch` inside the loop body (`catch { continue }` per slug) so one bad brain no longer kills
  the chain.
- **`reach_grounding_sequential_await_latency`** — fixed. `buildGroundedRegionSystem`
  (`lib/assistant/conversation-path.ts`) awaited up to `MAX_REACH` brains one at a time inside a
  `for` loop. Checked `fetchBrain` (`lib/fetch-brain.ts`): it's a local disk read of
  `brains/{slug}.md`, not a network call or a pooled DB connection — so there is no version of the
  documented lake-MCP connection-slot-exhaustion problem here. Switched to
  `Promise.all(reachSlugs.map(...))`; order is preserved from `resolveReachTargets` (array order,
  not resolution order) so grounding block order is unchanged. This was time-to-first-token on a
  streaming surface with no offsetting benefit, so there was no real tradeoff to weigh.

Verified: `bun test lib/ refinery/render` → 4032 pass, 0 fail (same baseline as the parent
handoff) · `bunx next build` → clean.

**Not pushed yet.** Both fixes touch answer-path files (`chart-for-question.ts`,
`conversation-path.ts`). `.claude/hooks/check-answer-fix-proof.mjs` gates any push touching those
files while making a fix claim on a fresh line in `verification/answer-proofs.jsonl`, which only
comes from `bun run scripts/prove-chart-conversation.mts` — a paid live-Haiku run, operator-run per
[[feedback_no-live-paid-api-calls-without-approval]]. That script is the same run
`chat_chart_honesty_live_verify` is waiting on. So these two fixes ride that one paid verify, not a
separate quiet push.

## Still open — needs an operator decision

### 1. `home_values_investor_zip_not_in_catalog`

`home-values-swfl` and `investor-zip-swfl` build as brains, their packs are imported in
`refinery/packs/index.mts`, and `/api/b/home-values-swfl?tier=2` / `/api/b/investor-zip-swfl?tier=2`
both return 200 in prod today. But **neither is in `BRAIN_CATALOG`**, and `lib/highlighter/reach.ts`
gates its `TOPIC_TO_SLUG` allowlist on `buildReportIdSet()`, which is catalog-derived — so chat
grounding, the chart producer, and `compose-chart`'s data menu can never route to either brain, and
they don't appear on the MCP inventory listing.

The fix is mechanical (add both to `BRAIN_CATALOG`), but doing so **publishes them on the live MCP
inventory surface** — RULE 1 ask-first territory, not a silent housekeeping change.

**Decision needed:** add both to `BRAIN_CATALOG` (makes them routable + visible on MCP inventory),
or leave them catalog-absent on purpose? If there's a reason they were never catalogued (unfinished
columns, not customer-ready, etc.), say so and this closes as "working as intended" instead of a bug.

### 2. `located_branch_no_reach_grounding`

The parent build generalized reach-grounding into `buildGroundedRegionSystem`
(`lib/assistant/conversation-path.ts`) — the **no-location** path used for questions like "which
corridors are heating up?" That path now fetches up to `MAX_REACH` topic-matched brains via
`resolveReachTargets` and appends their dossiers.

The **located** path (`buildWelcomeGroundedSystem`, `lib/welcome/grounded.ts` — used when the user
named a place, e.g. "Is Cape Coral heating up?") was not touched. Confirmed by reading it: it builds
its system prompt entirely from the per-ZIP `dossier.lines` produced by `assembleLocationDossier`,
with no `resolveReachTargets` call anywhere in that path.

Net effect: the same question, asked two ways, now behaves inconsistently —
- "Which corridors are heating up?" (no location) → gets `market-heat-swfl` grounding, chart-worthy.
- "Is Cape Coral heating up?" (named location) → no heat-brain grounding, degrades to whatever the
  per-location dossier already carried (which may not include market-heat-swfl's per-ZIP rows at
  all).

The parent spec was silent on the located branch, so this isn't a regression from a written
requirement — it's a gap the generalization didn't cover.

**Decision needed:** wire `resolveReachTargets` into the located branch too (parity with the
no-location branch), or is per-location grounding intentionally scoped to the location dossier only
(e.g. because `assembleLocationDossier` already does its own per-brain fan-out and adding reach
targets on top would double-fetch or contradict it — this needs checking, not assumed)? If the
decision is "wire it," this is a second build, not a one-line change: it needs to fetch reach targets
scoped to the detected location (ZIP-filtered), not the region-wide dossier the no-location branch
uses, and should reuse `filterOutputToZips` (already used by `buildChartForQuestion`'s city-scoping
path) rather than inventing a second scoping mechanism.

## Sequencing

Both decisions are independent of each other and of the two code fixes above. Whichever gets
decided first can be built and folded into the same paid live-verify push as the two clean fixes —
no reason to gate one on the other.
