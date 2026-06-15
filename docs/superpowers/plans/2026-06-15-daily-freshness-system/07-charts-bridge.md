# 07 — Charts Bridge (fold into the EXISTING freshness branch)

> Build file for the Daily Freshness System. **Read `README.md` §3c (the locked `PulsePoint`/`MarketContext` contract) + §0 (three chart-anchor corrections).** This makes `/charts` stop reading "as of April 2026" by appending a fresher, **visually distinct dashed** "Weekly Pulse" point and putting a real dynamic freshness badge on every panel — plus the now-mandatory legal layer.

**Model:** Opus (plumbing) + Sonnet (UI/legal, in a worktree) · **Repo:** brain-platform · **Branch:** `claude/swfl-data-freshness-pipeline-w6pyim` (tip `925e125`) · **Wave:** 1 (parallel) · **Depends:** —

**Goal:** Fold the charts freshness work into the existing branch (do NOT create duplicate files), reconcile the two contradictory 2026-06-14 docs, and ship the dashed pulse + shared `FreshnessBadge` + `/terms` `/privacy` + report end-cap.

---

## RECONCILE FIRST — the two docs contradict; here's the ruling

- `2026-06-14-weekly-pulse-freshness-bridge.md` says **"new `data_lake.weekly_pulse` table + downloader cron."**
- `2026-06-14-freshness-sonnet-handoff.md` says **"read-through, no table, no cron."**
- **The handoff wins** (it's the later doc and matches this plan's MOAT/no-redundant-ingest stance). **KILL the separate `weekly_pulse` table.** The pulse reads **`data_lake.daily_truth`** (file 01); until `daily_truth` has rows, it **read-throughs the existing Redfin county tables** `data_lake.redfin_lee_market` / `redfin_collier_market` as the **v1 stopgap** (verified: `property_type='All Residential'`, latest `period_end` → Lee ≈ $360,000 / Collier ≈ $625,000 as of 2026-05-31). One provider, one fallback order: `daily_truth` → Redfin read-through → empty.

## §0 chart corrections (do NOT repeat the docs' stale claims)

