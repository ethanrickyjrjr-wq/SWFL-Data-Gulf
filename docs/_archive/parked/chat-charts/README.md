# CHAT CHARTS — WE ARE NOT WORKING ON THIS RIGHT NOW

Parked 2026-07-02 (operator decree). This folder holds every plan/spec for building MORE chart
capability *inside the assistant chat surface* (BriefcaseChat / `/api/assistant` / highlighter
popups) — new shapes, the "Chart Ideas" discovery surface, as-of anchoring in `buildChartForIntent`.
None of it is being built. Do not resume without an explicit operator go-ahead.

This is a **different dead end than the MCP chat-chart widget** (`mcp-widget/PARKED.md`), which is
parked for an unrelated reason — a confirmed claude.ai host bug that blanks the iframe. That one
is blocked on Anthropic; this folder is blocked on operator priority.

Existing chart features already shipped (bar/table via `compose-chart.ts`, the four-lane
held/web/upload/user sourcing, the `/charts` page, email/PDF chart rendering) are UNCHANGED and
keep working — this park is scoped to *new* chat-chart build work only.

## What's in here

- `charts-dynamic-capability.md` — the original (stale, superseded-by-the-next-file) backlog note
  proposing a paywalled "any chart" capability.
- `2026-06-28-chart-ideas-and-dynamic-charts-handoff.md` — the current handoff: extend
  `compose-chart.ts` to line/scatter/composition/donut/radial + a proactive "Chart Ideas" chip
  surface. Check `generic_chart_capability` (open, left open — this file move doesn't close it).
- `2026-06-10-chart-as-of-anchoring.md` — every `buildChartForIntent` builder should carry `asOf`
  + render a bottom caption. Check `chart_asof_anchoring` (open, left open).

## Re-open

Move these back under `docs/superpowers/plans/` / `docs/superpowers/specs/` and re-read
RULE 3.5 (brainstorm + crawl4ai research first) before resuming.
