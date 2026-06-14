# Phase 6 — Brand theming (white-label upsell) · SONNET · last; needs Phase 2 + 3

> **Contract (inherited):** own ChartSpec registry; per-visual as-of; NO `git push`. Depends on
> **Phase 2a** (`ChartSpec.theme` token) + **Phase 3** (the project to theme).

## Why
"Your brand on the report" — the upsell that justifies a higher paid tier. Cheap because color is a
theme token resolved at render, not baked into each chart (the whole point of the declarative spec).

## Task
- **Per-project theme:** primary + accent color + logo URL on the project; resolve through
  `ChartSpec.theme` at render time in `FrameRenderer` + the `/p/[id]` page chrome. One theme flows to
  every frame — no per-chart edits.
- Apply the logo to the `/p/[id]` page header and the PDF cover (Phase 4 surface).
- Keep it a render-time concern: changing the theme must NOT require re-binding data or re-running the
  assembly build.

## Explicitly DEFERRED (do not build now)
- **Per-element color picker** (recolor one bar / one series) — medium UI; only on customer request.

## Acceptance
- Set a project's primary/accent/logo → `/p/[id]` and its PDF reflect the brand across all frames.
- Switching theme re-renders without a rebuild; `tsc` clean.

## Wrap
Commit locally. SESSION_LOG + build-queue. Update README status row 6. **No push.**