- **`dash` is already wired** into `<Line strokeDasharray={s.dash ? s.dash : undefined}>` (`ZHVIAreaChart.tsx:382`) — do **not** "add dash support." The pulse series just **sets `dash`** (e.g. `"6 4"`). **But** the dash only renders in the **`line`** variant; the Home-Values panel may be the **`area`** variant (uses `<Area>`, no dash) → render the pulse as a **separate dashed `<Line>`/dot series overlaid on the area panel**, or switch that panel's pulse overlay to a line. Verify the panel's `variant` before coding.
- **The chart component is `MetroAreaChart`** (`ZHVIAreaChart` is a back-compat alias) — edit `components/charts/ZHVIAreaChart.tsx` but reference the real export.
- **`app/charts/page.tsx` has 6 loaders** in one `Promise.all` — add a **7th** (`loadPulse`). `createServiceRoleClient` is imported from **`@/utils/supabase/service-role`** (not `lib/supabase`).
- **`FreshnessBadge` (welcome) uses `parseFreshnessDate` from `lib/welcome/frames`, not `asOfFromToken`.** Both date helpers exist; the **shared** badge should accept `token` (format via `asOfFromToken` from `@/lib/project/as-of`) **or** `asOf`/`label`. When re-pointing the welcome usage, keep its behavior identical (it must still show the token verbatim — that's the freshness proof).

---

## Split of work — ZERO overlapping files (from the handoff, kept)

### MAIN CLAUDE (Opus) owns — plumbing (do not let Sonnet touch)
`lib/charts/pulse-provider.ts` (new), `app/charts/page.tsx` (edit: 7th loader + placing Sonnet's components), `components/charts/ZHVIAreaChart.tsx` (edit: the dashed pulse series/tooltip/footnote), `lib/charts/pulse-provider.test.ts` (new). **No `app/api/probe` stub unless the operator wants the visual "Update to Today" button — it's MOAT-gated and deferred (99).**

### SONNET owns — UI / CSS / Legal (all NEW except two edits), in a worktree
| File | Action |
|---|---|
| `components/FreshnessBadge.tsx` | **NEW** shared badge (generalize welcome's; props below) |
| `components/charts/MortgageRateStat.tsx` | **NEW** tiny stat (`{ rate, asOf }`) |
| `components/reports/ReportEndCap.tsx` | **NEW** Colliers-style report footer |
| `app/terms/page.tsx`, `app/privacy/page.tsx` | **NEW** legal pages |
| `components/landing/Footer.tsx` | **EDIT** add the one micro-footer line |
| `app/r/zip-report/[zip]/page.tsx` | **EDIT** drop `<ReportEndCap/>` at the very bottom only |
| `app/welcome/_components/FreshnessBadge.tsx` + `AnswerBlock.tsx` | **EDIT** re-point to the shared component (behavior identical) |

**Hard rule (handoff):** Sonnet does NOT edit `app/charts/page.tsx` or `ZHVIAreaChart.tsx`. If Sonnet thinks it must, STOP and leave a `SESSION_LOG.md` note.

---

## Task 1 — Pulse provider (Opus, TDD)

- [ ] **Step 1.1: Write `lib/charts/pulse-provider.test.ts`** (`bun:test`, follow `lib/charts/pivoted-series.test.ts`): latest-per-area selection; `daily_truth` rows preferred over the Redfin read-through; county→chartKey map (Lee→`cape_coral`, Collier→`naples`); vendor/live_search/approx `sourceTag` passthrough; `null`/empty → `{ pulsePoints: [], mortgage: null }`; appended only when pulse `periodEnd` > vendor ZHVI `asOf`.

- [ ] **Step 1.2: Implement `lib/charts/pulse-provider.ts`** → returns the locked `MarketContext` (README §3c). `loadPulse(supabase)`:
  1. try `data_lake.daily_truth` (`metric_key='median_sale_price'`, latest period per area) → `PulsePoint[]`;
  2. else read-through `data_lake.redfin_lee_market`/`redfin_collier_market` (`property_type='All Residential'`, latest `period_end`) → map Lee→`cape_coral`, Collier→`naples`, `sourceTag:"vendor"`, `sourceName:"Redfin County Market Tracker"`, `sourceUrl:"https://www.redfin.com/news/data-center/"`;
  3. mortgage from `data_lake.daily_truth` (`metric_key='mortgage_30yr_fixed'`) else FRED latest.
  **`try/catch → { pulsePoints: [], mortgage: null }`** so a missing table never reddens `next build`. Carry the serializable shape only (no function props).

- [ ] **Step 1.3:** `bun test lib/charts/pulse-provider.test.ts` → green.

---

## Task 2 — Chart wiring (Opus)

- [ ] **Step 2.1: `app/charts/page.tsx`** — add `loadPulse(supabase)` as the 7th item in the `Promise.all`; in a pure testable helper append pulse points as **distinct keys** (`pulse_cape_coral`/`pulse_naples`) **only when** pulse `periodEnd` > the Home-Values `asOf`; pass merged `series` + `data` + a **serializable `pulseMeta`** prop + the freshness token to the panel. Render Sonnet's `<FreshnessBadge>` (real `asOf`/token) and `marketContext.mortgage && <MortgageRateStat .../>` in the chart header.

- [ ] **Step 2.2: `components/charts/ZHVIAreaChart.tsx` (`MetroAreaChart`)** — add a pulse `ChartSeriesDef` with `dash:"6 4"`, a distinct color, label `"Weekly Pulse"`. Because dash renders only in the `line` variant, render the pulse as its own dashed `<Line>` (or a single emphasized dot) layered on the panel even when the base panel is `area`. Tooltip branch keyed off `pulseMeta`: `"Weekly Pulse — Redfin median sale price, rolling 4-wk"` (or live-search source) + source; source footnote (`sourceName` + `sourceUrl`) near the caption. Keep `valueFormat="usd"`.

- [ ] **Step 2.3: Honesty check (MOAT).** ZHVI (smoothed home-value index) ≠ Redfin median **sale** price — **always** a distinct dashed series with its own label + source footnote, **never** a recolored ZHVI continuation. The legend must let the user toggle it.

---

## Task 3 — Sonnet's UI/legal (worktree)

- [ ] **Step 3.1:** `node scripts/worktree.mjs new charts-legal` (RULE 1.5 — Sonnet works in `../bp-charts-legal`).
- [ ] **Step 3.2: `components/FreshnessBadge.tsx`** — generalize welcome's. Props (all serializable; `"use client"` only if it carries the optional "Update to Today" pill, which is **deferred/off by default**):

```ts
export type FreshnessBadgeProps = {
  token?: string;   // → asOfFromToken(token) from "@/lib/project/as-of"
  asOf?: string;    // pre-formatted/ISO when no token
  label?: string;   // e.g. "Redfin · May 2026"
  note?: string;
};
```
Keep the teal `#0a8078` pill + dot. Re-point `app/welcome/_components/FreshnessBadge.tsx` + `AnswerBlock.tsx` to it **without changing welcome behavior** (welcome still shows the token verbatim via its existing `parseFreshnessDate` path — the shared component must reproduce that, e.g. accept the token and render it as a `<code>`).

- [ ] **Step 3.3:** `MortgageRateStat({ rate, asOf })`, `ReportEndCap` (renders **once** at the very bottom of the ZIP report only), `/terms` (full Colliers-style "deemed reliable… cannot guarantee… consult advisors" + the live-probe disclaimer), `/privacy`, and the micro-footer line in `components/landing/Footer.tsx`:
  `© 2026 SWFL Data Gulf. Information from reliable sources but not guaranteed. [Full Disclaimer & Terms](/terms)`
- [ ] **Step 3.4: Token hygiene.** Disclaimer text lives in static UI ONLY — never injected into the AI system prompt/chat context (grep the chat path stays clean).

---

## Task 4 — Verify + ship

- [ ] **Step 4.1:** `npm run build` green (`/charts` prerenders, pulse degrades to empty if `daily_truth`/Redfin absent; `/terms` `/privacy` prerender; `/r/zip-report/[zip]` builds with the end-cap). ESLint clean (watch `react-hooks/set-state-in-effect`).
- [ ] **Step 4.2: Eyeball `/charts`:** a real dynamic "as of" (no hardcoded April); a distinct **dashed** "Weekly Pulse" point past the last ZHVI month with a source footnote; mortgage stat; micro-footer → `/terms`; report end-cap once at the bottom.
- [ ] **Step 4.3: Ship on the branch** (not a PR unless asked): explicit-path staging, `SESSION_LOG.md` entry, `node scripts/safe-push.mjs` to `claude/swfl-data-freshness-pipeline-w6pyim`. Sonnet's worktree lands via `node scripts/worktree.mjs land charts-legal` then `git push origin HEAD:<branch>` (NOT to `main` directly while this is branch work).

---

## Definition of Done

- The separate `weekly_pulse` table is **not** created; the pulse reads `daily_truth` with a Redfin read-through stopgap.
- `/charts` shows a dynamic "as of" + a visually distinct dashed pulse series (ZHVI ≠ median sale price, own label + source footnote), and a freshness badge on each panel.
- `/terms` + `/privacy` + micro-footer + report end-cap ship; token hygiene preserved.
- `bun test lib/charts/` green; `npm run build` green.
- **Board row:** `07-charts` GREEN — `/charts` is visibly fresh and honest.
