# Chart Picker Parity (Build 1) — Handoff

**Handing off to:** Opus, same session context switch, same local checkout (`brain-platform` on `main`, no worktree).
**Push status: nothing pushed.** See "Push recommendation" at the bottom before pushing anything.

## What this is

Plan: `docs/superpowers/plans/2026-07-11-chart-picker-parity.md` (9 tasks, full plan already self-reviewed).
Spec: `docs/superpowers/specs/2026-07-11-chart-picker-parity-design.md`.
Check: `chart_picker_parity_live_verify` (open — not yet closed, don't close until Task 9).
Progress ledger: `.superpowers/sdd/progress-chart-picker-parity.md` (NOT the skill's default `.superpowers/sdd/progress.md` — that path is occupied by an unrelated, still-open desk-discovery-flywheel ledger; don't touch it).
Executing via: `superpowers:subagent-driven-development` — fresh implementer subagent per task, task reviewer per task, ledger updated after each.

Goal: expose all 12 `CHART_REGISTRY` frames in the Email Lab chart-type picker (today 5/12); build the 5 missing PNG renderers.

## Done — Tasks 1-4 (committed, reviewed clean)

- **Task 1** (drive-by fixtureOnly comment fix): commit `443a7238`. Clean.
- **Task 2** (Phase A: spark-grid + line-band picker options): commit `4140a9a8`. Clean, 1 Important non-blocking finding.
- **Task 3** (composition renderer + picker wiring, introduces the shared frameId-passthrough guard Tasks 4+ reuse): commits `3cb79910` + `b3de39f3` (split across 2 commits because a concurrent session's commit landed mid-task and reset the branch tip — verified via `git diff` that nothing was lost; both together = the intended single commit). Clean, 1 Important non-blocking finding.
- **Task 4** (z-gauge renderer + picker wiring): commit `ac2fe77e`. Clean single commit, no Critical/Important findings.

Two `checks` entries opened this session for real-but-non-blocking findings surfaced during Task 2/3 review (both confirmed not exploitable today — only the production call site always feeds a fresh spec):
- `line_band_frameid_trips_istimeseries_regex` — line-band's reshaped frameId string false-trips the pre-existing `isTimeSeries` regex, freezing further re-reshape.
- `composition_segments_missing_value_key_reshape_deadend` — composition's fabricated `segments` lack a `value` key, so re-extracting points from an already-composition spec silently no-ops.

Neither blocks anything; both are tracked for whoever eventually touches that shared re-reshape path.

All 5 commits (443a7238 → ac2fe77e) are on `main` locally, verified as ancestors of current `HEAD` (`8030756b` as of this writing — main has moved a lot from other concurrent sessions since, see below).

## Blocked — Task 5, needs a plan-level decision before continuing (also blocks Task 6)

**The real finding (verified, not a guess):** the plan's Steps 3/5 assumed `renderBklitStaticSvg` (the existing SSR bridge in `components/charts/vendor/bklit/render-static.tsx`) could server-render ANY recharts component tree, since it "just wraps things in `@react-email/render`." That's false for a REAL `recharts` (npm package) component. Root-caused against `node_modules/recharts` v3.9.0 source + empirical render (a throwaway debug script, deleted, not committed):

- `recharts`'s `MainChartSurface` gets width/height from a Redux store, populated by `ReportChartSize`'s `useEffect`.
- `useEffect` never fires in `@react-email/render`'s single-pass `render()` — no commit phase, ever.
- So `MainChartSurface` always returns `null` (no `<svg>` at all), regardless of props/dimensions.
- The bridge DOES work for `composed-bar-line` (→ `bklitComposedSvg`) and `zhvi-area` (→ `bklitTrendSvg`) — but those go through **bklit's own vendored, hand-forked** `bar-chart.tsx`/`area-chart.tsx`/`composed-chart.tsx`, which have a deliberately-added `staticSize`/`initialLoaded` prop specifically engineered to bypass this exact problem (per `components/charts/vendor/bklit/NOTICE.md`). They are NOT the real `recharts` package under the hood, despite sharing component names like `BarChart`/`ResponsiveContainer`.
- `TimelineChartCore` (storm-timeline, Task 5) and `SeasonalRadialChartCore` (seasonal-radial, Task 6) are both built on the REAL `recharts` package per the plan as written — so **this wall hits both tasks identically.**

Confirmed via `advisor` before stopping: diagnosis is solid, don't fabricate a workaround (e.g. quietly swapping in a hand-authored SVG builder just to make a test pass would violate the plan's own "one renderer, two surfaces" goal without saying so).

**Three ways forward (I asked the operator, got redirected to this handoff before an answer landed — this decision is still open):**

1. **Rebuild `TimelineChartCore`/`SeasonalRadialChartCore` on bklit's own vendored `bar-chart.tsx`/`ring-chart.tsx`** (bklit has both — checked `components/charts/vendor/bklit/` directory listing). Preserves "one renderer, two surfaces" and reuses the bridge as designed. Changes the LIVE WEB frames' actual rendering (different component library under the hood, likely different visual styling/interaction than what recharts gives today) — a real product-visual decision, not just a technical one.
2. **Accept a second hand-authored SVG renderer** for just these 2 of 12 frames (`lib/charts/svg/storm-timeline.ts` + `seasonal-radial.ts`, matching the pattern every OTHER non-bklit frame already uses — `rankedDeltaSvg`, `donutShareSvg`, `dotPlotSvg`, `sparkGridSvg`, `lineBandSvg`, `compositionSvg`, `zGaugeSvg`). Web frames stay on real recharts exactly as they render today, zero visual change. Breaks "one renderer" for these 2 frames only.
3. **Defer storm-timeline + seasonal-radial**, ship the other 10/12 now (Tasks 7-8, corridor-scatter via ECharts, are architecturally unrelated to this recharts/bklit problem and can proceed independently). storm-timeline already has its own known separate live-data dependency (env-swfl's per-storm emit hasn't shipped), so deferring it isn't a regression either way.

Whichever is chosen, Task 5's brief (Steps 3-9) and Task 6's brief need to be rewritten before re-attempting — the current text will always reproduce this exact `null` result.

## Uncommitted work — one thing to know, low-stakes

Task 5's Steps 0-1 (`git mv lib/email/spec-to-png.ts lib/email/spec-to-png.tsx`, and extracting `TimelineChartCore` out of `TimelineFrame.tsx`) were completed and verified clean (tsc-clean) twice across two implementer attempts, sitting uncommitted in the working tree by design (pending the Steps 3-9 decision above).

**Between my last check and now, that uncommitted work is gone from the working tree** — `lib/email/spec-to-png.ts` is back (not renamed), `TimelineFrame.tsx` has no `TimelineChartCore`. Root cause: `git reflog` shows a `rebase (start): checkout origin/main` / `rebase (finish)` sequence landed on this shared `main` checkout (almost certainly another concurrent session running `node scripts/safe-push.mjs`, which stashes-and-rebases). I checked all 13 stash entries (`git stash list`) for my changes — not there; they weren't stashed, just overwritten/discarded by whatever ran the rebase.

**This is not actually a loss in practice** — both changes are pure mechanical transcription of code that's still sitting verbatim in the plan doc (`docs/superpowers/plans/2026-07-11-chart-picker-parity.md`, Task 5's "Step 0" and "Step 1" sections, confirmed intact, 12 references to `TimelineChartCore` still present). Redoing Steps 0-1 is under a minute of work once you're ready to resume Task 5. Flagging the mechanism (uncommitted work on a shared, non-worktree `main` is at risk from any other session's push/rebase flow) as worth remembering, not as an emergency.

