# Follow-up — chat chart honesty build (2026-07-09)

Executes `docs/superpowers/specs/2026-07-09-chat-chart-honesty-design.md`, Phases A–E.
Phase F (closing checks) is deliberately NOT done — see "What is not done" below.

Verified: `bun test lib/ refinery/render` → **4032 pass, 0 fail** · `bunx next build` → clean.

---

## What shipped

| Phase | Surface | Result |
|---|---|---|
| A | `lib/highlighter/reach.ts` | 6 topic rules → 12. Bare verb `build` deleted from the permits regex. |
| A | `lib/assistant/follow-up-suggestions.ts` | Same one-word permit fix; residential rule extended to heat/inventory/momentum. |
| B | `refinery/render/speaker.mts` | `PACK_ID_LABELS` +18 brains; new `scrubBrainSlugs` catch-all. |
| B | `lib/highlighter/grounding.ts` | Layer 1 scrub wired at the `parts.join` chokepoint in `renderBlock`. |
| C | `lib/assistant/conversation-path.ts` | `chartForConversation` + both call sites + both `=== CHART ON SCREEN ===` blocks deleted. Hardcoded `cre-swfl` grounding generalized to a `resolveReachTargets` loop. |
| C | `lib/assistant/chart-for-question.ts` | `looksChartWorthy` deleted (its only caller was the chat auto-chart). |
| D | `lib/assistant/stream.ts` | Layer 2 scrub: tail-buffered generator, shares Layer 1's map. |
| D | `lib/assistant/conversation-path.ts` | Chart-offer paragraph and the false "You CAN also build a cited chart" line deleted from all three prompts; no-identifier rule added to all four. |
| E | `scripts/prove-chart-conversation.mts` | Repurposed: proves the inverted invariants instead of the dead chart path. |
| E | `lib/assistant/CLAUDE.md` | Area conventions updated. |

Tests added: 7 in `reach.test.ts`, 2 in `follow-up-suggestions.test.ts`, 10 in a new
`slug-scrub.test.ts`, 5 in `conversation-path.test.ts`, 3 in `chart-for-question.test.ts`.

## Three places the spec was wrong, and what I did

**1. The `home-values-swfl` routing row was dead on arrival.** `home-values-swfl` and
`investor-zip-swfl` build as brains and their packs are imported in `refinery/packs/index.mts`,
but **neither is in `BRAIN_CATALOG`** — and `reach.ts` gates every slug on
`ALLOWED = buildReportIdSet()`, which is catalog-derived. The spec's own line ("an entry for a
brain that is not published is inert rather than a crash") is true, which is precisely why the
row would have shipped as a no-op wearing a fix's clothes. **Dropped the row**; opened
`home_values_investor_zip_not_in_catalog`. Adding them to the catalog publishes them on the MCP
inventory surface, which is RULE 1 ask-first.

I probed the scarier version of this and it's false: `GET /api/b/home-values-swfl?tier=2` → 200,
same for `investor-zip-swfl`. `/api/b/*` does not read the catalog, so `routeRankedDelta` — which
fetches both ungated — is **not** broken in prod. Blast radius is `reach.ts`'s allowlist and the
MCP inventory listing, nothing more.

**2. `rents` never routed to `rentals-swfl`, and the spec's own test proved it.** The spec's
Phase A test asserts `resolveReachTargets("build me a chart of rents by ZIP")` → `["rentals-swfl"]`.
It failed. The rentals rule was `\b(rent|rental|lease|asking rent|zori)\b` — `\brent\b` cannot match
`rents`. The only reason that question ever routed anywhere was the permits hijack the same phase
deletes. Deleting `build` **exposed a second router hole rather than fixing the first one alone**.
`lib/route-chart.ts:33` had already solved this with `\brent(s|al|als)?\b`; the reach table had
drifted from it. Pluralized the rule.

**3. Layer 1 was mostly an existing function, not a new one.** `sanitizeProse` in `speaker.mts`
*already* substitutes slugs via `PACK_ID_LABELS`, and `renderBlock` already runs it on `conclusion`
and `caveats` — which is where master's dossier names its upstreams. The leak was simply that the
map had drifted 18 brains behind. Writing the spec's proposed fresh `sanitizeSlugs` would have
created a second, competing per-id pass. So: extended the map, and added one genuinely-new
catch-all (`scrubBrainSlugs`) at the `parts.join` chokepoint, which also covers metric labels and
table titles that `sanitizeProse` never sees. It carries the same `(?![-\w])` lookahead as the
per-id pass — without it, `env-swfl-spike-findings.md` gets mangled mid-filename.

## One thing that got easier

