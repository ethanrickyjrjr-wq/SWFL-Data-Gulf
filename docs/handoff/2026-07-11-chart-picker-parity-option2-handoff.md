# Chart Picker Parity — Tasks 5/6 (storm-timeline + seasonal-radial) via Option 2 — Handoff

**Status: DONE (renderer + picker), committed LOCALLY, nothing pushed.**
Continues `docs/handoff/2026-07-11-chart-picker-parity-handoff.md` (the "blocked on the recharts-SSR wall" handoff). That wall is resolved — the operator chose **Option 2**.

## The decision (Option 2, operator-confirmed)

Keep every live web chart on **real recharts, untouched**; render a hand-authored **SVG twin** for the email PNG. This is the only path that leaves the live charts unchanged — recharts genuinely cannot render in single-pass SSR (`MainChartSurface` needs a `useEffect` that never fires in `@react-email/render`), which is what blocked the original plan's "one renderer, two surfaces via `renderBklitStaticSvg`" premise for these two frames. Every other non-bklit frame (`dot-plot`, `composition`, `z-gauge`, …) already uses this exact hand-authored-SVG pattern; storm-timeline + seasonal-radial now join it.

`components/charts/registry/frames/TimelineFrame.tsx` and `components/charts/SeasonalRadialChart.tsx` are at HEAD — **the live web charts were not changed.** That was the actual ask.

## What's done

- **`lib/charts/svg/storm-timeline.ts`** — vertical-column twin of the live recharts BarChart (white canvas, dashed gridlines, USD ticks, rotated Y-label, angled "{event} {year}" labels, max column full accent + others at 60%, optional dashed-blue baseline line). Rendered to PNG + eyeballed: faithful.
- **`lib/charts/svg/seasonal-radial.ts`** — concentric-ring twin of the live recharts RadialBarChart (dark slate canvas, amber title, teal/sky/amber rings on `#1e293b` tracks, highest corridor outermost, value labels + a right-side legend for the no-hover email medium). Rendered + eyeballed: faithful.
- **Render wiring** — both `case "storm-timeline"` / `case "seasonal-radial"` live in **`lib/charts/spec-to-image.ts`** (the SVG dispatch was moved there from `lib/email/spec-to-png.ts` by a parallel refactor mid-session; `spec-to-png.ts` is now a thin email-hosting wrapper that re-exports `chartSpecToEmailSvg`). Both cases survived that move.
- **Picker wiring** — `lib/email/reshape-chart-type.ts`: added both to `CHART_TYPE_OPTIONS` ("Event timeline" / "Seasonal rings") and a **passthrough-only** `chartTypeFits` case for each (mirrors z-gauge).
- **Tests** — `storm-timeline.test.ts`, `seasonal-radial.test.ts`, extended `spec-to-png.test.ts` (routing) + `reshape-chart-type.test.ts` (passthrough). **47 pass, 0 fail.** `bunx next build` green (twice).

## VERIFIED facts a next session should not re-litigate

- **seasonal-radial angle domain = `[0, dataMax]`, NOT nice-widened.** I first guessed a nice-ceiling (85→100); WRONG. Verified against `node_modules/recharts` v3.9.0 source: `state/selectors/axisSelectors.js` → `combineAxisDomainWithNiceTicks` explicitly EXCLUDES the `angleAxis` (its own code comment: *"Angle axis … doesn't use nice ticks for extending domain like all the other axes do"*). So the **max-value ring closes the full 360°**; others are proportional to that max. See the `domainMax` comment in `seasonal-radial.ts`.
- **storm-timeline bar domain = `dataMax * 1.15`** — matches `TimelineFrame`'s real recharts `YAxis domain`.
- Ring geometry (recharts RadialBarChart): `maxRadius = min(w,h)/2`, `innerRadius 10%`, `outerRadius 92%`, radius band scale over N rings, `barSize 11`, sweep `startAngle 180°` clockwise. All source-derived.

## PASSTHROUGH-ONLY — read before "the picker option does nothing" gets re-filed

Neither frame can be honestly fabricated from a flat `(label, value)` list (no per-event date, no per-corridor snapshot), and **no live producer emits `storm-timeline` / `seasonal-radial` through `buildChartForQuestion` today** (2026-07-11). So in the Email Lab picker, selecting either currently falls back to "showed a bar instead" until a producer emits that frameId. This is the plan's own MOAT rule (never fabricate), not a bug. The renderer + gate are correct and forward-compatible.

## NOT done

- **storm-timeline live data** — needs env-swfl's per-storm `detail_table` emit (known separate dependency; the frame is fixture-bound today, per its own header comment).
- **Tasks 7–8 (corridor-scatter via ECharts SSR)** — not started; architecturally unrelated to the recharts wall. `corridor-scatter` is in `ChartType` but NOT in `CHART_TYPE_OPTIONS` and has no `chartTypeFits` case yet.
- **Task 9** — full regression + close the `chart_picker_parity_live_verify` check. NOT done.

## Commits (all LOCAL on `main`, NOTHING pushed)

- `26efb798` — the two SVG builder files (committed by a concurrent session; shared-lineage work).
- `6034a5d3` — email render wiring + builder/routing tests.
- `481d6e52` — seasonal-radial domain fix (`[0,dataMax]`, revert the nice-ceiling guess).
- `0a4b40b7` — picker wiring (`CHART_TYPE_OPTIONS` + passthrough `chartTypeFits`).

## Push recommendation — DON'T push blind

`main` carries these 4 commits interleaved with ~15 commits from at least 4–5 other concurrent sessions (speaker refactor, spec-to-image refactor, Airtable-mirror, data-contracts-doctor, homes-only-sold-median, etc.). Per Ricky's standing "ask before bundling foreign commits" rule, surface the full interleaved range to him before any push. A `SESSION_LOG.md` entry is needed before push (RULE 0); the range already contains other sessions' SESSION_LOG touches, so the pre-push hook is satisfied, but add a proper entry for THIS work when the push range is agreed.

## Parallel-session notes (why files kept moving)

- Released two **zombie TTL claims** to finish (harness-level auto-expiring locks, not the repolith npm CLI): `5ff6248a` on `seasonal-radial.ts`, `12be6e62` on `spec-to-png.test.ts`. Both were superseded SSR sessions the operator confirmed stopped. Release verb: `bun run C:/Users/ethan/dev/ws/src/cli.ts claim release --file <path>`.
- Earlier I reverted the abandoned SSR approach's uncommitted working-tree work (`TimelineChartCore` extraction in `TimelineFrame.tsx` + the `spec-to-png.ts→.tsx` rename). That approach is moot under Option 2; the code is verbatim in the plan doc if ever needed.