## Not started — Tasks 7, 8, 9

- Task 7: crawl4ai research spike (RULE 0.4) verifying ECharts' SSR (`ssr: true` + `renderToSVGString()`) API before writing any corridor-scatter code. Not started. Independent of the Task 5/6 recharts-bridge problem — different chart library entirely.
- Task 8: corridor-scatter renderer, contingent on Task 7's findings. Not started.
- Task 9: full regression + close the check. Not started.

## Live parallel-session landscape (why `main` keeps moving under you)

This build has run entirely on `main`, no worktree (no file overlap with other work when the plan was written — that assumption held for Tasks 1-4 but NOT for Task 5, see below). Observed concurrently active sessions today, at various points:
- `8aee7077` — deliverable-coherence-gate, worktree `bp-deliverable-coherence-gate`. Held claims on `reshape-chart-type.ts`/`spec-to-png.ts`/`.test.ts` files for 50+ min at one point (resolved on its own — see claim-mechanism note below). Its branch was still pre-Task-3/4 (merge-base `f32e71b4`) as of the last check — **will need to rebase onto this build's Tasks 3/4 before merging**, and per Ricky's own earlier correction, deliverable-coherence-gate's spec touches `build-doc.ts`/`chart-coherence.ts` in its own doc text but its actual implementation is ALSO touching `reshape-chart-type.ts`/`spec-to-png.ts` directly — more overlap than the spec text implied.
- `ea04e1be` — unknown plan, touched `refinery/render/speaker.mts`/`.test.mts` and briefly claimed `spec-to-png.tsx`.
- Desk-geo/robots session(s), an Airtable-checks-mirror build, a data-contracts-doctor spec session, a homes-only-sold-median session — all landed commits on `main` during this build's run (visible in `git log --oneline -20`).

**Claim-mechanism reality check** (in case it comes up again): the `repolith: ... is being edited by another active session` errors are NOT the `repolith` npm CLI (checked — no `claim` subcommand exists there or in its MCP surface). It's a harness-level, **TTL/auto-expiring** lock, not something with a real "release" command — waiting resolved both blocks encountered in this build without any override actually being exercised, even after explicit operator authorization to override was given. If it blocks again: wait, don't hunt for a release verb that doesn't exist.

## Push recommendation

**Don't push yet.** `main` right now carries this build's 5 commits interleaved with ~15+ commits from at least 4-5 other concurrent sessions (checks/Airtable-mirror work, speaker refactor, desk-geo, data-contracts-doctor spec, etc.) — none of which are staged/reviewed as part of THIS build, and bundling them into a push is exactly the "ask before bundling foreign commits" situation the operator's standing rules call out. When this build (or the next session) is ready to push, surface the full interleaved commit range to Ricky first rather than pushing reflexively.
