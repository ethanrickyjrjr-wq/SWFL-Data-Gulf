# J4 — Charts Tier A: reconcile + verify (NO build)

> **Preamble:** Read `SESSION_LOG.md` then `CLAUDE.md` (RULE 0). **Do not `git push` without
> operator confirmation.** Work on `main` — no branches/PRs.

**Phase:** any · **Depends on:** nothing · **Parallel:** fully independent.
**Model: 🟢 SONNET-FINE** — verify + flip a tracker, no build.

## Why this is reconcile-only
Charts Tier A is **already built and committed** — `557edf0 feat(charts): Tier A producer + ONE
auto chart on /r/ + dossier availability`. The build queue still shows it open; the tracker is
stale, not the work. **Do not rebuild any of it.** As-built (verified):

| Piece | Location |
|---|---|
| `computeMetricChart(output): ChartBlock \| null` | `refinery/lib/chart-from-metrics.mts` (complete) |
| `DisplayBrain.chart` + `sanitizeChart` | `refinery/render/speaker.mts:629` / `:638` |
| projection wires it | `toDisplayBrain` `speaker.mts:696` |
| dossier slot | `lib/fetch-brain.ts:179` + `buildDossier` `:207-210` |
| render | `<ReportChart>` `app/r/[slug]/page.tsx:162-187` |
| leak guard | `refinery/render/display-leak.test.mts` (whitelists `chart`) |

**As-built architecture note (record this):** the chart is **recomputed on-the-fly** from the
parsed OUTPUT in both `toDisplayBrain` and `buildDossier`. There is **no** ` ```chart ` block
persisted to the brain `.md` (`4-output.mts` has zero chart writes). This is cleaner than the
original plan's "persist a fenced block + parse it back" approach — it cannot drift from OUTPUT
and needed no Stage-4 or parser change. The original plan's chart Steps 1–7 are obsolete.

## Steps
1. **Verify render:** `npm run refinery -- master --target-only` (`--target-only` skips the
   cre-swfl egress hang). Start the dev server; open `/r/<slug>` for a brain that has a
   `grain:"zip"` detail_table (e.g. `env-swfl`, AAL-by-ZIP) and confirm a bar chart renders above
   Key metrics. Confirm `/api/b/<slug>?format=json` carries `chart` in the dossier.
2. **Leak check:** `bun test refinery/render/display-leak.test.mts` green (chart carries only
   labels + already-public numbers — no slug/brain_id/tier).
3. **Reconcile trackers (RULE 2 UPDATE):**
   - `_AUDIT_AND_ROADMAP/build-queue.md`: flip the "Charts Tier A" item to `[x]`.
   - If an open `checks` row covers Charts Tier A, `node scripts/check.mjs close <key>` with a
     note pointing at `557edf0`. `node scripts/check.mjs list` to find it.

## Acceptance
- One brain's chart renders at `/r/<slug>`; its dossier JSON carries `chart`.
- `display-leak.test.mts` green.
- build-queue marks Charts Tier A done; any Charts check closed.