Commit `1f2c9fe4` (2h before this build, already on `main`) removed chart rendering from
`ConversationalChat`, `BriefcaseChat`, `AskAiDock`, and `HighlightPopup`. So the server was
already pushing a `{type:"chart"}` frame that **no chat client painted**, and paying for a
`composeChartFromRequest` LLM call (`TRIAGE_MODEL`) on every chart-worthy turn to build it.
Surface 2 is therefore not a behavior change at the pixel level — it's the server catching up
to the client, and a per-turn cost deletion.

## What is NOT done, and why

**Phase F: the four build-time checks are still open.** `chart_router_heat_inventory_deadzone`,
`followup_chips_build_verb_hijack`, `brain_slug_leak_runtime_no_scrubber`, and
`chart_offer_unfulfillable_by_construction` are all satisfied in code and pinned by tests — but
none of this is on `main` yet, and `public.checks` is a prod-receipt system, not a code-review
sign-off. Closing them from a local working tree would downgrade the signal. Close them with the
push that lands them.

**`chat_chart_honesty_live_verify` stays open for the operator.** It is a paid live-Haiku run.
`scripts/prove-chart-conversation.mts` is now pointed at the right invariants and will append a
proof line to `verification/answer-proofs.jsonl` when it captures a clean answer.

**This matters for the push:** `.claude/hooks/check-answer-fix-proof.mjs` gates any push that
touches answer-path files while making a fix claim, and it requires a fresh proof line in that
ledger. This diff touches `conversation-path.ts`, `stream.ts`, and `grounding.ts`. So the push
sequence is: `bun run scripts/prove-chart-conversation.mts` (operator, paid) → commit the proof
line → push.

## Four new checks opened (RULE 2.4)

- `home_values_investor_zip_not_in_catalog` — see above.
- `chart_fallback_chain_dies_on_first_fetch_error` — `buildChartForQuestion` Layer 2 wraps the
  entire `for (const slug of slugs)` loop in a single `try/catch`, so the first `fetchBrain`
  failure abandons all remaining `CHART_FALLBACKS`. Pre-existing; this build routes more traffic
  through it. The new `chart-for-question.test.ts` tests demonstrate it incidentally — `fetched`
  only ever collects one slug per run. Fix is a per-iteration `catch { continue }`.
- `located_branch_no_reach_grounding` — Surface 2 only generalized `buildGroundedRegionSystem`
  (the *no-location* branch). The located branch builds its prompt from
  `buildWelcomeGroundedSystem` and gets no reach targets. So "Which corridors are heating up?"
  gains `market-heat-swfl` grounding, but **"Is Cape Coral heating up?" loses its chart and gains
  nothing**, degrading to whatever the per-location dossier fan-out already carried. The spec is
  silent on this. Worth deciding before the live-verify.
- `reach_grounding_sequential_await_latency` — the new reach loop `await`s up to 3 brains **one at
  a time**, and it fires for a far broader question class than the `cre-swfl` special case it
  replaced (which only ran on 3 chart intents). That is added time-to-first-token on a streaming
  surface. `Promise.all` would make it max-latency instead of sum-of-latencies. The spec chose the
  sequential shape, so this is a follow-up, not a defect.

## Verification notes for whoever pushes this

- `scripts/` is in `tsconfig.json`'s **exclude** list, so `bunx next build` does *not* typecheck
  `scripts/prove-chart-conversation.mts`. I verified it separately: scoped `tsc --noEmit` shows no
  real errors (only `TS5097` artifacts from `--ignoreConfig` dropping `allowImportingTsExtensions`),
  and `bun build` resolves all 259 modules — confirming it carries no dangling import of the now-
  deleted `looksChartWorthy` / `buildChartForQuestion` symbols. Worth knowing before the paid run.
- `display-leak.test.mts` lives in `refinery/render/` and did run green. That matters because this
  diff adds entries to `PACK_DISPLAY_NAMES`, changing `displayName()` for five slugs from the
  `humanizeBrainId` fallback ("Market Heat Swfl") to a mapped name.
- `inventory`, `supply`, and `dom` are broad tokens. They will append housing/momentum grounding to
  some tangential questions. Additive and fail-open, so harmless — but it is happening.

## Lightly-verified tail

The spec column-verified `detail_tables` for `market-heat-swfl`, `housing-swfl`,
`active-listings-swfl`, and `listing-momentum-swfl`. It did **not** inspect
`price-distribution-swfl` or `seller-stress-swfl`, which I still shipped as routing rows (both are
in the catalog, so they resolve). Worst case there is a wasted fetch, not a wrong answer — but
their columns are unverified. Also unresolved and already tracked:
`active_listings_zip_county_contamination` (out-of-region ZIP labels in `active-listings-swfl` /
`listing-momentum-swfl`), which this build now routes chat grounding traffic toward.
